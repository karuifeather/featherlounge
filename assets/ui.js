'use strict';
// Rendering: smooth scrolling, the app shortcuts, the carousels and cards, and the hero banner.

// ---------- UI state ----------
let rows = []; // one entry per visible carousel: {cfg, sec, track, items, nodes, state, g, top, lefts}
const pos = { r: 0, c: 0 }; // r: 0 = app shortcuts, n > 0 = rows[n - 1]; c = column
let memo = {}; // last column visited in each row
const appEls = [];
let rowsGlide = null; // glide for the vertical rows scroller

// ---------- smooth motion ----------
// Exponential glide toward a target; the position stays continuous when it is retargeted mid-move.
const GLIDE_TIME_CONSTANT_MS = 80;
const GLIDE_DEFAULT_FRAME_MS = 16;
const GLIDE_MAX_FRAME_MS = 40;
const GLIDE_SNAP_PX = 0.5;

const activeGlides = new Set();
let glideFrame = 0;
let glideLastTime = 0;

const createGlide = (node, axis) => ({ node, axis, current: 0, target: 0 });

function glideTo(glide, target) {
  glide.target = target;
  activeGlides.add(glide);
  if (!glideFrame) {
    glideLastTime = 0;
    glideFrame = requestAnimationFrame(stepGlides);
  }
}

function applyGlide(glide) {
  const px = Math.round(glide.current);
  glide.node.style.transform = glide.axis === 'x' ? 'translate3d(' + px + 'px,0,0)' : 'translate3d(0,' + px + 'px,0)';
}

function stepGlides(time) {
  const dt = glideLastTime ? Math.min(GLIDE_MAX_FRAME_MS, time - glideLastTime) : GLIDE_DEFAULT_FRAME_MS;
  glideLastTime = time;
  const k = 1 - Math.exp(-dt / GLIDE_TIME_CONSTANT_MS);
  activeGlides.forEach((glide) => {
    const distance = glide.target - glide.current;
    if (Math.abs(distance) < GLIDE_SNAP_PX) {
      glide.current = glide.target;
      activeGlides.delete(glide);
    } else glide.current += distance * k;
    applyGlide(glide);
  });
  glideFrame = activeGlides.size ? requestAnimationFrame(stepGlides) : 0;
}

// ---------- app shortcuts ----------
const APP_ICONS = {
  smarttube: '<path d="M8 5.2v13.6a1 1 0 001.5.86l11-6.8a1 1 0 000-1.72l-11-6.8A1 1 0 008 5.2z"/>',
  stremio: '<path d="M12 1.8l10.2 10.2L12 22.2 1.8 12z"/>',
  wifi: '<path d="M12 19.2a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8zM5.6 13.1l1.9 1.9a6.4 6.4 0 019 0l1.9-1.9a9.1 9.1 0 00-12.8 0zM1.8 9.3l1.9 1.9a11.8 11.8 0 0116.6 0l1.9-1.9a14.5 14.5 0 00-20.4 0z"/>',
  settings:
    '<path d="M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8zm9 4.3v-1.8l-2.1-.4a7 7 0 00-.9-2.1l1.2-1.8-1.3-1.3-1.8 1.2a7 7 0 00-2.1-.9L13.6 3h-1.8l-.4 2.1a7 7 0 00-2.1.9L7.5 4.8 6.2 6.1l1.2 1.8a7 7 0 00-.9 2.1l-2.1.4v1.8l2.1.4c.2.8.5 1.5.9 2.1l-1.2 1.8 1.3 1.3 1.8-1.2c.6.4 1.3.7 2.1.9l.4 2.1h1.8l.4-2.1c.8-.2 1.5-.5 2.1-.9l1.8 1.2 1.3-1.3-1.2-1.8c.4-.6.7-1.3.9-2.1z" transform="translate(0 -.1)"/>',
  update: '<path d="M12 3l6.5 7H14v6h-4v-6H5.5zM5 19h14v2H5z"/>',
  setup: '<path d="M3 17.3V21h3.7l10.9-10.9-3.7-3.7zM20.7 7a1 1 0 000-1.4l-2.3-2.3a1 1 0 00-1.4 0l-1.8 1.8 3.7 3.7z"/>',
  account:
    '<path d="M12 12.2a4.6 4.6 0 100-9.2 4.6 4.6 0 000 9.2zm0 2.3c-4.2 0-8.2 2.1-8.2 5.1V21h16.4v-1.4c0-3-4-5.1-8.2-5.1z"/>',
};

