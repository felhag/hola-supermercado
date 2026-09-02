import { store, getSettings, saveSettings, addHistory, getHistory } from './store.js';
import { loadIndex, loadDeck, shuffle } from './content.js';
import { newState, grade, isDue, isNew, strength, MAX_BOX } from './srs.js';
import { el, render, plural, confetti, countUp } from './ui.js';
import { pickKind, renderDrill, KIND_LABEL } from './drills.js';

const VERSION = '1.0.0';

const view = document.getElementById('view');
const titleEl = document.getElementById('topbar-title');
const badgeEl = document.getElementById('offline-badge');

const app = {
  db: null,
  decks: [],
  cards: [],
  progress: new Map(),
  settings: null,
  session: null,
  drill: null,
  installPrompt: null,
  route: 'home'
};

function stateFor(card) {
  let state = app.progress.get(card.id);
  if (!state) {
    state = newState(card.id, card.deck);
    app.progress.set(card.id, state);
  }
  return state;
}

// null is the default and means every deck, including any added later. A list
// is an explicit pick, and an empty list is an explicit none, which is what
// "Deselect all" leaves behind.
function selectedDecks() {
  const ids = new Set(app.decks.map((d) => d.meta.id));
  const chosen = app.settings.decks;
  if (!chosen) return ids;
  const filtered = chosen.filter((id) => ids.has(id));
  // Ids that no longer exist are stale settings, not a choice to drill nothing.
  if (!filtered.length && chosen.length) return ids;
  return new Set(filtered);
}

// With the schedule off, nothing is held back for later: every card in the
// chosen decks is fair game. Boxes and due dates still advance underneath, so
// switching spacing back on later picks up where the real schedule got to.
function scheduleOff() {
  return app.settings.schedule === 'off';
}

function deckStats(deck, now) {
  let due = 0;
  let fresh = 0;
  let learned = 0;
  let points = 0;
  for (const card of deck.cards) {
    const state = stateFor(card);
    if (isNew(state)) fresh += 1;
    else if (isDue(state, now)) due += 1;
    if (state.box >= 4) learned += 1;
    points += strength(state);
  }
  const total = deck.cards.length;
  return {
    due, fresh, learned, total, points,
    progress: total ? points / total : 0,
    ready: scheduleOff() ? total : due + fresh
  };
}

/* ---------- home ---------- */

function home() {
  app.session = null;
  app.drill = null;
  app.route = 'home';
  titleEl.textContent = 'Hola supermercado';

  const now = Date.now();
  const selected = selectedDecks();
  let ready = 0;
  let solid = 0;
  let points = 0;
  let total = 0;

  const deckRows = app.decks.map((deck) => {
    const stats = deckStats(deck, now);
    const on = selected.has(deck.meta.id);
    if (on) {
      ready += stats.ready;
      solid += stats.learned;
      points += stats.points;
      total += stats.total;
    }
    // Two numbers, two layers on the bar: how far the deck has come overall,
    // and how much of it is already solid.
    const pct = Math.round(stats.progress * 100);
    const solidPct = Math.round((stats.learned / stats.total) * 100);
    const line = scheduleOff()
      ? stats.total + ' cards, all available, ' + pct + '% learned'
      : stats.total + ' cards, ' + stats.due + ' due, ' + stats.fresh + ' new, ' + pct + '% learned';
    return el('button', {
      class: 'deck',
      'aria-pressed': on ? 'true' : 'false',
      onclick: () => toggleDeck(deck.meta.id)
    }, [
      el('span', { class: 'check', text: on ? '✓' : '' }),
      el('span', { class: 'grow' }, [
        el('div', { class: 'deck-name', text: deck.meta.name }),
        el('div', { class: 'tiny muted', text: line }),
        el('div', { class: 'bar' }, [
          el('span', { class: 'soft', style: 'width:' + pct + '%' }),
          el('span', { class: 'strong', style: 'width:' + solidPct + '%' })
        ])
      ])
    ]);
  });

  const planned = Math.min(ready, app.settings.sessionSize);
  const start = el('button', {
    class: 'btn primary',
    text: planned
      ? 'Start session, ' + plural(planned, 'card', 'cards')
      : (total === 0 ? 'Pick a deck to start' : 'Nothing due right now'),
    disabled: planned === 0,
    onclick: startSession
  });

  render(view, [
    el('div', { class: 'card' }, [
      el('div', { class: 'stat' }, [
        el('div', {}, [el('b', { text: String(ready) }), el('span', { class: 'small muted', text: 'ready now' })]),
        el('div', {}, [
          el('b', { text: (total ? Math.round((points / total) * 100) : 0) + '%' }),
          el('span', { class: 'small muted', text: 'learned, ' + solid + ' solid' })
        ]),
        el('div', {}, [el('b', { text: String(total) }), el('span', { class: 'small muted', text: 'cards picked' })])
      ])
    ]),
    start,
    total === 0
      ? el('p', { class: 'small muted', text: 'No decks picked. Tap one below, or use Select all.' })
      : null,
    planned === 0 && total > 0
      ? el('p', { class: 'small muted', text: 'Everything you picked is scheduled for later. Add a deck below, come back tomorrow, or switch off spacing in settings.' })
      : null,
    scheduleOff()
      ? el('p', { class: 'small muted', text: 'Spacing is off, so every card stays available. Weakest words come up first.' })
      : null,
    el('h2', { text: 'Decks' }),
    el('p', { class: 'small muted', text: 'A deck is a themed pile of cards. Tap one to include or exclude it. The bar fills as cards climb the boxes, and the darker part is what is already solid.' }),
    el('div', { class: 'pick-row' }, [
      el('button', {
        class: 'btn pick',
        text: 'Select all',
        disabled: selected.size === app.decks.length,
        onclick: () => setDecks(null)
      }),
      el('button', {
        class: 'btn pick',
        text: 'Deselect all',
        disabled: selected.size === 0,
        onclick: () => setDecks([])
      })
    ]),
    el('div', {}, deckRows),
    app.db && app.db.degraded
      ? el('p', { class: 'small muted', text: 'This browser refused IndexedDB, so progress is kept in localStorage instead.' })
      : null
  ]);
}

