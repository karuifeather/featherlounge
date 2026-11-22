'use strict';
// Static settings: optional build-time config, data sources, the app shortcuts and the home-screen rows.
// Keep this file declarative; the row loaders it references live in catalog.js and youtube-feed.js.

// Optional overrides from the build (see docs/youtube.md). Empty means the sign-in client is discovered at runtime.
const CFG = window.FL_CONFIG || {};

const CINEMETA_URL = 'https://v3-cinemeta.strem.io/catalog';
const PIPED_INSTANCES = ['https://api.piped.private.coffee', 'https://pipedapi.kavin.rocks'];
const CACHE_TTL_MS = 30 * 60 * 1000;

const SOURCE_YOUTUBE = 'SmartTube';
const SOURCE_STREMIO = 'Stremio';

const APPS = [
  { id: 'smarttube', label: 'SmartTube' },
  { id: 'stremio', label: 'Stremio' },
  { id: 'wifi', label: 'Network' },
  { id: 'settings', label: 'Settings' },
  { id: 'account', label: 'YouTube account' },
  { id: 'setup', label: 'Setup' },
];

const youtubeRow = (title, load) => ({ title, sub: SOURCE_YOUTUBE, kind: 'yt', load });
const stremioRow = (title, load) => ({ title, sub: SOURCE_STREMIO, kind: 'poster', load });
const feedRow = (title, shelfIndex) => youtubeRow(title, () => shelf(shelfIndex));
const pipedSearch = (query) => piped('/search?q=' + query + '&filter=videos');

const ROWS = [
  feedRow('Recommended for you', 0),
  feedRow('More for you', 1),
  youtubeRow('Trending on YouTube', () => (signedIn() ? Promise.reject(SKIP_ROW) : piped('/trending?region=US'))),
  stremioRow('Popular Movies', () => cine('movie/top.json', 'movie')),
  feedRow('More to watch', 2),
  stremioRow('Popular Shows', () => cine('series/top.json', 'series')),
  feedRow('Picked for you', 3),
  youtubeRow('New Trailers', () => pipedSearch('official+trailer+2026')),
  stremioRow('Action Movies', () => cine('movie/top/genre=Action.json', 'movie')),
  stremioRow('Comedy Shows', () => cine('series/top/genre=Comedy.json', 'series')),
  youtubeRow('Music', () => (signedIn() ? shelf(4) : pipedSearch('new+music+videos'))),
];

// First-run setup. Bump SETUP_VERSION to show the flow again after an update that adds a step.
const SETUP_VERSION = 1;
const SETUP_KEY = 'fl.setup';
const SETUP_COMPLETED_KEY = 'fl.setupCompleted';

// Update check against this project's latest GitHub release.
const UPDATE_API = 'https://api.github.com/repos/karuifeather/featherlounge/releases/latest';
const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;
const UPDATE_ASSET_NAME = 'FeatherLounge.apk';