function addAppButton(app) {
  const button = el('div', 'app');
  button.dataset.app = app.id;
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (APP_ICONS[app.id] || '') + '</svg>';
  button.appendChild(el('span', 'lbl', app.label));
  $('#apps').appendChild(button);
  appEls.push(button);
}

function buildTop() {
  APPS.forEach(addAppButton);
}

function updateAccountLabel() {
  const button = appEls.find((x) => x.dataset.app === 'account');
  if (button) button.querySelector('.lbl').textContent = auth.get() ? 'Sign out' : 'Sign in to YouTube';
}

// ---------- cards ----------
const isPoster = (kind) => kind === 'poster';
const isLoginItem = (item) => item.src === 'login';

function createThumbImage(url) {
  const image = new Image();
  image.alt = '';
  image.decoding = 'async';
  image.onload = () => image.classList.add('in');
  image.src = url;
  return image;
}

function createThumb(item) {
  const thumb = el('div', 'thumb');
  if (isLoginItem(item)) {
    thumb.classList.add('login');
    thumb.append(el('div', 'lg', '▶'), el('div', null, 'Sign in'));
  } else if (item.img) {
    thumb.appendChild(createThumbImage(item.img));
  }
  thumb.appendChild(el('div', 'shade'));
  if (!isLoginItem(item) && (item.durText || item.dur))
    thumb.appendChild(el('div', 'dur', item.durText || formatDuration(item.dur)));
  return thumb;
}

const POSTER_FIELDS_SHOWN = 2;
function cardSubtitle(item, kind) {
  const by = item.by || '';
  if (isPoster(kind)) return by.split(META_SEPARATOR_RE).slice(0, POSTER_FIELDS_SHOWN).join(CHIP_SEPARATOR);
  return by.replace(META_SEPARATOR_RE_ALL, CHIP_SEPARATOR);
}

function createCard(item, kind) {
  const card = el('div', 'card' + (isPoster(kind) ? ' poster' : ''));
  card.append(
    createThumb(item),
    el('div', 't', isLoginItem(item) ? 'Sign in to YouTube' : item.title),
    el('div', 's', cardSubtitle(item, kind)),
  );
  return card;
}

// ---------- rows ----------
const SKELETON_CARDS = 8;
function showSkeleton(row) {
  row.track.textContent = '';
  row.nodes = [];
  for (let i = 0; i < SKELETON_CARDS; i++) {
    const card = el('div', 'card skel' + (isPoster(row.cfg.kind) ? ' poster' : ''));
    card.append(el('div', 'thumb'), el('div', 't', '.'), el('div', 's', '.'));
    row.track.appendChild(card);
  }
}

function showItems(row, items) {
  row.items = items;
  row.state = 'ok';
  if (items.title) row.sec.querySelector('.rt').textContent = items.title;
  row.track.textContent = '';
  row.nodes = items.map((item) => {
    const card = createCard(item, row.cfg.kind);
    row.track.appendChild(card);
    return card;
  });
  invalidateLayout();
  if (focusedRow() === row) setFocus(pos.r, Math.min(pos.c, row.nodes.length - 1));
  else if (pos.r === 0 && !heroShown) showHero(items[0]);
}

function showError(row) {
  const message = el('div', 'err', 'Couldn’t load — press OK to retry');
  row.state = 'err';
  row.track.textContent = '';
  row.track.appendChild(message);
  row.nodes = [message];
}

// A row with nothing to show (e.g. no feed data) is removed, keeping focus on the same content.
function removeRow(row) {
  const index = rows.indexOf(row);
  if (index < 0) return;
  rows.splice(index, 1);
  row.sec.remove();
  invalidateLayout();
  if (pos.r - 1 > index) pos.r--;
  if (pos.r > 0) setFocus(Math.min(pos.r, rows.length), pos.c);
}

function fill(row) {
  row.state = 'load';
  showSkeleton(row);
  row.sec.querySelector('.cnt').textContent = '';
  row.cfg
    .load()
    .then((items) => showItems(row, items))
    .catch((error) => (error && error.skip ? removeRow(row) : showError(row)));
}

