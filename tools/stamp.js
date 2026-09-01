import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHash, currentBuild, root } from './build-hash.js';

const swPath = join(root, 'sw.js');
const hash = await buildHash();
const before = await currentBuild();

if (before === hash) {
  console.log('sw.js is already stamped ' + hash + ', nothing to do.');
} else {
  const src = await readFile(swPath, 'utf8');
  if (!/const BUILD = '[^']*';/.test(src)) {
    console.error('sw.js has no BUILD line to stamp.');
    process.exit(1);
  }
  await writeFile(swPath, src.replace(/const BUILD = '[^']*';/, "const BUILD = '" + hash + "';"), 'utf8');
  console.log('sw.js stamped ' + (before || 'none') + ' -> ' + hash);
  console.log('Installed copies will drop the old cache and pick up the new files.');
}
