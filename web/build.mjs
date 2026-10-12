// Builds the static part of the web app: engine bundle + shared assets.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'web/public');
await build({
  entryPoints: [join(root, 'src/engine/browser.ts')],
  bundle: true, format: 'iife', globalName: 'NV', target: 'es2020', minify: true,
  outfile: join(pub, 'engine.js'),
});
mkdirSync(join(pub, 'assets'), { recursive: true });
for (const dir of ['fonts', 'hands/default']) cpSync(join(root, 'assets', dir), join(pub, 'assets', dir), { recursive: true });
console.log('web/public built');
