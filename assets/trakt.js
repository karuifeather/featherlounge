'use strict';
// Trakt (optional; needs a Trakt API app in the build, see docs/trakt.md): links the viewer's watch history so rows can
// say "because you watched X", show Trakt's own recommendations and watchlist, and hide what has been seen.
// Sign-in is Trakt's device-code flow (a code entered on a phone), the same shape as the YouTube one in youtube-auth.js.

const TRAKT_API = 'https://api.trakt.tv';
const TRAKT_AUTH_KEY = 'fl.trakt';
const TRAKT_CACHE_PREFIX = 'trakt/'; // everything cached for the linked account, wiped on unlink
const TRAKT_WATCHED_KEY = TRAKT_CACHE_PREFIX + 'watched';
const TRAKT_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const TRAKT_LIST_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRAKT_SEED_POOL = 8; // how many recent titles "Because you watched" rotates through
const TRAKT_EXPIRY_MARGIN_MS = 60 * 1000;
const TRAKT_SLOW_DOWN_MS = 5000;
const TRAKT_POLL_FAILURES = { 404: 'invalid code', 409: 'code already used', 410: 'code expired', 418: 'denied' };

// A client secret is optional: apps registered for PKCE have none, and device sign-in and refresh work without it.
const traktEnabled = () => !!CFG.traktId;
const traktClient = () => ({ client_id: CFG.traktId, ...(CFG.traktSecret && { client_secret: CFG.traktSecret }) });

const traktAuth = {
  get: () => storage.read(TRAKT_AUTH_KEY),
  set: (tokens) => storage.write(TRAKT_AUTH_KEY, tokens),
  clear() {
    storage.remove(TRAKT_AUTH_KEY);
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(TRAKT_CACHE_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      /* storage unavailable */
    }
  },
};

const traktLinked = () => traktEnabled() && !!traktAuth.get();

// ---------- requests ----------
// Goes through http() (native in the app): Trakt needs custom headers, which would force a CORS preflight in the page.
function traktRequest(method, path, body, token) {
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': CFG.traktId,
    'User-Agent': 'FeatherLounge',
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  return http(method, TRAKT_API + path, headers, body ? JSON.stringify(body) : undefined);
}

const parseReply = (response) => {
  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return {};
  }
};

const storeTokens = (reply) =>
  traktAuth.set({
    access: reply.access_token,
    refresh: reply.refresh_token,
    exp: Date.now() + reply.expires_in * 1000,
  });

// A valid access token (refreshed when needed), or null when not linked. A refused refresh means the link was revoked.
async function traktAccess(forceRefresh) {
  const tokens = traktAuth.get();
  if (!tokens) return null;
  if (!forceRefresh && Date.now() < tokens.exp - TRAKT_EXPIRY_MARGIN_MS) return tokens.access;
  const response = await traktRequest('POST', '/oauth/token', {
    refresh_token: tokens.refresh,
    ...traktClient(),
    redirect_uri: TRAKT_REDIRECT_URI,
    grant_type: 'refresh_token',
  });
  const reply = parseReply(response);
  if (response.status === 200 && reply.access_token) {
    storeTokens(reply);
    return reply.access_token;
  }
  if (response.status >= 400 && response.status < 500) {
    traktAuth.clear();
    throw SKIP_ROW;
  }
  throw new Error('trakt token ' + response.status);
}

async function traktGet(path) {
  let response = await traktRequest('GET', path, null, await traktAccess());
  if (response.status === 401) response = await traktRequest('GET', path, null, await traktAccess(true));
  if (response.status !== 200) throw new Error('trakt ' + response.status);
  return JSON.parse(response.text);
}

const traktCached = (path) => cached(TRAKT_CACHE_PREFIX + path, () => traktGet(path));

// ---------- items ----------
// Trakt has no artwork, but Stremio's public image service serves it from the IMDb id.
const METAHUB = 'https://images.metahub.space/';
const metahubImage = (kind, imdb) => METAHUB + kind + '/medium/' + imdb + '/img';

