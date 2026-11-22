'use strict';
// Update check: looks up the latest GitHub release and, when it is newer than the installed version,
// labels the Updates shortcut "Update available" (it also checks on demand). The user chooses whether to install; the Android app downloads
// the APK and Android asks for confirmation (the APK must be signed with the same key).

const updateState = { release: null, phase: 'ready', detail: '', sel: 0 };
const UPDATE_CACHE_KEY = 'fl.update';
let dialogScreen = null; // returns {title, body, notes, buttons} for whatever the dialog shows now
let updateButtons = [];

const updateOpen = () => !$('#update').hidden;
const installedVersion = () => (bridge.version ? bridge.version() : '0');

// "v1.2.3" / "1.2.3-beta" -> [1, 2, 3]
const versionParts = (version) =>
  String(version)
    .replace(/^v/, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((part) => parseInt(part, 10) || 0);

function isNewerVersion(candidate, current) {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff > 0;
  }
  return false;
}

async function fetchLatestRelease() {
  const reply = await http('GET', UPDATE_API, { Accept: 'application/vnd.github+json' });
  if (reply.status !== 200) throw new Error(reply.status);
  const release = JSON.parse(reply.text);
  const apks = (release.assets || []).filter((asset) => /\.apk$/.test(asset.name));
  const asset = apks.find((a) => a.name === UPDATE_ASSET_NAME) || apks[0];
  if (!asset) throw new Error('no apk');
  return { tag: release.tag_name, notes: release.body || '', url: asset.browser_download_url };
}

// Resolves to the newer release, or null when this is the latest. `fresh` skips the cache (a manual check).
async function lookupUpdate(fresh) {
  if (fresh) storage.remove(UPDATE_CACHE_KEY);
  const release = await cached(UPDATE_CACHE_KEY, fetchLatestRelease, UPDATE_CHECK_TTL_MS);
  return isNewerVersion(release.tag, installedVersion()) ? release : null;
}

// Background check, cached for UPDATE_CHECK_TTL_MS so calling this on every wake is cheap. Failures are silent.
function checkForUpdate() {
  lookupUpdate(false)
    .then((release) => {
      if (!release || updateState.release) return;
      updateState.release = release;
      updateAccountLabel();
      toast('Update available: ' + release.tag);
    })
    .catch(() => {});
}

// The Updates shortcut: shows the pending update, or checks right now and says what it found.
async function updatesAction() {
  if (updateState.release) return openUpdate();
  const version = 'FeatherLounge v' + installedVersion().replace(/^v/, '');
  const close = { label: 'Close', run: closeUpdate };
  openDialog(() => ({ title: 'Checking for updates…', body: version, buttons: [close] }));
  try {
    const release = await lookupUpdate(true);
    if (!updateOpen()) return;
    if (release) {
      updateState.release = release;
      updateAccountLabel();
      openUpdate();
    } else openDialog(() => ({ title: 'You’re up to date', body: version, buttons: [close] }));
  } catch (e) {
    if (updateOpen())
      openDialog(() => ({
        title: 'Couldn’t check for updates',
        body: 'Check the connection and try again.',
        buttons: [{ label: 'Try again', run: updatesAction }, close],
      }));
  }
}

// ---------- overlay ----------
function updateScreen() {
  const release = updateState.release;
  const target = release.tag + ' (you have v' + installedVersion().replace(/^v/, '') + ')';
  const install = { label: 'Install update', run: startUpdateInstall };
  const close = { label: 'Later', run: closeUpdate };
  switch (updateState.phase) {
    case 'downloading':
      return {
        title: 'Downloading ' + release.tag,
        body: updateState.detail ? updateState.detail + '%' : 'Starting…',
        buttons: [],
      };
    case 'confirm':
      return {
        title: 'Almost there',
        body: 'Confirm the install on the screen that just opened. FeatherLounge will restart.',
        buttons: [{ label: 'Close', run: closeUpdate }],
      };
    case 'permission':
      return {
        title: 'Allow installs',
        body: 'Turn on “Allow from this source” in the settings that just opened, go back, and press Install again.',
        buttons: [install, close],
      };
    case 'failed':
      return {
        title: 'Update failed',
        body: updateState.detail + ' You can also download it from the project’s GitHub releases page.',
        buttons: [
          { label: 'Try again', run: startUpdateInstall },
          { label: 'Close', run: closeUpdate },
        ],
      };
    default:
      return {
        title: 'Update available',
        body: 'FeatherLounge ' + target,
        notes: release.notes.replace(/[#*`]/g, '').trim().slice(0, 240),
        buttons: [install, close],
      };
  }
}

function renderUpdate() {
  if (!dialogScreen) return;
  const screen = dialogScreen();
  $('#utitle').textContent = screen.title;
  $('#ubody').textContent = screen.body;
  $('#unotes').textContent = screen.notes || '';
  const host = $('#ubtns');
  host.textContent = '';
  updateButtons = screen.buttons.map((button) => {
    const node = el('div', 'sbtn', button.label);
    host.appendChild(node);
    return { node, run: button.run };
  });
  updateState.sel = clamp(updateState.sel, 0, Math.max(0, updateButtons.length - 1));
  updateButtons.forEach((entry, i) => entry.node.classList.toggle('focus', i === updateState.sel));
}

// The one overlay for updates and confirmations: a title, text and buttons, driven by the remote.
function openDialog(screen, sel = 0) {
  dialogScreen = screen;
  updateState.sel = sel;
  $('#update').hidden = false;
  renderUpdate();
}

// A yes/no question; focus starts on Cancel so a stray OK press never does the destructive thing.
function confirmDialog({ title, body, confirmLabel, run }) {
  const confirm = {
    label: confirmLabel,
    run() {
      closeUpdate();
      run();
    },
  };
  openDialog(() => ({ title, body, buttons: [{ label: 'Cancel', run: closeUpdate }, confirm] }));
}

function openUpdate() {
  if (!updateState.release) return;
  if (updateState.phase !== 'downloading') updateState.phase = 'ready';
  openDialog(updateScreen);
}

function closeUpdate() {
  $('#update').hidden = true;
  dialogScreen = null;
}

function startUpdateInstall() {
  updateState.phase = 'downloading';
  updateState.detail = '';
  updateState.sel = 0;
  dialogScreen = updateScreen;
  bridge.installUpdate(updateState.release.url);
  renderUpdate();
}

// Progress and results from the Android app: downloading, confirm, permission, failed, done.
window.__update = (phase, detail) => {
  if (phase === 'done') return;
  updateState.phase = phase;
  updateState.detail = detail;
  if (updateOpen()) renderUpdate();
};

function updateKey(key) {
  const move = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[key];
  if (move) {
    updateState.sel = clamp(updateState.sel + move, 0, Math.max(0, updateButtons.length - 1));
    renderUpdate();
  } else if (key === 'Enter' || key === ' ') {
    const current = updateButtons[updateState.sel];
    if (current) current.run();
  } else if (key === 'Escape' || key === 'Backspace') closeUpdate();
}
