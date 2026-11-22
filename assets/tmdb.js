'use strict';
// TMDB: personalised movie and show discovery (optional; needs a free TMDB API key, see docs/recommendations.md).
// Rows are built from the viewer's preferences (streaming services, genres, titles they love, see prefs.js).
// Items are shaped like Cinemeta's ({src, id, type, title, by, img, bg, desc}) except `id` (the IMDb id Stremio needs)
// is filled in lazily from `tmdb` when a card is opened, so a row costs one request instead of one per card.

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/';
const TMDB_POSTER_SIZE = 'w342';
const TMDB_BACKDROP_SIZE = 'w1280';
const TMDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TMDB_PROVIDERS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TMDB_PROVIDERS_SHOWN = 14;
const TMDB_MIN_RATING = 6.5;
const TMDB_MIN_VOTES = 300;
const GEM_MIN_RATING = 7.5;
const GEM_MAX_VOTES = 3000;
const MAX_SEED_ROWS = 3; // "Because you liked ..." rows, newest pick first
const IMDB_CACHE_KEY = 'tm_imdb';

const tmdbEnabled = () => !!CFG.tmdbKey;

// The key goes in the query string: a header would force a CORS preflight, a plain GET does not.
const tmdbQuery = (path, params) => path + '?' + new URLSearchParams(params || {});
const tmdbUrl = (path, params) => TMDB_API + path + '?' + new URLSearchParams({ ...params, api_key: CFG.tmdbKey });

const tmdbImage = (size, file) => (file ? TMDB_IMAGES + size + file : '');
const mediaOf = (type) => (type === 'series' || type === 'tv' ? 'tv' : 'movie');

function tmdbToItem(result, media) {
  const kind = mediaOf(result.media_type || media);
  const year = (result.release_date || result.first_air_date || '').slice(0, 4);
  return {
    src: 'st',
    id: null,
    tmdb: result.id,
    type: kind === 'tv' ? 'series' : 'movie',
    title: result.title || result.name,
    by: [year, result.vote_average && '★ ' + result.vote_average.toFixed(1)].filter(Boolean).join(META_SEPARATOR),
    img: tmdbImage(TMDB_POSTER_SIZE, result.poster_path),
    bg: tmdbImage(TMDB_BACKDROP_SIZE, result.backdrop_path) || tmdbImage('w780', result.poster_path),
    desc: result.overview || '',
  };
}

// Only titles Stremio can show: a poster, a name, and a movie or show (trending mixes in people).
const isUsableResult = (result, media) =>
  result.poster_path && (result.title || result.name) && ['movie', 'tv'].includes(result.media_type || media);

// Cached by request (no key in the cache key); the cache holds the mapped items, not TMDB's larger responses.
const tmdbItems = (path, params, media, exclude) =>
  cached(
    'tm' + tmdbQuery(path, params),
    async () => {
      const data = await getJSON(tmdbUrl(path, params));
      return (data.results || [])
        .filter((result) => isUsableResult(result, media))
        .slice(0, MAX_CATALOG_ITEMS)
        .map((result) => tmdbToItem(result, media));
    },
    TMDB_CACHE_TTL_MS,
  ).then((items) => {
    const skip = new Set(exclude || []);
    const kept = items.filter((item) => !skip.has(mediaOf(item.type) + item.tmdb));
    if (!kept.length) throw SKIP_ROW;
    return kept;
  });

// ---------- preferences to query ----------
// TMDB uses different genre ids for movies and shows; null means that side has no equivalent.
const GENRES = [
  { id: 'action', label: 'Action & Adventure', movie: 28, tv: 10759 },
  { id: 'comedy', label: 'Comedy', movie: 35, tv: 35 },
  { id: 'drama', label: 'Drama', movie: 18, tv: 18 },
  { id: 'scifi', label: 'Sci-Fi & Fantasy', movie: 878, tv: 10765 },
  { id: 'thriller', label: 'Thriller & Mystery', movie: 53, tv: 9648 },
  { id: 'crime', label: 'Crime', movie: 80, tv: 80 },
  { id: 'horror', label: 'Horror', movie: 27, tv: null },
  { id: 'romance', label: 'Romance', movie: 10749, tv: null },
  { id: 'animation', label: 'Animation', movie: 16, tv: 16 },
  { id: 'documentary', label: 'Documentary', movie: 99, tv: 99 },
];

