'use strict';
// Entry point: focus movement, remote/keyboard input, lifecycle hooks called by the Android app,
// the status bar, and start-up. Loaded last, after every module it uses.

// ---------- focus ----------
const ROW_SCROLL_OFFSET_PX = 28; // gap kept above the focused row
let focusedNode = null;

function focusAppShortcut(column) {
  pos.c = clamp(column, 0, appEls.length - 1);
  focusedNode = appEls[pos.c];
  focusedNode.classList.add('focus');
  glideTo(rowsGlide, 0);
}

function focusCard(rowNumber, column) {
  const row = rows[rowNumber - 1];
  pos.c = clamp(column, 0, row.nodes.length - 1);
  memo[rowNumber] = pos.c;
  const node = row.nodes[pos.c];
  if (!node) return;
  focusedNode = node;
  node.classList.add('focus');

  const lefts = rowLefts(row);
  glideTo(rowsGlide, -(rowTop(row) - ROW_SCROLL_OFFSET_PX));
  glideTo(row.g, -(lefts[Math.max(0, pos.c - 1)] - lefts[0])); // keeps the previous card peeking in
  if (row.state === 'ok') {
    showHero(row.items[pos.c]);
    row.sec.querySelector('.cnt').textContent = pos.c + 1 + ' / ' + row.nodes.length;
  }
}

function setFocus(rowNumber, column) {
  pos.r = clamp(rowNumber, 0, rows.length);
  if (focusedNode) focusedNode.classList.remove('focus');
  $('#rows').classList.toggle('browsing', pos.r > 0);
  if (pos.r === 0) focusAppShortcut(column);
  else focusCard(pos.r, column);
}

// ---------- actions ----------
function activateShortcut(app) {
  if (app.id === 'account') accountAction();
  else if (app.id === 'setup') openSetup();
  else if (app.id === 'prefs') openPrefs();
  else if (app.id === 'trakt') traktAction();
  else if (app.id === 'update') openUpdate();
  else bridge.app(app.id);
}

function activateItem(item) {
  if (isLoginItem(item)) startLogin();
  else if (isInfoItem(item)) {
    if (tmdbEnabled()) openPrefs();
  } else if (item.src === 'yt') bridge.youtube(item.id);
  else openInStremio(item);
}

// TMDB items carry no IMDb id until they are opened (see tmdb.js).
async function openInStremio(item) {
  try {
    bridge.stremio(item.type, await resolveImdb(item));
  } catch (e) {
    toast('Couldn’t open this title in Stremio');
  }
}

function activate() {
  if (pos.r === 0) {
    activateShortcut({ id: appEls[pos.c].dataset.app });
    return;
  }
  const row = rows[pos.r - 1];
  if (row.state === 'err') {
    fill(row);
    return;
  }
  if (row.state !== 'ok') return;
  activateItem(row.items[pos.c]);
}

// ---------- input ----------
const goHome = () => window.onHome();
const rememberedColumn = (rowNumber) => memo[rowNumber] || 0;

const KEY_ACTIONS = new Map([
  ['ArrowRight', () => setFocus(pos.r, pos.c + 1)],
  ['ArrowLeft', () => setFocus(pos.r, pos.c - 1)],
  ['ArrowDown', () => setFocus(pos.r + 1, rememberedColumn(pos.r + 1))],
  ['ArrowUp', () => setFocus(pos.r - 1, pos.r - 1 === 0 ? 0 : rememberedColumn(pos.r - 1))],
  ['Enter', activate],
  [' ', activate],
  ['Escape', goHome],
  ['Backspace', goHome],
]);

document.addEventListener('keydown', (event) => {
  if (updateOpen()) {
    updateKey(event.key);
    event.preventDefault();
    return;
  }
  if (prefsOpen()) {
    prefsKey(event.key);
    event.preventDefault();
    return;
  }
  if (setupOpen()) {
    setupKey(event.key);
    event.preventDefault(); // the setup overlay swallows every key
    return;
  }
  if (loginOpen()) {
    if (event.key === 'Escape' || event.key === 'Backspace') cancelLogin();
    event.preventDefault(); // the sign-in overlay swallows every key
    return;
  }
  const action = KEY_ACTIONS.get(event.key);
  if (!action) return;
  action();
  event.preventDefault();
});