function traktToItem(entry, type) {
  const imdb = entry && entry.ids && entry.ids.imdb;
  if (!imdb || !entry.title) return null;
  return {
    src: 'st',
    id: imdb,
    tmdb: entry.ids.tmdb,
    type,
    title: entry.title,
    by: [entry.year, entry.rating && '★ ' + entry.rating.toFixed(1)].filter(Boolean).join(META_SEPARATOR),
    img: metahubImage('poster', imdb),
    bg: metahubImage('background', imdb),
    desc: entry.overview || '',
  };
}

// Trakt wraps entries as {movie: {...}} or {show: {...}} on sync endpoints, and returns bare objects on others.
const unwrap = (entry, type) => entry[type === 'movie' ? 'movie' : 'show'] || entry;

function toItems(entries, type, title) {
  const items = (entries || [])
    .map((entry) => traktToItem(unwrap(entry, type), type))
    .filter(Boolean)
    .slice(0, TRAKT_LIST_SIZE);
  if (!items.length) throw Object.assign({}, SKIP_ROW, { why: 'empty: entries=' + (entries || []).length + ' keys=' + Object.keys((entries && entries[0]) || {}).join(',') });
  if (title) items.title = title; // showItems() renames the row to this
  return items;
}

const typeNoun = (type) => (type === 'movie' ? 'movies' : 'shows');
const needsLink = () => (traktLinked() ? Promise.resolve() : Promise.reject(SKIP_ROW));
const episodeLabel = (episode) => episode && 'S' + episode.season + 'E' + episode.number;

// Lists anyone can see (trending, popular, ...): no sign-in, cached under a prefix that unlinking leaves alone.
const traktPublic = (path) => cached('tp/' + path, () => traktGet(path));
const publicList = (path, type, title) => () =>
  traktPublic(path + (path.includes('?') ? '&' : '?') + 'extended=full&limit=' + TRAKT_LIST_SIZE).then((entries) =>
    toItems(entries, type, title),
  );

// Trakt's own recommendations: it weighs everything you have watched, rated and collected.
const traktRecommended = (type) => () =>
  needsLink().then(() =>
    traktCached(
      '/recommendations/' + typeNoun(type) + '?extended=full&ignore_collected=true&limit=' + TRAKT_LIST_SIZE,
    ).then((entries) => toItems(entries, type)),
  );

// Recently watched titles, newest first, one entry per title.
async function recentSeeds(type) {
  const history = await traktCached('/sync/history/' + typeNoun(type) + '?limit=60');
  const seen = new Set();
  const seeds = [];
  history.forEach((entry) => {
    const seed = unwrap(entry, type);
    const id = seed && seed.ids && seed.ids.trakt;
    if (!id || seen.has(id)) return;
    seen.add(id);
    seeds.push(seed);
  });
  return seeds.slice(0, TRAKT_SEED_POOL);
}

// "Because you watched <one of your recent titles>". Which one changes daily, and `slot` keeps rows distinct.
const traktBecause = (type, slot) => () =>
  needsLink().then(async () => {
    const seeds = await recentSeeds(type);
    if (seeds.length <= slot) throw SKIP_ROW;
    const seed = seeds[(Math.floor(Date.now() / DAY_MS) + slot) % seeds.length];
    const related = await traktCached(
      '/' + typeNoun(type) + '/' + seed.ids.trakt + '/related?extended=full&limit=' + TRAKT_LIST_SIZE,
    );
    return toItems(related, type, 'Because you watched ' + seed.title);
  });

const withNote = (item, note) => (item.by = [note, item.by].filter(Boolean).join(META_SEPARATOR)) && item;