function createRow(cfg, host) {
  const sec = el('section', 'row');
  const header = el('div', 'rh');
  header.append(
    el('span', 'rt', cfg.title),
    el('span', 'src ' + (cfg.sub === SOURCE_YOUTUBE ? 'yt' : 'st'), 'via ' + cfg.sub),
    el('span', 'cnt'),
  );
  const track = el('div', 'track');
  sec.append(header, track);
  host.appendChild(sec);
  return { cfg, sec, track, items: [], nodes: [], state: 'load', g: createGlide(track, 'x'), top: -1, lefts: null };
}

function buildRows() {
  const host = $('#rows');
  host.textContent = '';
  rows = [];
  memo = {};
  if (!rowsGlide) rowsGlide = createGlide(host, 'y');
  ROWS.forEach((cfg) => {
    const row = createRow(cfg, host);
    rows.push(row);
    fill(row);
  });
}

function rebuildAll() {
  buildRows();
  updateAccountLabel();
  setFocus(pos.r === 0 ? 0 : 1, 0);
}

// Cached layout measurements; cleared whenever rows change.
const invalidateLayout = () =>
  rows.forEach((row) => {
    row.top = -1;
    row.lefts = null;
  });
const rowTop = (row) => (row.top >= 0 ? row.top : (row.top = row.sec.offsetTop));
const rowLefts = (row) => row.lefts || (row.lefts = row.nodes.map((node) => node.offsetLeft));
const focusedRow = () => (pos.r > 0 ? rows[pos.r - 1] : null);

// ---------- hero ----------
const HERO_SETTLE_MS = 180;
const MAX_HERO_CHIPS = 4;
const MIN_BACKGROUND_WIDTH = 200;

let heroShown = false;
let heroTimer = 0;
let backgroundToken = 0;
let backgroundFlip = 0;

// Cross-fades between the two background layers; the token drops results from superseded requests.
function setBackground(url, fallback, blurred) {
  const token = ++backgroundToken;
  const image = new Image();
  const layers = [$('#bgA'), $('#bgB')];
  image.onload = () => {
    if (token !== backgroundToken || image.naturalWidth < MIN_BACKGROUND_WIDTH) return;
    backgroundFlip ^= 1;
    const shown = layers[backgroundFlip];
    shown.style.backgroundImage = 'url("' + image.src + '")';
    shown.classList.toggle('yt', !!blurred);
    shown.classList.add('on');
    layers[backgroundFlip ^ 1].classList.remove('on');
  };
  image.onerror = () => {
    if (fallback && image.src !== fallback) image.src = fallback;
  };
  image.src = url;
}

const isYoutubeItem = (item) => item.src === 'yt' || isLoginItem(item);

function heroKindLabel(item) {
  if (isYoutubeItem(item)) return 'YOUTUBE';
  return item.type === 'series' ? 'SHOW' : 'MOVIE';
}

function renderChips(item) {
  const chips = $('#chips');
  chips.textContent = '';
  chips.appendChild(el('span', 'chip src ' + (isYoutubeItem(item) ? 'yt' : 'st'), heroKindLabel(item)));
  (item.by || '')
    .split(META_SEPARATOR_RE)
    .filter(Boolean)
    .slice(0, MAX_HERO_CHIPS)
    .forEach((field) => {
      chips.appendChild(el('span', 'chip' + (field.charAt(0) === '★' ? ' rate' : ''), field));
    });
}

function renderHero(item) {
  const login = isLoginItem(item);
  const youtube = isYoutubeItem(item);
  renderChips(item);
  $('#title').textContent = login ? 'Sign in to YouTube' : item.title;
  $('#desc').textContent = item.desc || '';
  $('#ctatxt').textContent = login ? 'Sign in' : 'Open in ' + (youtube ? SOURCE_YOUTUBE : SOURCE_STREMIO);
  if (!login) setBackground(item.bg || item.img || '', item.img, youtube);
  const hero = $('#hero');
  hero.classList.remove('in');
  void hero.offsetWidth; // force a reflow so the entrance animation restarts
  hero.classList.add('in');
}

// Only updates once focus has settled, so fast scrolling never rebuilds the hero.
function showHero(item) {
  if (!item) return;
  heroShown = true;
  clearTimeout(heroTimer);
  heroTimer = setTimeout(() => renderHero(item), HERO_SETTLE_MS);
}