function discoverParams(media, p, extra) {
  const params = {
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_average.gte': TMDB_MIN_RATING,
    'vote_count.gte': TMDB_MIN_VOTES,
    ...extra,
  };
  if (p.providers.length) {
    params.watch_region = p.region;
    params.with_watch_providers = p.providers.join('|');
    params.with_watch_monetization_types = 'flatrate';
  }
  const genreIds = GENRES.filter((genre) => p.genres.includes(genre.id))
    .map((genre) => genre[media])
    .filter(Boolean);
  if (genreIds.length) params.with_genres = genreIds.join('|');
  return params;
}

const discover = (media, p, extra) =>
  tmdbItems('/discover/' + media, discoverParams(media, p, extra), media, lovedKeys(p));

const lovedKeys = (p) => p.loved.map((seed) => seed.media + seed.id);

// ---------- rows ----------
function personalRows() {
  if (!tmdbEnabled()) return [];
  const p = prefs.get();
  const mine = p.providers.length > 0;
  const seeds = p.loved
    .slice(-MAX_SEED_ROWS)
    .reverse()
    .map((seed) =>
      stremioRow('Because you liked ' + seed.title, () =>
        tmdbItems('/' + seed.media + '/' + seed.id + '/recommendations', {}, seed.media, lovedKeys(p)),
      ),
    );
  return [
    ...seeds,
    stremioRow(mine ? 'Movies on your services' : 'Top rated movies', () => discover('movie', p)),
    stremioRow(mine ? 'Shows on your services' : 'Top rated shows', () => discover('tv', p)),
    stremioRow('Hidden gems', () =>
      discover('movie', p, { 'vote_average.gte': GEM_MIN_RATING, 'vote_count.lte': GEM_MAX_VOTES }),
    ),
    stremioRow('Trending this week', () => tmdbItems('/trending/all/week', {}, null)),
  ];
}

// ---------- lookups for the preferences screen ----------
// Streaming services in this region, most popular first.
const tmdbProviders = (region) =>
  cached(
    'tm_providers_' + region,
    async () => {
      const data = await getJSON(tmdbUrl('/watch/providers/movie', { watch_region: region }));
      const rank = (provider) => (provider.display_priorities || {})[region] ?? provider.display_priority ?? 999;
      return (data.results || [])
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, TMDB_PROVIDERS_SHOWN)
        .map((provider) => ({ id: provider.provider_id, name: provider.provider_name }));
    },
    TMDB_PROVIDERS_TTL_MS,
  );

// A mix of this week's popular movies and shows to pick favourites from.
async function tmdbPickList() {
  const [movies, shows] = await Promise.all([
    tmdbItems('/trending/movie/week', {}, 'movie'),
    tmdbItems('/trending/tv/week', {}, 'tv'),
  ]);
  const mixed = [];
  for (let i = 0; i < Math.max(movies.length, shows.length); i++) mixed.push(movies[i], shows[i]);
  return mixed.filter(Boolean);
}

// ---------- opening a card ----------
// Stremio needs an IMDb id. Cinemeta items have one; TMDB items resolve it on demand and remember it.
async function resolveImdb(item) {
  if (item.id) return item.id;
  const media = mediaOf(item.type);
  const key = media + item.tmdb;
  const known = storage.read(IMDB_CACHE_KEY) || {};
  if (known[key]) return known[key];
  const data = await getJSON(tmdbUrl('/' + media + '/' + item.tmdb + '/external_ids'));
  if (!data.imdb_id) throw new Error('no imdb id');
  known[key] = data.imdb_id;
  storage.write(IMDB_CACHE_KEY, known);
  return data.imdb_id;
}
