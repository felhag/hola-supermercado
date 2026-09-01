import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, posix } from 'node:path';
import { buildHash, currentBuild } from './build-hash.js';

const root = resolve(import.meta.dirname, '..');
const decksDir = join(root, 'data', 'decks');
const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(relative(root, path) + ': invalid JSON, ' + err.message);
    return null;
  }
}

function checkVocab(card, deckId, ids) {
  for (const field of ['id', 'es', 'en']) {
    if (!card[field] || typeof card[field] !== 'string' || !card[field].trim()) {
      fail(deckId + '/' + (card.id || '?') + ': missing ' + field);
    }
  }
  if (ids.has(card.id)) fail(deckId + '/' + card.id + ': duplicate id');
  ids.add(card.id);
}

function checkCloze(card, deckId, ids) {
  for (const field of ['id', 'text', 'answer', 'es', 'en']) {
    if (!card[field] || typeof card[field] !== 'string' || !card[field].trim()) {
      fail(deckId + '/' + (card.id || '?') + ': missing ' + field);
    }
  }
  if (ids.has(card.id)) fail(deckId + '/' + card.id + ': duplicate id');
  ids.add(card.id);
  if (typeof card.text === 'string' && !card.text.includes('___')) {
    fail(deckId + '/' + card.id + ': text has no ___ gap');
  }
  if (!Array.isArray(card.choices) || card.choices.length < 2) {
    fail(deckId + '/' + card.id + ': needs at least two choices');
  } else {
    if (!card.choices.includes(card.answer)) {
      fail(deckId + '/' + card.id + ': answer "' + card.answer + '" is not among the choices');
    }
    if (new Set(card.choices).size !== card.choices.length) {
      fail(deckId + '/' + card.id + ': duplicate choices');
    }
  }
  // The full sentence should be the gapped text with the answer dropped in.
  if (typeof card.text === 'string' && typeof card.es === 'string' && typeof card.answer === 'string') {
    if (card.text.replace('___', card.answer) !== card.es) {
      fail(deckId + '/' + card.id + ': es does not match text with the answer filled in');
    }
  }
}

async function checkDecks() {
  const index = await readJson(join(decksDir, 'index.json'));
  if (!index || !Array.isArray(index.decks)) {
    fail('data/decks/index.json: no decks array');
    return { files: [], cards: 0 };
  }
  const ids = new Set();
  const files = ['index.json'];
  let cards = 0;

  for (const meta of index.decks) {
    for (const field of ['id', 'name', 'file', 'kind']) {
      if (!meta[field]) fail('index.json: deck entry missing ' + field);
    }
    if (meta.kind !== 'vocab' && meta.kind !== 'cloze') {
      fail('index.json: deck ' + meta.id + ' has unknown kind "' + meta.kind + '"');
    }
    const path = join(decksDir, meta.file);
    if (!existsSync(path)) {
      fail('index.json: deck file ' + meta.file + ' does not exist');
      continue;
    }
    files.push(meta.file);
    const deck = await readJson(path);
    if (!deck || !Array.isArray(deck.cards)) {
      fail(meta.file + ': no cards array');
      continue;
    }
    if (deck.id !== meta.id) fail(meta.file + ': id "' + deck.id + '" does not match index "' + meta.id + '"');
    for (const card of deck.cards) {
      if (meta.kind === 'cloze') checkCloze(card, meta.id, ids);
      else checkVocab(card, meta.id, ids);
    }
    cards += deck.cards.length;
    notes.push('  ' + meta.id.padEnd(12) + String(deck.cards.length).padStart(4) + ' cards  (' + meta.kind + ')');
  }

  // Anything sitting in the deck folder but never registered is dead weight.
  const onDisk = (await readdir(decksDir)).filter((f) => f.endsWith('.json'));
  for (const file of onDisk) {
    if (!files.includes(file)) fail('data/decks/' + file + ': not registered in index.json');
  }
  return { files, cards };
}

const NOT_CACHED = new Set([
  'README.md', 'serve.ps1', 'sw.js', '.gitignore', '.gitattributes', '.editorconfig', 'package.json', 'package-lock.json', '.nojekyll'
]);

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.github', 'tools', '_site'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(relative(root, full).split('\\').join(posix.sep));
  }
  return out;
}

async function checkServiceWorker() {
  const src = await readFile(join(root, 'sw.js'), 'utf8');
  const block = src.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!block) {
    fail('sw.js: could not find the ASSETS list');
    return;
  }
  const assets = (block[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  const listed = new Set(assets.map((a) => a.replace(/^\.\//, '')));

  for (const asset of assets) {
    const rel = asset.replace(/^\.\//, '');
    if (rel === '') continue;
    if (!existsSync(join(root, rel))) fail('sw.js: precaches "' + asset + '" but that file does not exist');
  }
  if (!listed.has('')) fail('sw.js: should precache "./" so the bare URL works offline');

  for (const file of await walk(root, [])) {
    if (NOT_CACHED.has(file)) continue;
    if (!listed.has(file)) fail('sw.js: "' + file + '" exists but is not precached, so it will be missing offline');
  }
  notes.push('  service worker precaches ' + assets.length + ' files');

  const stamped = await currentBuild();
  const actual = await buildHash();
  if (stamped !== actual) {
    fail('sw.js is stamped "' + stamped + '" but the files hash to "' + actual
      + '". Run: npm run stamp   (without this, an installed app keeps serving the old code)');
  } else {
    notes.push('  build stamp ' + actual + ' matches the shipped files');
  }
}

const { cards } = await checkDecks();
await checkServiceWorker();

console.log('Decks:');
for (const line of notes) console.log(line);
console.log('  total' + String(cards).padStart(11) + ' cards');

if (problems.length) {
  console.log('\n' + problems.length + ' problem(s):');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nAll checks passed.');