// Started but not finished: movies and episodes with saved progress.
const traktContinue = () =>
  needsLink().then(async () => {
    const [movies, episodes] = await Promise.all([
      traktCached('/sync/playback/movies?extended=full'),
      traktCached('/sync/playback/episodes?extended=full'),
    ]);
    const entries = [...movies, ...episodes].sort((a, b) => String(b.paused_at).localeCompare(String(a.paused_at)));
    const shown = new Set();
    const items = [];
    entries.forEach((entry) => {
      const isMovie = !!entry.movie;
      const item = traktToItem(isMovie ? entry.movie : entry.show, isMovie ? 'movie' : 'series');
      if (!item || shown.has(item.id)) return;
      shown.add(item.id);
      const note = isMovie ? '' : episodeLabel(entry.episode);
      items.push(withNote(item, [note, Math.round(entry.progress) + '%'].filter(Boolean).join(' ')));
    });
    if (!items.length) throw SKIP_ROW;
    return items.slice(0, TRAKT_LIST_SIZE);
  });

// New episodes from shows you follow, from a week ago to the next two weeks.
const traktAiring = () =>
  needsLink().then(async () => {
    const start = new Date(Date.now() - 7 * DAY_MS);
    const date = start.getFullYear() + '-' + pad2(start.getMonth() + 1) + '-' + pad2(start.getDate());
    const entries = await traktCached('/calendars/my/shows/' + date + '/21?extended=full');
    const shown = new Set();
    const items = [];
    entries.forEach((entry) => {
      const item = traktToItem(entry.show, 'series');
      if (!item || shown.has(item.id)) return;
      shown.add(item.id);
      const when = new Date(entry.first_aired).toLocaleDateString([], { weekday: 'short' });
      items.push(withNote(item, [episodeLabel(entry.episode), when].filter(Boolean).join(' ')));
    });
    if (!items.length) throw SKIP_ROW;
    return items.slice(0, TRAKT_LIST_SIZE);
  });

const traktWatchlist = () =>
  needsLink().then(async () => {
    const [movies, shows] = await Promise.all([
      traktCached('/sync/watchlist/movies?extended=full'),
      traktCached('/sync/watchlist/shows?extended=full'),
    ]);
    const items = [
      ...movies.map((e) => traktToItem(e.movie, 'movie')),
      ...shows.map((e) => traktToItem(e.show, 'series')),
    ]
      .filter(Boolean)
      .slice(0, TRAKT_LIST_SIZE);
    if (!items.length) throw SKIP_ROW;
    return items;
  });

// Linked but nothing watched yet: Trakt has nothing to recommend from, so say so instead of showing no rows.
const traktEmptyCard = () => [
  {
    src: 'info',
    title: 'Trakt is linked',
    by: 'No watch history yet',
    desc: 'Trakt builds recommendations from what you watch. Turn on Trakt in Stremio’s settings and watch a few titles, and they will show up here.',
  },
];

const traktStatus = () =>
  needsLink().then(async () => {
    const watched = await traktWatched();
    if (watched.imdb.length || watched.tmdb.length) throw SKIP_ROW;
    return traktEmptyCard();
  });

// Your rows first (what Trakt recommends from your history), then what everyone is watching. The second group
// needs only the Trakt app, not a linked account.
function traktRows() {
  if (!traktEnabled()) return [];
  const row = (title, load, extra) => ({ ...stremioRow(title, load), ...extra });
  const mine = traktLinked()
    ? [
        { title: 'Trakt', sub: 'Trakt', kind: 'poster', load: traktStatus },
        row('Continue watching', traktContinue, { keepWatched: true }),
        row('New episodes from your shows', traktAiring, { keepWatched: true }),
        row('Recommended movies for you', traktRecommended('movie')),
        row('Recommended shows for you', traktRecommended('series')),
        row('Because you watched', traktBecause('series', 0)),
        row('Because you watched', traktBecause('movie', 0)),
        row('Because you watched', traktBecause('series', 1)),
        row('Your watchlist', traktWatchlist, { keepWatched: true }),
      ]
    : [];
  return [
    ...mine,
    row('Trending movies', publicList('/movies/trending', 'movie')),
    row('Trending shows', publicList('/shows/trending', 'series')),
    row('Popular this week: movies', publicList('/movies/watched/weekly', 'movie')),
    row('Popular this week: shows', publicList('/shows/watched/weekly', 'series')),
    row('Coming soon', publicList('/movies/anticipated', 'movie')),
  ];
}

