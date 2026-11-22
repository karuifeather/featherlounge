'use strict';
// First-run setup: make FeatherLounge the home screen, then tidy up other apps.
// It opens once automatically (see SETUP_VERSION) and any time from the "Setup" shortcut.
// Android only lets the user remove apps or pick the home app, so each action hands over to the
// system screen; this file just guides the user there and re-checks when they come back.

const setupState = { step: 0, sel: 0, homeAsked: false, apps: [] };

const setupOpen = () => !$('#setup').hidden;
const setupDone = () => storage.read(SETUP_KEY) >= SETUP_VERSION;
const setupCompleted = () => storage.read(SETUP_COMPLETED_KEY) >= SETUP_VERSION;

function nativeJson(call, fallback) {
  try {
    return JSON.parse(bridge[call]());
  } catch (e) {
    return fallback;
  }
}

const loadRemovableApps = () => nativeJson('removableApps', []).sort((a, b) => a.label.localeCompare(b.label));
const isDefaultHome = () => !!(bridge.isDefaultHome && bridge.isDefaultHome());

// debloat/packages.txt becomes window.DEBLOAT_LIST at build time (absent when run from a desktop browser).
const debloatNotes = new Map((window.DEBLOAT_LIST || []).map((entry) => [entry.pkg, entry]));

// Listed apps first, then the apps the user installed themselves.
function cleanupCandidates(apps) {
  const listed = apps.filter((app) => debloatNotes.has(app.pkg));
  const own = apps.filter((app) => !app.system && !debloatNotes.has(app.pkg));
  return listed.concat(own);
}

// ---------- steps ----------
// Each step returns {title, body, hint, items, buttons}; items/buttons are {label, run, sub?}.
const SETUP_STEPS = [
  () => ({
    title: 'Welcome to FeatherLounge',
    body: 'Two quick things: make this your home screen, then clear out apps you never use.',
    hint: 'You can skip any step and come back later from Setup in the top bar.',
    buttons: [
      { label: 'Start', run: nextSetupStep },
      { label: 'Skip setup', run: finishSetup },
    ],
  }),
  () => {
    const isHome = isDefaultHome();
    // Android recorded the choice but the TV's own launcher still takes over (common on Google TV).
    const ignored = !isHome && !!(bridge.isHomeRoleHeld && bridge.isHomeRoleHeld());
    if (isHome || ignored) {
      return {
        title: isHome ? 'FeatherLounge is your home screen ✓' : 'Set, but this TV keeps its own home screen',
        body: isHome
          ? 'The Home button opens FeatherLounge.'
          : 'Android accepted FeatherLounge as the home app, but this TV’s launcher still opens when you press Home. You can open FeatherLounge from the apps row.',
        hint: isHome ? '' : 'Some firmwares can’t be changed this way, see docs/installing.md.',
        buttons: [{ label: 'Next', run: nextSetupStep }],
      };
    }
    return {
      title: 'Make it your home screen',
      body: 'Pressing Home should open FeatherLounge instead of the stock launcher.',
      hint: setupState.homeAsked
        ? 'Nothing changed? Choose “Set as default” in the dialog, or continue.'
        : 'Your TV will ask you to confirm.',
      buttons: [
        { label: 'Set as home screen', run: askForHome },
        { label: setupState.homeAsked ? 'Continue anyway' : 'Skip', run: nextSetupStep },
      ],
    };
  },
  () => {
    const apps = cleanupCandidates(setupState.apps);
    return {
      title: 'Clean up apps',
      body: apps.length
        ? 'Press OK on an app you don’t use. Your own apps are removed; preinstalled ones open App info, where you can Disable them.'
        : 'Nothing obvious to clean up. Preinstalled apps can also be removed with adb (docs/debloat.md).',
      hint: 'Launchers, keyboards, Play services and Settings are never listed. SmartTube and Stremio are kept.',
      items: apps.map((app) => ({
        label: app.label,
        sub: (debloatNotes.get(app.pkg) || {}).note || (app.system ? 'Disable in App info' : 'Uninstall'),
        run: () => bridge.removeApp(app.pkg),
      })),
      buttons: [{ label: 'Done', run: nextSetupStep }],
    };
  },
  () => ({
    title: 'You’re all set',
    body:
      tmdbEnabled() || traktEnabled()
        ? 'Link Trakt and pick what you like for recommendations that fit you, or just start browsing.'
        : auth.get()
          ? 'Enjoy FeatherLounge.'
          : 'Sign in to YouTube for your own recommendations, or just start browsing.',
    buttons: [
      traktEnabled() && !traktLinked() ? { label: 'Link Trakt', run: () => finishSetup(startTraktLink, true) } : null,
      tmdbEnabled() ? { label: 'Personalize recommendations', run: () => finishSetup(openPrefs, true) } : null,
      auth.get() ? null : { label: 'Sign in to YouTube', run: () => finishSetup(startLogin, true) },
      { label: 'Start browsing', run: () => finishSetup(null, true) },
    ].filter(Boolean),
  }),
];