// ---------- hooks called by the Android app ----------
// Home button / Back: close the sign-in overlay, otherwise return focus to the top.
window.onHome = () => {
  if (updateOpen()) closeUpdate();
  else if (prefsOpen()) prefsBack();
  else if (setupOpen()) setupBack();
  else if (loginOpen()) cancelLogin();
  else setFocus(0, 0);
};

// Called on resume and once a minute; refreshes the rows when the data is older than the cache lifetime.
let lastLoad = Date.now();
window.onWake = () => {
  if (setupOpen()) refreshSetup();
  checkForUpdate();
  if (Date.now() - lastLoad > CACHE_TTL_MS) {
    lastLoad = Date.now();
    rows.forEach(fill);
  }
  updateClock();
};

// ---------- status bar ----------
const CLOCK_REFRESH_MS = 15000;
const WAKE_CHECK_MS = 60000;

function updateClock() {
  $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateNetworkIndicator() {
  $('#net').classList.toggle('off', !navigator.onLine);
}

addEventListener('online', () => {
  updateNetworkIndicator();
  toast('Back online');
  rows.filter((row) => row.state === 'err').forEach(fill);
});
addEventListener('offline', () => {
  updateNetworkIndicator();
  toast('You’re offline');
});
setInterval(updateClock, CLOCK_REFRESH_MS);
setInterval(() => window.onWake(), WAKE_CHECK_MS);

// ---------- stage scaling ----------
// The UI is laid out for 1920x1080 and scaled to fit the actual screen.
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function fitStage() {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  const stage = $('#stage');
  stage.style.transform = 'scale(' + scale + ')';
  stage.style.left = (width - STAGE_WIDTH * scale) / 2 + 'px';
  stage.style.top = (height - STAGE_HEIGHT * scale) / 2 + 'px';
  if (window.FeatherLounge && FeatherLounge.log)
    FeatherLounge.log(
      'fitStage cw=' +
        width +
        ' ch=' +
        height +
        ' dpr=' +
        devicePixelRatio +
        ' iw=' +
        innerWidth +
        ' scale=' +
        scale.toFixed(3),
    );
}
addEventListener('resize', fitStage);
fitStage();

// ---------- launch screen ----------
// The branded splash covers the page until the first hero is drawn (or a timeout, if nothing loads).
// On a cold start it plays an intro timed to the launch sound. The native side starts the sound and calls
// window.onIntroStart at that exact moment, which adds .go and releases every animation (see intro-beats.css,
// generated by tools/make_chime.py from the sound's beat times), so picture and sound cannot drift apart.
const SPLASH_QUICK_MS = 700; // relaunch within the same process: static logo, no sound
const SPLASH_INTRO_MS = 3300; // cold start: the whole animation; the sound's tail rings on over the home screen
const SPLASH_MAX_MS = 8000;
const SOUND_START_TIMEOUT_MS = 300; // the sound never reported starting (muted, error): run the visuals anyway
const VISUAL_DELAY_MS = 0; // raise if a soundbar / HDMI ARC delays the audio, so the picture waits for it
const NATIVE_HANDOVER_TIMEOUT_MS = 5000; // the native splash never said it was gone: begin anyway
const WISP_COUNT = 9;
const MOTE_COUNT = 26;

let splashStart = Date.now();
let splashMinMs = SPLASH_QUICK_MS;
let introStarted = false;
let splashForced = false;
let splashClosing = false;

function startIntro() {
  if (introStarted) return;
  introStarted = true;
  setTimeout(() => {
    splashStart = Date.now();
    $('#splash').classList.add('go');
    console.log('intro go at ' + Math.round(performance.now()) + 'ms (page time)');
  }, VISUAL_DELAY_MS);
}
window.onIntroStart = startIntro;

// Little feathers that fan out from the hit; each gets its own direction, spin, size and delay.
function buildWisps() {
  const host = $('#splash .wisps');
  for (let i = 0; i < WISP_COUNT; i++) {
    const angle = (i / WISP_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const reach = 420 + Math.random() * 420;
    const wisp = el('img');
    wisp.src = 'brand/feather.svg';
    wisp.alt = '';
    wisp.style.setProperty('--x', Math.round(Math.cos(angle) * reach * 1.3) + 'px');
    wisp.style.setProperty('--y', Math.round(Math.sin(angle) * reach * 0.8 - 90) + 'px'); // drifts upward
    wisp.style.setProperty('--r', Math.round((Math.random() - 0.5) * 220) + 'deg');
    wisp.style.setProperty('--s', (0.5 + Math.random() * 0.9).toFixed(2));
    wisp.style.setProperty('--d', (Math.random() * 0.14).toFixed(2) + 's');
    host.appendChild(wisp);
  }
}

// Soft specks of light rising through the space; they start before the landing and keep drifting.
function buildMotes() {
  const host = $('#splash .motes');
  for (let i = 0; i < MOTE_COUNT; i++) {
    const size = 2 + Math.random() * 4;
    const mote = el('i');
    mote.style.left = (4 + Math.random() * 92).toFixed(1) + '%';
    mote.style.width = mote.style.height = size.toFixed(1) + 'px';
    mote.style.setProperty('--x', Math.round((Math.random() - 0.5) * 160) + 'px');
    mote.style.setProperty('--t', (4.5 + Math.random() * 3).toFixed(1) + 's');
    mote.style.setProperty('--d', (Math.random() * 1.6).toFixed(2) + 's');
    mote.style.setProperty('--o', (0.25 + Math.random() * 0.5).toFixed(2));
    host.appendChild(mote);
  }
}

function dismissSplash() {
  const splash = $('#splash');
  if (!splash || splashClosing) return;
  if (!introStarted && !splashForced) {
    setTimeout(dismissSplash, 50); // the intro has not begun yet: never cut it short
    return;
  }
  splashClosing = true;
  setTimeout(
    () => {
      splash.classList.add('done');
      $('#stage').classList.add('enter');
      setTimeout(() => splash.remove(), 600);
    },
    Math.max(0, splashMinMs - (Date.now() - splashStart)),
  );
}
setTimeout(() => {
  splashForced = true;
  dismissSplash();
}, SPLASH_MAX_MS);

buildWisps();
buildMotes();
// Starts the intro (or the still logo on a relaunch). Runs once the native splash, if any, has handed over.
let launchBegun = false;
function beginLaunch() {
  if (window.FeatherLounge && FeatherLounge.log) FeatherLounge.log('beginLaunch (already=' + launchBegun + ')');
  if (launchBegun) return;
  launchBegun = true;
  if (bridge.playLaunchSound()) {
    splashMinMs = SPLASH_INTRO_MS;
    setTimeout(startIntro, SOUND_START_TIMEOUT_MS);
  } else {
    $('#splash').classList.add('still');
    startIntro();
  }
}

// Native hook: the system splash has faded out, so the page's own splash (same feather) is what shows.
window.onSplashGone = beginLaunch;

// Decode the artwork first so the first beats never draw with blank images. Then tell native the page is ready: it
// keeps the system splash up until this frame is really on screen (no blank gap while the WebView starts) and calls
// onSplashGone. Without a native splash to wait for, begin right away; the timeout is a backstop.
Promise.all(
  Array.from(document.querySelectorAll('#splash img'), (img) => (img.decode ? img.decode().catch(() => {}) : 0)),
).then(() => {
  if (window.FeatherLounge && FeatherLounge.log) FeatherLounge.log('decode done, calling pageReady');
  if (bridge.pageReady && bridge.pageReady()) setTimeout(beginLaunch, NATIVE_HANDOVER_TIMEOUT_MS);
  else beginLaunch();
});

// ---------- start ----------
buildTop();
updateAccountLabel();
buildRows();
updateClock();
updateNetworkIndicator();
setFocus(1, 0);
maybeStartSetup();
maybePromptPrefs();
checkForUpdate();
