import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');

// What the service worker actually precaches: its SHELL list, plus the deck
// files it resolves from the deck index at install time. Expanding the index
// here is what keeps the build hash honest, since a deck that never reaches
// this list would never change the hash and an installed app would go on
// serving the old cards.
export async function readAssets() {
  const src = await readFile(join(root, 'sw.js'), 'utf8');
  const block = src.match(/const SHELL = \[([\s\S]*?)];/);
  if (!block) throw new Error('sw.js: could not find the SHELL list');
  const shell = (block[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));

  // DECK_INDEX appears in SHELL by name, so the quoted paths above do not
  // include it. Read it from its own line instead of hardcoding the path.
  const named = src.match(/const DECK_INDEX = '([^']+)';/);
  if (!named) throw new Error('sw.js: could not find the DECK_INDEX path');
  const indexPath = named[1];

  const rel = indexPath.replace(/^\.\//, '');
  const index = JSON.parse(await readFile(join(root, rel), 'utf8'));
  const decks = (index.decks || [])
    .filter((deck) => deck && deck.file)
    .map((deck) => rel.replace(/[^/]+$/, '') + deck.file)
    .map((path) => './' + path);

  const all = shell.concat([indexPath], decks);
  return all.filter((asset, i) => all.indexOf(asset) === i);
}

// A fingerprint of everything the service worker precaches. When any shipped
// file changes this changes, which changes the cache name, which is what makes
// an installed app actually pick the new code up.
export async function buildHash() {
  const assets = await readAssets();
  const parts = [];
  for (const asset of assets.slice().sort()) {
    const rel = asset.replace(/^\.\//, '');
    if (rel === '') continue;
    // A precached path with no file behind it is a real problem, but it is
    // validate.js that has to say so in its own report. Hashing must not throw
    // on the way there, so record it as missing and let the check speak.
    let bytes = null;
    try {
      bytes = await readFile(join(root, rel));
    } catch (err) {
      parts.push(rel + ':missing');
      continue;
    }
    parts.push(rel + ':' + createHash('sha256').update(bytes).digest('hex'));
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 10);
}

export async function currentBuild() {
  const src = await readFile(join(root, 'sw.js'), 'utf8');
  const found = src.match(/const BUILD = '([^']*)';/);
  return found ? found[1] : null;
}