async function toggleDeck(id) {
  const selected = selectedDecks();
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  await setDecks(Array.from(selected));
}

async function setDecks(ids) {
  app.settings.decks = ids;
  await saveSettings(app.settings);
  home();
}

/* ---------- session ---------- */

function buildQueue() {
  const now = Date.now();
  const selected = selectedDecks();
  const items = [];
  const ignore = scheduleOff();
  for (const card of app.cards) {
    if (!selected.has(card.deck)) continue;
    const state = stateFor(card);
    if (ignore || isDue(state, now)) items.push({ card, state });
  }
  // Sort before slicing, so shuffle first: sorting is stable, which means cards
  // that tie on priority keep the order they came in, and they came in deck by
  // deck. Ties are the normal case (every new card is box 1, last 0), so an
  // unshuffled sort filled the whole session from the first deck picked and
  // never reached the others. Shuffling first turns those ties into a random
  // draw across the decks while real differences in priority still win.
  if (ignore) {
    // Nothing is gated by a date, so lead with the weakest and least recently
    // seen instead of whatever happens to be at the top of the deck.
    const ranked = shuffle(items).sort((a, b) => (a.state.box - b.state.box) || (a.state.last - b.state.last));
    return shuffle(ranked.slice(0, app.settings.sessionSize));
  }
  const reviews = shuffle(items.filter((it) => !isNew(it.state))).sort((a, b) => a.state.due - b.state.due);
  const fresh = shuffle(items.filter((it) => isNew(it.state)));
  return shuffle(reviews.concat(fresh).slice(0, app.settings.sessionSize));
}

function startSession() {
  const queue = buildQueue();
  if (!queue.length) {
    home();
    return;
  }
  app.session = { queue, index: 0, right: 0, wrong: 0, started: Date.now() };
  app.route = 'session';
  titleEl.textContent = 'Session';
  renderSession();
}

function deckKindOf(id) {
  const deck = app.decks.find((d) => d.meta.id === id);
  return deck ? deck.meta.kind : 'vocab';
}

function poolFor(card) {
  const deck = app.decks.find((d) => d.meta.id === card.deck);
  return deck ? deck.cards : app.cards;
}

