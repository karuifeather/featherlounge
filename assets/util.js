'use strict';
// Shared helpers: DOM, toast, storage, cached/HTTP fetching, and the native bridge.

// A row loader rejects with this to say "nothing to show here": the row is removed instead of erroring.
const SKIP_ROW = { skip: true };

// ---------- DOM ----------
const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const TOAST_MS = 2500;
let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('on'), TOAST_MS);
}

// ---------- formatting ----------
const META_SEPARATOR = '  ·  '; // between metadata fields inside an item's `by`
const META_SEPARATOR_RE = / {2}· {2}/;
const META_SEPARATOR_RE_ALL = new RegExp(META_SEPARATOR_RE, 'g');
const CHIP_SEPARATOR = ' · ';

const pad2 = (n) => String(n).padStart(2, '0');

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s);
}

// ---------- storage ----------
// localStorage can throw (private mode, quota), so every access is guarded.
const storage = {
  read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (e) {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable: skip caching */
    }
  },
  remove(...keys) {
    try {
      keys.forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      /* storage unavailable */
    }
  },
};

// Fresh cache -> use it; otherwise fetch; if the fetch fails, fall back to the stale copy.
function cached(key, fetcher, ttlMs = CACHE_TTL_MS) {
  const entry = storage.read(key);
  if (entry && Date.now() - entry.t < ttlMs) return Promise.resolve(entry.d);
  return fetcher()
    .then((data) => {
      storage.write(key, { t: Date.now(), d: data });
      return data;
    })
    .catch((error) => {
      if (entry) return entry.d;
      throw error;
    });
}

// ---------- network ----------
const JSON_TIMEOUT_MS = 9000;
async function getJSON(url, timeoutMs = JSON_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Native HTTP goes through the Android bridge, which answers by calling window.__http(id, status, text).
// Outside the app (desktop browser) it falls back to fetch.
const NATIVE_HTTP_TIMEOUT_MS = 20000;
const pendingRequests = {};
let lastRequestId = 0;

window.__http = (id, status, text) => {
  const resolve = pendingRequests[id];
  delete pendingRequests[id];
  if (resolve) resolve({ status, text });
};

const hasNativeHttp = () => !!(window.FeatherLounge && FeatherLounge.http);

async function fetchHttp(method, url, headers, body) {
  const response = await fetch(url, { method, headers, body });
  return { status: response.status, text: await response.text() };
}

function nativeHttp(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const id = ++lastRequestId;
    pendingRequests[id] = resolve;
    FeatherLounge.http(id, method, url, JSON.stringify(headers || {}), body || '');
    setTimeout(() => {
      if (!pendingRequests[id]) return;
      delete pendingRequests[id];
      reject(new Error('timeout'));
    }, NATIVE_HTTP_TIMEOUT_MS);
  });
}

const http = (method, url, headers, body) =>
  hasNativeHttp() ? nativeHttp(method, url, headers, body) : fetchHttp(method, url, headers, body);

// ---------- native actions ----------
// Desktop-browser fallback for testing outside the app.
const bridge = window.FeatherLounge || {
  playLaunchSound: () => false,
  youtube: (id) => open('https://www.youtube.com/watch?v=' + id),
  stremio: (type, id) => open('https://web.stremio.com/#/detail/' + type + '/' + id),
  app: (app) => toast('Open: ' + app),
  isDefaultHome: () => false,
  isHomeRoleHeld: () => false,
  requestHome: () => toast('Set as home'),
  removableApps: () =>
    JSON.stringify([
      { pkg: 'com.netflix.ninja', label: 'Netflix', system: true },
      { pkg: 'com.hulu.livingroomplus', label: 'Hulu', system: true },
      { pkg: 'com.example.game', label: 'Some Game', system: false },
      { pkg: 'com.vendor.promo', label: 'Vendor Promo', system: true },
    ]),
  removeApp: (pkg) => toast('Remove: ' + pkg),
  version: () => '0.1.0',
  installUpdate: () => toast('Install update'),
};