// ---------- rendering ----------
let setupFocusables = [];

function renderSetup() {
  const step = SETUP_STEPS[setupState.step]();
  $('#sstep').textContent = 'Step ' + (setupState.step + 1) + ' of ' + SETUP_STEPS.length;
  $('#stitle').textContent = step.title;
  $('#sbody').textContent = step.body;
  $('#shint').textContent = step.hint || '';

  const list = $('#slist');
  const buttons = $('#sbtns');
  list.textContent = '';
  buttons.textContent = '';
  setupFocusables = [];
  (step.items || []).forEach((item) => {
    const row = el('div', 'sitem');
    row.append(el('span', null, item.label), el('span', 'ssub', item.sub));
    list.appendChild(row);
    setupFocusables.push({ node: row, run: item.run });
  });
  step.buttons.forEach((button) => {
    const node = el('div', 'sbtn', button.label);
    buttons.appendChild(node);
    setupFocusables.push({ node, run: button.run });
  });
  setupState.sel = clamp(setupState.sel, 0, setupFocusables.length - 1);
  paintSetupFocus();
}

function paintSetupFocus() {
  setupFocusables.forEach((entry, index) => entry.node.classList.toggle('focus', index === setupState.sel));
  const current = setupFocusables[setupState.sel];
  if (current) current.node.scrollIntoView({ block: 'nearest' });
}

// Lands on the first button of the new step (a list's items are focusable too, but start on the safe action).
function goToSetupStep(step) {
  setupState.step = clamp(step, 0, SETUP_STEPS.length - 1);
  if (setupState.step === 2) setupState.apps = loadRemovableApps();
  renderSetup();
  const firstButton = setupFocusables.findIndex((entry) => entry.node.classList.contains('sbtn'));
  setupState.sel = Math.max(0, firstButton);
  paintSetupFocus();
}

const nextSetupStep = () => goToSetupStep(setupState.step + 1);

// ---------- actions ----------
function askForHome() {
  setupState.homeAsked = true;
  bridge.requestHome();
  renderSetup();
}

function openSetup() {
  setupState.homeAsked = false;
  $('#setup').hidden = false;
  goToSetupStep(0);
}

// Closing always marks setup as seen, so skipping never nags again. Only finishing the last step
// (completed) also removes the Setup shortcut; skipping keeps it so the user can come back.
function finishSetup(after, completed) {
  storage.write(SETUP_KEY, SETUP_VERSION);
  if (completed === true) {
    storage.write(SETUP_COMPLETED_KEY, SETUP_VERSION);
    removeSetupShortcut();
  }
  $('#setup').hidden = true;
  setFocus(1, 0);
  if (typeof after === 'function') after();
}

function removeSetupShortcut() {
  const index = appEls.findIndex((node) => node.dataset.app === 'setup');
  if (index < 0) return;
  appEls[index].remove();
  appEls.splice(index, 1);
}

function maybeStartSetup() {
  if (!setupDone()) openSetup();
}

// Back: previous step, or leave setup from the first step. Never traps the user.
function setupBack() {
  if (setupState.step === 0) finishSetup();
  else goToSetupStep(setupState.step - 1);
}

// Called when the app resumes (e.g. after the home dialog or an uninstall): re-check what changed.
function refreshSetup() {
  if (setupState.step === 1) {
    if (isDefaultHome()) toast('FeatherLounge is now your home screen');
    renderSetup();
  } else if (setupState.step === 2) {
    const selected = setupFocusables[setupState.sel];
    setupState.apps = loadRemovableApps();
    renderSetup();
    if (selected && selected.node.classList.contains('sbtn')) paintSetupFocus();
  }
}

function setupKey(key) {
  const move = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[key];
  if (move) {
    setupState.sel = clamp(setupState.sel + move, 0, setupFocusables.length - 1);
    paintSetupFocus();
  } else if (key === 'Enter' || key === ' ') {
    const current = setupFocusables[setupState.sel];
    if (current) current.run();
  } else if (key === 'Escape' || key === 'Backspace') setupBack();
}