function renderSession() {
  const session = app.session;
  const item = session.queue[session.index];
  const kind = pickKind(item.state, deckKindOf(item.card.deck), app.settings.mode, app.settings.direction);
  const pct = Math.round((session.index / session.queue.length) * 100);
  const drillHost = el('div', {});

  render(view, [
    el('div', { class: 'progress' }, [
      el('div', { class: 'bar' }, [el('span', { style: 'width:' + pct + '%' })]),
      el('span', { class: 'tiny muted', text: (session.index + 1) + '/' + session.queue.length })
    ]),
    el('div', { class: 'row-between' }, [
      el('span', { class: 'tiny muted', text: KIND_LABEL[kind] }),
      el('span', { class: 'tiny muted', text: 'box ' + item.state.box + ' of ' + MAX_BOX })
    ]),
    drillHost,
    el('button', { class: 'btn ghost small', text: 'End session', onclick: finishSession })
  ]);

  app.drill = renderDrill(drillHost, {
    card: item.card,
    state: item.state,
    kind,
    pool: poolFor(item.card),
    onAnswer: answer
  });
}

function answer(correct) {
  const session = app.session;
  if (!session) return;
  const item = session.queue[session.index];
  grade(item.state, correct);
  app.progress.set(item.state.id, item.state);
  app.db.saveProgress([item.state]).catch(() => {});

  if (correct) {
    session.right += 1;
  } else {
    session.wrong += 1;
    // One more look before the session ends, but only once per card.
    if (!item.requeued) {
      item.requeued = true;
      session.queue.splice(Math.min(session.index + 4, session.queue.length), 0, item);
    }
  }

  session.index += 1;
  if (session.index >= session.queue.length) finishSession();
  else renderSession();
}

async function finishSession() {
  const session = app.session;
  app.drill = null;
  if (!session) {
    home();
    return;
  }
  app.session = null;
  const answered = session.right + session.wrong;
  if (answered) {
    try {
      await addHistory({
        at: session.started,
        answered,
        right: session.right,
        minutes: Math.round((Date.now() - session.started) / 60000)
      });
    } catch (err) { /* history is a nicety, never block on it */ }
  }
  app.route = 'done';
  titleEl.textContent = 'Done';
  const accuracy = answered ? Math.round((session.right / answered) * 100) : 0;

  // The numbers tick up, so they are hidden from the live region and the final
  // result is announced once instead of on every frame.
  const answeredEl = el('b', { 'aria-hidden': 'true', text: '0' });
  const accuracyEl = el('b', { 'aria-hidden': 'true', text: '0%' });

  render(view, [
    el('div', { class: 'card result' }, [
      el('h2', { text: answered ? 'Session done' : 'Session ended' }),
      answered ? el('div', { class: 'cheer', text: cheerFor(accuracy) }) : null,
      el('div', { class: 'stat' }, [
        el('div', {}, [answeredEl, el('span', { class: 'small muted', text: 'answered' })]),
        el('div', {}, [accuracyEl, el('span', { class: 'small muted', text: 'correct' })])
      ]),
      // Decoration for the numbers above, which the live region already reads
      // out, so it stays out of the accessibility tree.
      answered
        ? el('div', { class: 'bar score', 'aria-hidden': 'true' }, [
            el('span', { class: scoreTone(accuracy), style: 'width:' + accuracy + '%' })
          ])
        : null,
      el('span', { class: 'sr-only', text: answered + ' answered, ' + accuracy + '% correct' })
    ]),
    el('div', { class: 'stack' }, [
      el('button', { class: 'btn primary', text: 'Another round', onclick: startSession }),
      el('button', { class: 'btn ghost', text: 'Back to decks', onclick: home })
    ])
  ]);

  countUp(answeredEl, answered, '');
  countUp(accuracyEl, accuracy, '%');
  // A session ended at zero cards is not worth celebrating, and a rough one
  // gets a smaller party than a clean sweep.
  confetti(answered ? partySize(accuracy) : 0);
}

function cheerFor(accuracy) {
  if (accuracy === 100) return '¡Perfecto!';
  if (accuracy >= 80) return '¡Muy bien!';
  if (accuracy >= 50) return '¡Bien hecho!';
  return '¡Sigue así!';
}

function scoreTone(accuracy) {
  if (accuracy >= 80) return 'high';
  if (accuracy >= 50) return 'mid';
  return 'low';
}

function partySize(accuracy) {
  if (accuracy >= 90) return 80;
  if (accuracy >= 70) return 55;
  if (accuracy >= 40) return 32;
  return 16;
}

