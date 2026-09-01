import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');

export async function readAssets() {
  const src = await readFile(join(root, 'sw.js'), 'utf8');
  const block = src.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!block) throw new Error('sw.js: could not find the ASSETS list');
  return (block[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
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
    const bytes = await readFile(join(root, rel));
    parts.push(rel + ':' + createHash('sha256').update(bytes).digest('hex'));
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 10);
}

export async function currentBuild() {
  const src = await readFile(join(root, 'sw.js'), 'utf8');
  const found = src.match(/const BUILD = '([^']*)';/);
  return found ? found[1] : null;
}
