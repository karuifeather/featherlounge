'use strict';
// TMDB: top-rated and hidden-gem rows (optional; needs a free TMDB API key, see docs/recommendations.md).
// Items are shaped like Cinemeta's ({src, id, type, title, by, img, bg, desc}) except `id` (the IMDb id Stremio needs)
// is filled in lazily from `tmdb` when a card is opened, so a row costs one request instead of one per card.

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGES = 'https://image.tmdb.org/t/p/';
const TMDB_POSTER_SIZE = 'w500';
const TMDB_BACKDROP_SIZE = 'w1280';
const TMDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TMDB_MIN_RATING = 6.5;
const TMDB_MIN_VOTES = 300;
const GEM_MIN_RATING = 7.5;
const GEM_MAX_VOTES = 3000;
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
const tmdbItems = (path, params, media) =>
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
    if (!items.length) throw SKIP_ROW;
    return items;
  });

// ---------- rows ----------
const discover = (media, extra) =>
  tmdbItems(
    '/discover/' + media,
    {
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_average.gte': TMDB_MIN_RATING,
      'vote_count.gte': TMDB_MIN_VOTES,
      ...extra,
    },
    media,
  );

// Quality rows that need no account. With Trakt linked, its own trending lists replace "Trending this week".
function tmdbRows() {
  if (!tmdbEnabled()) return [];
  return [
    stremioRow('Top rated movies', () => tmdbItems('/movie/top_rated', {}, 'movie')),
    stremioRow('Top rated shows', () => tmdbItems('/tv/top_rated', {}, 'tv')),
    stremioRow('Hidden gems', () =>
      discover('movie', { 'vote_average.gte': GEM_MIN_RATING, 'vote_count.lte': GEM_MAX_VOTES }),
    ),
    ...(traktEnabled() ? [] : [stremioRow('Trending this week', () => tmdbItems('/trending/all/week', {}, null))]),
  ];
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