/* ---------- settings ---------- */

async function settingsView() {
  app.session = null;
  app.drill = null;
  app.route = 'settings';
  titleEl.textContent = 'Settings';

  const history = await getHistory();
  const boxes = [0, 0, 0, 0, 0];
  for (const card of app.cards) boxes[stateFor(card).box - 1] += 1;

  const sizeSel = el('select', { class: 'sel' }, [10, 20, 30, 50].map((n) => el('option', {
    value: String(n),
    text: n + ' cards',
    selected: app.settings.sessionSize === n
  })));
  sizeSel.onchange = () => update('sessionSize', Number(sizeSel.value));

  const modeSel = el('select', { class: 'sel' }, [
    el('option', { value: 'adaptive', text: 'Adaptive, gets harder', selected: app.settings.mode === 'adaptive' }),
    el('option', { value: 'flash', text: 'Flashcards only', selected: app.settings.mode === 'flash' }),
    el('option', { value: 'choice', text: 'Multiple choice only', selected: app.settings.mode === 'choice' }),
    el('option', { value: 'type', text: 'Typing only', selected: app.settings.mode === 'type' })
  ]);
  modeSel.onchange = () => update('mode', modeSel.value);

  const dirSel = el('select', { class: 'sel' }, [
    el('option', { value: 'both', text: 'Both ways', selected: app.settings.direction === 'both' }),
    el('option', { value: 'es-first', text: 'Spanish shown, you type the English', selected: app.settings.direction === 'es-first' }),
    el('option', { value: 'target-first', text: 'English shown, you type the Spanish', selected: app.settings.direction === 'target-first' })
  ]);
  dirSel.onchange = () => update('direction', dirSel.value);

  const schedSel = el('select', { class: 'sel' }, [
    el('option', { value: 'spaced', text: 'Spaced, 1 to 21 days apart', selected: app.settings.schedule !== 'off' }),
    el('option', { value: 'off', text: 'Off, keep everything available', selected: app.settings.schedule === 'off' })
  ]);
  schedSel.onchange = () => update('schedule', schedSel.value);

  const reset = el('button', { class: 'btn bad', text: 'Reset all progress' });
  reset.onclick = () => {
    if (reset.dataset.armed !== '1') {
      reset.dataset.armed = '1';
      reset.textContent = 'Tap again to erase everything';
      return;
    }
    app.db.clearProgress().then(() => {
      app.progress = new Map();
      home();
    });
  };

  // The escape hatch for a stale cache. Unregistering and emptying the caches
  // makes the next load fetch everything from the network again; progress lives
  // in IndexedDB and is untouched.
  const forceUpdate = el('button', { class: 'btn ghost', text: 'Clear cache and reload' });
  forceUpdate.onclick = async () => {
    forceUpdate.disabled = true;
    forceUpdate.textContent = 'Clearing...';
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
      if (window.caches) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
    } catch (err) { /* reload anyway, a partial clear still helps */ }
    location.reload();
  };

  // Only offered while the browser has an install prompt to give: already
  // installed, or a browser that never fires the event, means no button.
  const installBtn = app.installPrompt
    ? el('button', { class: 'btn ghost', text: 'Install on this device', onclick: install })
    : null;

  const rows = history.slice(-8).reverse().map((h) => el('div', {
    class: 'small muted',
    text: new Date(h.at).toLocaleString() + ', ' + h.answered + ' cards, '
      + Math.round((h.right / h.answered) * 100) + '% correct'
  }));

  render(view, [
    el('div', { class: 'field' }, [el('label', { text: 'Cards per session' }), sizeSel]),
    el('div', { class: 'field' }, [el('label', { text: 'Drill type' }), modeSel]),
    el('div', { class: 'field' }, [el('label', { text: 'Which way round' }), dirSel]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Waiting between reviews' }),
      schedSel,
      el('span', { class: 'tiny muted', text: 'Off is for a long flight: drill anything, any time. Boxes still move, so spacing works normally when you switch it back on.' })
    ]),
    el('h2', { text: 'Leitner boxes' }),
    el('div', { class: 'boxes' }, boxes.map((count, i) => el('div', {}, [
      el('b', { text: String(count) }),
      el('span', { text: String(i + 1) })
    ]))),
    el('p', { class: 'small muted', text: 'Box 1 is new or forgotten, box 5 comes back in three weeks.' }),
    el('h2', { text: 'Recent sessions' }),
    rows.length ? el('div', {}, rows) : el('p', { class: 'small muted', text: 'No sessions yet.' }),
    el('h2', { text: 'Offline' }),
    el('p', { class: 'small muted', id: 'offline-detail', text: 'Checking...' }),
    installBtn,
    installBtn
      ? el('p', { class: 'tiny muted', text: 'Adds the app to your home screen so it opens on its own, without a browser bar.' })
      : null,
    forceUpdate,
    el('p', { class: 'tiny muted', text: 'Use this if the app seems to be running an old version. Your progress is kept, only the cached files are fetched again.' }),
    el('h2', { text: 'Danger zone' }),
    reset,
    el('p', { class: 'tiny muted', text: 'Version ' + VERSION })
  ]);
  updateBadge();
}

