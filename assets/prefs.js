'use strict';
// Viewing preferences that drive the personalised rows (see tmdb.js): streaming services, genres and titles the
// viewer loves. Stored only on the device. The "For you" screen edits them with the remote alone, no typing.

const PREFS_KEY = 'fl.prefs';
const PREFS_ASKED_KEY = 'fl.prefsAsked';
const DEFAULT_REGION = 'US';

// "en-GB" -> "GB". TMDB wants the region to decide which services carry a title.
function regionFromLocale() {
  const match = /[-_]([A-Za-z]{2})\b/.exec(navigator.language || '');
  return match ? match[1].toUpperCase() : DEFAULT_REGION;
}

const prefs = {
  get() {
    return { region: regionFromLocale(), providers: [], genres: [], loved: [], ...storage.read(PREFS_KEY) };
  },
  save(value) {
    storage.write(PREFS_KEY, value);
  },
  exists: () => !!storage.read(PREFS_KEY),
};

// ---------- screen ----------
const prefsState = { page: 0, sel: 0, draft: null, providers: [], titles: [], loading: false, error: false };
let prefsFocusables = [];

const prefsOpen = () => !$('#prefs').hidden;
const toggled = (list, value) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

const PREFS_PAGES = [
  () => ({
    title: 'Your streaming services',
    body: 'Pick the ones you have. Recommendations will only show titles you can actually watch.',
    items: prefsState.providers.map((provider) => ({
      label: provider.name,
      on: prefsState.draft.providers.includes(provider.id),
      run: () => (prefsState.draft.providers = toggled(prefsState.draft.providers, provider.id)),
    })),
  }),
  () => ({
    title: 'What do you like?',
    body: 'Pick any genres. Leave all off to see everything.',
    items: GENRES.map((genre) => ({
      label: genre.label,
      on: prefsState.draft.genres.includes(genre.id),
      run: () => (prefsState.draft.genres = toggled(prefsState.draft.genres, genre.id)),
    })),
  }),
  () => ({
    title: 'Titles you love',
    body: 'Pick a few. Each one gets its own “Because you liked…” row (the last three you pick are used).',
    items: prefsState.titles.map((item) => {
      const seed = { id: item.tmdb, media: mediaOf(item.type), title: item.title };
      const same = (x) => x.id === seed.id && x.media === seed.media;
      return {
        label: item.title,
        sub: item.by.split(META_SEPARATOR_RE)[0],
        on: prefsState.draft.loved.some(same),
        run: () =>
          (prefsState.draft.loved = prefsState.draft.loved.some(same)
            ? prefsState.draft.loved.filter((x) => !same(x))
            : [...prefsState.draft.loved, seed]),
      };
    }),
  }),
];

function prefsView() {
  if (prefsState.loading) return { title: 'Loading…', body: 'Getting the latest choices.', items: [], buttons: [] };
  if (prefsState.error)
    return {
      title: 'Couldn’t load choices',
      body: 'Check the connection and try again.',
      items: [],
      buttons: [{ label: 'Close', run: closePrefs }],
    };
  const last = prefsState.page === PREFS_PAGES.length - 1;
  const page = PREFS_PAGES[prefsState.page]();
  const buttons = [
    last ? { label: 'Save', run: savePrefs } : { label: 'Next', run: nextPrefsPage },
    prefsState.page > 0 ? { label: 'Back', run: prevPrefsPage } : { label: 'Cancel', run: closePrefs },
  ];
  return { ...page, buttons };
}

function renderPrefs() {
  const view = prefsView();
  $('#pstep').textContent =
    prefsState.loading || prefsState.error ? '' : 'Step ' + (prefsState.page + 1) + ' of ' + PREFS_PAGES.length;
  $('#ptitle').textContent = view.title;
  $('#pbody').textContent = view.body;
  const buttons = $('#pbtns');
  const list = $('#plist');
  buttons.textContent = '';
  list.textContent = '';
  prefsFocusables = [];
  // Buttons come first in focus order (and sit above the list) so a long list never hides Next.
  view.buttons.forEach((button) => {
    const node = el('div', 'sbtn', button.label);
    buttons.appendChild(node);
    prefsFocusables.push({ node, run: button.run });
  });
  view.items.forEach((item) => {
    const row = el('div', 'sitem');
    row.append(el('span', null, item.label), el('span', 'ssub', item.on ? '✓' : item.sub || ''));
    list.appendChild(row);
    prefsFocusables.push({
      node: row,
      run: () => {
        item.run();
        renderPrefs(); // keeps the selection index, so the cursor stays on the toggled row
      },
    });
  });
  prefsState.sel = clamp(prefsState.sel, 0, prefsFocusables.length - 1);
  paintPrefsFocus();
}

function paintPrefsFocus() {
  prefsFocusables.forEach((entry, index) => entry.node.classList.toggle('focus', index === prefsState.sel));
  const current = prefsFocusables[prefsState.sel];
  if (current) current.node.scrollIntoView({ block: 'nearest' });
}

function goToPrefsPage(page) {
  prefsState.page = clamp(page, 0, PREFS_PAGES.length - 1);
  prefsState.sel = 0; // the first button
  renderPrefs();
}
const nextPrefsPage = () => goToPrefsPage(prefsState.page + 1);
const prevPrefsPage = () => goToPrefsPage(prefsState.page - 1);

function openPrefs() {
  storage.write(PREFS_ASKED_KEY, true);
  prefsState.draft = prefs.get();
  prefsState.loading = true;
  prefsState.error = false;
  $('#prefs').hidden = false;
  goToPrefsPage(0);
  Promise.all([tmdbProviders(prefsState.draft.region), tmdbPickList()])
    .then(([providers, titles]) => {
      prefsState.providers = providers;
      prefsState.titles = titles;
      prefsState.loading = false;
      if (prefsOpen()) goToPrefsPage(0);
    })
    .catch(() => {
      prefsState.loading = false;
      prefsState.error = true;
      if (prefsOpen()) renderPrefs();
    });
}

function closePrefs() {
  $('#prefs').hidden = true;
}

function savePrefs() {
  prefs.save(prefsState.draft);
  closePrefs();
  toast('Recommendations updated');
  rebuildAll();
}

// Asks once, for someone who finished setup before this existed (new installs get it at the end of setup).
function maybePromptPrefs() {
  if (tmdbEnabled() && !setupOpen() && !prefs.exists() && !storage.read(PREFS_ASKED_KEY)) openPrefs();
}

function prefsKey(key) {
  const move = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[key];
  if (move) {
    prefsState.sel = clamp(prefsState.sel + move, 0, prefsFocusables.length - 1);
    paintPrefsFocus();
  } else if (key === 'Enter' || key === ' ') {
    const current = prefsFocusables[prefsState.sel];
    if (current) current.run();
  } else if (key === 'Escape' || key === 'Backspace') prefsBack();
}

// Back: previous page, or leave without saving from the first.
function prefsBack() {
  if (prefsState.page === 0 || prefsState.loading || prefsState.error) closePrefs();
  else prevPrefsPage();
}