// ---------- hiding what has been watched ----------
let watchedInFlight = null;

// Everything watched, as IMDb ids plus "movie603"/"tv1399" style TMDB keys (see mediaOf in tmdb.js).
function traktWatched() {
  return (
    watchedInFlight ||
    (watchedInFlight = cached(TRAKT_WATCHED_KEY, async () => {
      const [movies, shows] = await Promise.all([traktGet('/sync/watched/movies'), traktGet('/sync/watched/shows')]);
      const imdb = [];
      const tmdb = [];
      const add = (media, ids) => {
        if (ids && ids.imdb) imdb.push(ids.imdb);
        if (ids && ids.tmdb) tmdb.push(media + ids.tmdb);
      };
      movies.forEach((entry) => add('movie', entry.movie && entry.movie.ids));
      shows.forEach((entry) => add('tv', entry.show && entry.show.ids));
      return { imdb, tmdb };
    }).finally(() => {
      watchedInFlight = null;
    }))
  );
}

// Drops watched titles from a row (Stremio titles only; the watchlist keeps them). Never fails a row over this.
async function withoutWatched(items, cfg) {
  if (!traktLinked() || cfg.keepWatched || !items.some((item) => item.src === 'st')) return items;
  let watched;
  try {
    watched = await traktWatched();
  } catch (e) {
    return items; // history unavailable (offline, unlinked meanwhile): show the row unfiltered
  }
  const imdb = new Set(watched.imdb);
  const tmdb = new Set(watched.tmdb);
  const seen = (item) =>
    item.src === 'st' && ((item.id && imdb.has(item.id)) || (item.tmdb && tmdb.has(mediaOf(item.type) + item.tmdb)));
  const kept = items.filter((item) => !seen(item));
  if (!kept.length) throw Object.assign({}, SKIP_ROW, { why: 'all ' + items.length + ' watched; set=' + watched.imdb.length + '/' + watched.tmdb.length });
  kept.title = items.title;
  return kept;
}

// ---------- link overlay (device-code flow) ----------
async function pollTraktLink(device, isCurrent) {
  let waitMs = (device.interval || 5) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;
  while (isCurrent() && Date.now() < deadline) {
    await sleep(waitMs);
    if (!isCurrent()) return;
    const response = await traktRequest('POST', '/oauth/device/token', {
      code: device.device_code,
      ...traktClient(),
    });
    if (response.status === 200) {
      storeTokens(parseReply(response));
      $('#login').hidden = true;
      toast('Linked to Trakt');
      rebuildAll();
      return;
    }
    if (response.status === 429) waitMs += TRAKT_SLOW_DOWN_MS;
    else if (TRAKT_POLL_FAILURES[response.status]) throw new Error(TRAKT_POLL_FAILURES[response.status]);
    // 400: not approved yet, keep waiting
  }
  if (isCurrent()) throw new Error('code expired');
}

async function startTraktLink() {
  const run = ++loginRun;
  const isCurrent = () => run === loginRun;
  $('#ltitle').textContent = 'Link Trakt';
  showLogin('…', '', 'Contacting Trakt…');
  try {
    const response = await traktRequest('POST', '/oauth/device/code', traktClient());
    const device = parseReply(response);
    if (response.status !== 200 || !device.user_code) throw new Error('no code (' + response.status + ')');
    showLogin(device.user_code, device.verification_url.replace('https://', ''), MSG_WAITING);
    await pollTraktLink(device, isCurrent);
  } catch (e) {
    if (isCurrent()) $('#lmsg').textContent = 'Linking failed (' + (e.message || e) + ') · Back to close';
  }
}

// ---------- shortcut ----------
function traktAction() {
  if (!traktAuth.get()) {
    startTraktLink();
    return;
  }
  confirmDialog({
    title: 'Unlink Trakt?',
    body: 'Your Trakt recommendations and watch history filtering will go away until you link again.',
    confirmLabel: 'Unlink',
    run() {
      traktAuth.clear();
      toast('Unlinked from Trakt');
      rebuildAll();
    },
  });
}