async function update(key, value) {
  app.settings[key] = value;
  await saveSettings(app.settings);
  settingsView();
}

/* ---------- service worker ---------- */

function askSw(message, timeout) {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) {
      resolve(null);
      return;
    }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeout || 2500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    sw.postMessage(message, [channel.port2]);
  });
}

async function updateBadge() {
  const detail = document.getElementById('offline-detail');
  const set = (short, cls, long) => {
    badgeEl.textContent = short;
    badgeEl.className = 'badge' + (cls ? ' ' + cls : '');
    if (detail) detail.textContent = long;
  };
  if (!('serviceWorker' in navigator)) {
    set('no offline', 'warn', 'This browser has no service worker support, so the app cannot load without a connection.');
    return;
  }
  const status = await askSw({ type: 'status' });
  if (!status) {
    set('caching', 'muted', 'The service worker has not taken control yet. Reload once while online, then check again.');
    return;
  }
  // The build is the fingerprint of the cached files, so it says which version
  // of the app is actually running rather than which one was published.
  const build = status.version ? ' Build ' + status.version + '.' : '';
  if (status.cached >= status.total) {
    set('offline ready', '', 'All ' + status.total + ' files are cached. Safe to go offline.' + build);
  } else {
    set(status.cached + '/' + status.total, 'warn', 'Only ' + status.cached + ' of ' + status.total
      + ' files are cached. Stay online and reload.' + build);
  }
}

// A cache-first app happily runs last week's code forever. When a new worker
// takes over, say so instead of letting the page quietly stay stale.
function showUpdateBar() {
  const bar = document.getElementById("update-bar");
  if (bar) bar.hidden = false;
}

function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBar();
    hadController = true;
    setTimeout(updateBadge, 400);
  });
}

async function install() {
  const prompt = app.installPrompt;
  if (!prompt) return;
  app.installPrompt = null;
  prompt.prompt();
  try { await prompt.userChoice; } catch (err) { /* dismissed, nothing to do */ }
  // The prompt is single use, so the button has to go whatever the answer was.
  if (app.route === 'settings') settingsView();
}

// The event can arrive at any moment, so only redraw a screen that is showing
// the button. Redrawing mid-session or over the results would lose them.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  app.installPrompt = event;
  if (app.route === 'settings') settingsView();
});

/* ---------- boot ---------- */

document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (app.drill && app.drill.onKey) app.drill.onKey(event);
});

document.getElementById('btn-home').onclick = () => home();
// Bound once at startup: a lazily bound handler meant the button did nothing on
// a bar that was already on screen.
document.getElementById('update-reload').onclick = () => location.reload();
document.getElementById('btn-settings').onclick = () => settingsView();

async function boot() {
  registerSw();
  try {
    app.db = await store();
    app.settings = await getSettings();
    const index = await loadIndex();
    app.decks = await Promise.all(index.decks.map(loadDeck));
    app.cards = app.decks.reduce((all, deck) => all.concat(deck.cards), []);
    app.progress = await app.db.loadProgress();
    home();
  } catch (err) {
    render(view, [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Could not load' }),
        el('p', { class: 'small', text: String(err && err.message ? err.message : err) }),
        el('p', { class: 'small muted', text: 'Serve the folder over http, not file://, then reload.' })
      ])
    ]);
  }
  updateBadge();
}

boot();
