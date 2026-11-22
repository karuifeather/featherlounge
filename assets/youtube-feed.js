'use strict';
// The signed-in YouTube "What to watch" feed: fetch it through InnerTube, then pull items out of
// its deeply nested response into plain {title, items} shelves.

const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false';
const YT_CONTEXT = {
  client: {
    clientName: 'TVHTML5',
    clientVersion: '7.20240724.13.00',
    hl: 'en',
    gl: 'US',
  },
};
const HOME_BROWSE_ID = 'FEwhat_to_watch';

const MAX_SECTION_PAGES = 2; // extra pages of shelves
const MAX_SHELF_PAGES = 2; // extra pages of videos per shelf
const SHELVES_TO_EXTEND = 6;
const MAX_SHELF_ITEMS = 30;
const FALLBACK_SHELF_TITLES = [
  'Recommended for you',
  'Keep exploring',
  'More to watch',
  'Picked for you',
  'Worth a look',
  'Because you watch',
];

const LOGIN_CARD = [
  {
    src: 'login',
    title: 'Sign in to YouTube',
    by: 'Personalized recommendations from your account',
    desc: 'Use the code flow on your phone — videos still open in SmartTube.',
  },
];

// ---------- request ----------
async function browse(body, alreadyRetried) {
  const token = await accessToken();
  const headers = {
    Authorization: 'Bearer ' + token,
    'User-Agent': TV_USER_AGENT,
    ...JSON_HEADERS,
  };
  const response = await http('POST', BROWSE_URL, headers, JSON.stringify({ context: YT_CONTEXT, ...body }));
  if (response.status === 401 && !alreadyRetried) {
    await accessToken(true);
    return browse(body, true);
  }
  if (response.status !== 200) throw new Error('feed ' + response.status);
  return JSON.parse(response.text);
}

// ---------- parsing ----------
const textOf = (node) => (node && (node.simpleText || (node.runs && node.runs.map((run) => run.text).join('')))) || '';
const isSeparator = (text) => !text || text === '•';
const continuationToken = (node) => node?.continuations?.[0]?.nextContinuationData?.continuation;

const isVideoId = (id) => /^[\w-]{11}$/.test(id);

function tileVideoId(tile) {
  return tile.contentId || tile.onSelectCommand?.watchEndpoint?.videoId;
}

function tileSubtitle(metadata) {
  const lines = (metadata.lines || []).map((line) => {
    const fields = line.lineRenderer?.items;
    if (!fields) return '';
    return fields
      .map((field) => textOf(field.lineItemRenderer?.text))
      .filter((text) => !isSeparator(text))
      .join(CHIP_SEPARATOR);
  });
  return lines.filter(Boolean).join(META_SEPARATOR);
}

function tileDurationText(tile) {
  const overlays = tile.header?.tileHeaderRenderer?.thumbnailOverlays || [];
  const timeOverlay = overlays.map((overlay) => overlay.thumbnailOverlayTimeStatusRenderer).find(Boolean);
  return timeOverlay ? textOf(timeOverlay.text) : '';
}

function tileToItem(tile) {
  const id = tileVideoId(tile);
  const isVideo = !tile.contentType || tile.contentType === 'TILE_CONTENT_TYPE_VIDEO';
  if (!id || !isVideo || !isVideoId(id)) return null;
  const metadata = tile.metadata?.tileMetadataRenderer || {};
  return {
    src: 'yt',
    id,
    title: textOf(metadata.title) || 'Video',
    by: tileSubtitle(metadata),
    durText: tileDurationText(tile),
    ...youtubeThumbs(id),
    desc: '',
  };
}

// Walks arrays/objects and hands `onMatch` the value of `key` wherever it appears (without descending into it).
function visitNodes(node, key, onMatch) {
  if (Array.isArray(node)) {
    node.forEach((child) => visitNodes(child, key, onMatch));
  } else if (node && typeof node === 'object') {
    if (node[key]) onMatch(node[key]);
    else Object.values(node).forEach((child) => visitNodes(child, key, onMatch));
  }
}

// Appends every not-yet-seen video tile found under `node` to `items`.
function collectTiles(node, items, seen) {
  visitNodes(node, 'tileRenderer', (tile) => {
    const item = tileToItem(tile);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  });
}

// Appends {title, items, tok} for every shelf under `node` that has at least one new video.
function collectShelves(node, seen, shelves = []) {
  visitNodes(node, 'shelfRenderer', (renderer) => {
    const items = [];
    collectTiles(renderer.content, items, seen);
    if (items.length)
      shelves.push({
        title: textOf(renderer.headline) || textOf(renderer.title),
        items,
        tok: continuationToken(renderer.content?.horizontalListRenderer),
      });
  });
  return shelves;
}

// ---------- paging ----------
// Follows continuation tokens for up to `maxPages`, handing each page to `onPage`. Stops quietly on any failure.
async function followContinuations(startToken, pageKey, maxPages, onPage) {
  let token = startToken;
  for (let i = 0; i < maxPages && token; i++) {
    try {
      const json = await browse({ continuation: token });
      const page = json.continuationContents?.[pageKey];
      if (!page) break;
      onPage(page);
      token = continuationToken(page);
    } catch (e) {
      break;
    }
  }
}

async function fetchFeed() {
  if (!(await accessToken())) return null;
  const seen = new Set();
  const root = await browse({ browseId: HOME_BROWSE_ID });
  const shelves = collectShelves(root, seen);
  if (!shelves.length) throw new Error('empty feed');

  const sectionList =
    root.contents && root.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer;
  await followContinuations(continuationToken(sectionList), 'sectionListContinuation', MAX_SECTION_PAGES, (page) =>
    collectShelves(page.contents, seen, shelves),
  );

  await Promise.all(
    shelves
      .slice(0, SHELVES_TO_EXTEND)
      .map((feedShelf) =>
        followContinuations(feedShelf.tok, 'horizontalListContinuation', MAX_SHELF_PAGES, (page) =>
          collectTiles(page.items, feedShelf.items, seen),
        ),
      ),
  );

  shelves.forEach((feedShelf, i) => {
    feedShelf.title = feedShelf.title || FALLBACK_SHELF_TITLES[i % FALLBACK_SHELF_TITLES.length];
    delete feedShelf.tok;
  });
  return shelves;
}

// ---------- rows ----------
// All feed rows share one in-flight request (and the cache), so the page only fetches the feed once.
let feedInFlight = null;
const loadFeed = () =>
  feedInFlight ||
  (feedInFlight = cached(FEED_CACHE_KEY, fetchFeed).finally(() => {
    feedInFlight = null;
  }));

// Row loader for the n-th feed shelf. Shows a sign-in card while signed out, and skips rows with no data.
async function shelf(n) {
  if (!auth.get()) {
    if (n === 0) return LOGIN_CARD;
    throw SKIP_ROW;
  }
  try {
    const feed = await loadFeed();
    const feedShelf = feed[n];
    if (!feedShelf) throw SKIP_ROW;
    const items = feedShelf.items.slice(0, MAX_SHELF_ITEMS);
    items.title = feedShelf.title;
    return items;
  } catch (e) {
    if (e && e.auth) rebuildAll(); // the token was revoked: rebuild so the sign-in card appears
    throw e;
  }
}
