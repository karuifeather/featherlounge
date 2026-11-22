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
  else if (app.id === 'update') openUpdate();
  else bridge.app(app.id);
}

function activateItem(item) {
  if (isLoginItem(item)) startLogin();
  else if (item.src === 'yt') bridge.youtube(item.id);
  else bridge.stremio(item.type, item.id);
}

function activate() {
  if (pos.r === 0) {
    activateShortcut(APPS[pos.c]);
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
}
addEventListener('resize', fitStage);
fitStage();

// ---------- start ----------
buildTop();
updateAccountLabel();
buildRows();
updateClock();
updateNetworkIndicator();
setFocus(1, 0);
maybeStartSetup();
checkForUpdate();
