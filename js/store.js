const DB_NAME = 'es-trainer';
const DB_VERSION = 1;

let dbPromise = null;
let fallback = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexeddb blocked'));
  });
  return dbPromise;
}

// Private windows and locked-down browsers can refuse IndexedDB outright. Rather
// than losing the session, fall back to localStorage with the same shape.
function localFallback() {
  if (fallback) return fallback;
  const read = (key, dflt) => {
    try {
      const raw = localStorage.getItem(DB_NAME + ':' + key);
      return raw ? JSON.parse(raw) : dflt;
    } catch (err) {
      return dflt;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(DB_NAME + ':' + key, JSON.stringify(value));
    } catch (err) { /* out of quota: keep going in memory */ }
  };
  let progress = read('progress', {});
  let meta = read('meta', {});
  fallback = {
    degraded: true,
    async loadProgress() { return new Map(Object.entries(progress)); },
    async saveProgress(states) {
      for (const st of states) progress[st.id] = st;
      write('progress', progress);
    },
    async clearProgress() { progress = {}; write('progress', progress); },
    async getMeta(key, dflt) { return key in meta ? meta[key] : dflt; },
    async setMeta(key, value) { meta[key] = value; write('meta', meta); }
  };
  return fallback;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function real() {
  const db = await openDb();
  return {
    degraded: false,
    async loadProgress() {
      const rows = await reqDone(tx(db, 'progress', 'readonly').getAll());
      return new Map(rows.map((r) => [r.id, r]));
    },
    async saveProgress(states) {
      const t = db.transaction('progress', 'readwrite');
      const store = t.objectStore('progress');
      for (const st of states) store.put(st);
      return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async clearProgress() {
      await reqDone(tx(db, 'progress', 'readwrite').clear());
    },
    async getMeta(key, dflt) {
      const value = await reqDone(tx(db, 'meta', 'readonly').get(key));
      return value === undefined ? dflt : value;
    },
    async setMeta(key, value) {
      await reqDone(tx(db, 'meta', 'readwrite').put(value, key));
    }
  };
}

let backendPromise = null;

export function store() {
  if (!backendPromise) {
    backendPromise = real().catch(() => localFallback());
  }
  return backendPromise;
}

export const DEFAULT_SETTINGS = {
  sessionSize: 20,
  mode: 'adaptive',
  direction: 'both',
  schedule: 'spaced',
  decks: null
};

export async function getSettings() {
  const db = await store();
  const saved = await db.getMeta('settings', {});
  return Object.assign({}, DEFAULT_SETTINGS, saved);
}

export async function saveSettings(settings) {
  const db = await store();
  await db.setMeta('settings', settings);
}

export async function addHistory(entry) {
  const db = await store();
  const history = await db.getMeta('history', []);
  history.push(entry);
  await db.setMeta('history', history.slice(-60));
}

export async function getHistory() {
  const db = await store();
  return db.getMeta('history', []);
}
