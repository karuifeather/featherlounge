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
const TRAKT_UNLINK_CONFIRM_MS = 4000;
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
  if (!items.length) throw SKIP_ROW;
  if (title) items.title = title; // showItems() renames the row to this
  return items;
}

const typeNoun = (type) => (type === 'movie' ? 'movies' : 'shows');
const needsLink = () => (traktLinked() ? Promise.resolve() : Promise.reject(SKIP_ROW));

const traktRecommended = (type) => () =>
  needsLink().then(() =>
    traktCached(
      '/recommendations/' + typeNoun(type) + '?extended=full&ignore_collected=true&limit=' + TRAKT_LIST_SIZE,
    ).then((entries) => toItems(entries, type)),
  );

// "Because you watched <the latest title>": Trakt's related titles for it.
const traktBecause = (type) => () =>
  needsLink().then(async () => {
    const history = await traktCached('/sync/history/' + typeNoun(type) + '?limit=1');
    const seed = history[0] && unwrap(history[0], type);
    if (!seed || !seed.ids || !seed.ids.trakt) throw SKIP_ROW;
    const related = await traktCached(
      '/' + typeNoun(type) + '/' + seed.ids.trakt + '/related?extended=full&limit=' + TRAKT_LIST_SIZE,
    );
    return toItems(related, type, 'Because you watched ' + seed.title);
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

function traktRows() {
  if (!traktLinked()) return [];
  const row = (title, load, extra) => ({ ...stremioRow(title, load), ...extra });
  return [
    row('Recommended movies', traktRecommended('movie')),
    row('Recommended shows', traktRecommended('series')),
    row('Because you watched', traktBecause('movie')),
    row('Because you watched', traktBecause('series')),
    row('Your watchlist', traktWatchlist, { keepWatched: true }),
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
  if (!kept.length) throw SKIP_ROW;
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
let unlinkArmedUntil = 0;
function traktAction() {
  if (!traktAuth.get()) {
    startTraktLink();
    return;
  }
  if (Date.now() < unlinkArmedUntil) {
    traktAuth.clear();
    unlinkArmedUntil = 0;
    toast('Unlinked from Trakt');
    rebuildAll();
  } else {
    unlinkArmedUntil = Date.now() + TRAKT_UNLINK_CONFIRM_MS;
    toast('Press OK again to unlink Trakt');
  }
}
