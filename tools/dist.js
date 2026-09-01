import { mkdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readAssets, root } from './build-hash.js';

// The service worker's precache list is the single source of truth for what
// ships, and validate.js already fails if a shipped file is missing from it.
// Deriving the deploy folder from the same list means a new file cannot reach
// production without also being available offline.
const out = join(root, '_site');
await rm(out, { recursive: true, force: true });

const assets = await readAssets();
let copied = 0;
for (const asset of assets) {
  const rel = asset.replace(/^\.\//, '');
  if (rel === '') continue;
  const dest = join(out, rel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(join(root, rel), dest);
  copied += 1;
}

// The worker itself is not in its own precache list, and Pages needs .nojekyll
// so that the js/ and data/ folders are served untouched.
for (const extra of ['sw.js', '.nojekyll']) {
  await copyFile(join(root, extra), join(out, extra));
  copied += 1;
}

// Any unknown path should still boot the app rather than GitHub's 404 page.
await writeFile(join(out, '404.html'), await readFile(join(root, 'index.html')));
copied += 1;

console.log('_site ready: ' + copied + ' files');
