'use strict';
// Public catalogs: Piped (YouTube without sign-in) and Stremio's Cinemeta (movies and shows).
// Both return items shaped {src, id, title, by, img, bg, desc} for the rows to render.

const MAX_CATALOG_ITEMS = 20;

const youtubeThumbs = (videoId) => ({
  img: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
  bg: 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg',
});

// ---------- Piped ----------
const videoIdFromUrl = (url) => (url || '').split('v=')[1]?.split('&')[0];

const isPlayableVideo = (entry) => entry.type === 'stream' && !entry.isShort && videoIdFromUrl(entry.url);

function pipedToItem(entry) {
  const id = videoIdFromUrl(entry.url);
  return {
    src: 'yt',
    id,
    title: entry.title,
    by: entry.uploaderName,
    dur: entry.duration,
    ...youtubeThumbs(id),
    desc: entry.shortDescription || '',
  };
}

// Tries each Piped instance in turn and returns the first non-empty result.
async function fetchPiped(path) {
  let lastError;
  for (const base of PIPED_INSTANCES) {
    try {
      const data = await getJSON(base + path);
      const entries = Array.isArray(data) ? data : data.items;
      const items = (entries || []).filter(isPlayableVideo).slice(0, MAX_CATALOG_ITEMS).map(pipedToItem);
      if (items.length) return items;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('no data');
}

const piped = (path) => cached('yt' + path, () => fetchPiped(path));

// ---------- Cinemeta ----------
const MAX_GENRES_SHOWN = 3;

function cinemetaSubtitle(meta) {
  const genres = (meta.genres || []).slice(0, MAX_GENRES_SHOWN).join(CHIP_SEPARATOR);
  return [meta.releaseInfo, meta.imdbRating && '★ ' + meta.imdbRating, genres].filter(Boolean).join(META_SEPARATOR);
}

const cinemetaToItem = (meta, type) => ({
  src: 'st',
  id: meta.imdb_id || meta.id,
  type,
  title: meta.name,
  by: cinemetaSubtitle(meta),
  img: meta.poster,
  bg: meta.background || meta.poster,
  desc: meta.description || '',
});

const cine = (path, type) =>
  cached('st/' + path, async () => {
    const catalog = await getJSON(CINEMETA_URL + '/' + path);
    return catalog.metas.slice(0, MAX_CATALOG_ITEMS).map((meta) => cinemetaToItem(meta, type));
  });
