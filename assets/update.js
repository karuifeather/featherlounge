'use strict';
// Update check: looks up the latest GitHub release and, when it is newer than the installed version,
// adds an "Update available" shortcut. The user chooses whether to install; the Android app downloads
// the APK and Android asks for confirmation (the APK must be signed with the same key).

const updateState = { release: null, phase: 'ready', detail: '', sel: 0, shortcut: false };
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

// Cached for UPDATE_CHECK_TTL_MS, so calling this on every wake is cheap. Failures are silent.
function checkForUpdate() {
  cached('fl.update', fetchLatestRelease, UPDATE_CHECK_TTL_MS)
    .then((release) => {
      if (!isNewerVersion(release.tag, installedVersion())) return;
      updateState.release = release;
      if (updateState.shortcut) return;
      updateState.shortcut = true;
      APPS.push({ id: 'update', label: 'Update available' });
      addAppButton(APPS[APPS.length - 1]);
      toast('Update available: ' + release.tag);
    })
    .catch(() => {});
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
  const screen = updateScreen();
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

function openUpdate() {
  if (!updateState.release) return;
  if (updateState.phase !== 'downloading') updateState.phase = 'ready';
  updateState.sel = 0;
  $('#update').hidden = false;
  renderUpdate();
}

function closeUpdate() {
  $('#update').hidden = true;
}

function startUpdateInstall() {
  updateState.phase = 'downloading';
  updateState.detail = '';
  updateState.sel = 0;
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
