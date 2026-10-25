// Lets Node load the prompt files (*.md) the way wrangler bundles them for the Worker: as a text default export.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
import { readFile } from 'node:fs/promises';
export async function load(url, context, next) {
  if (url.endsWith('.md')) return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(await readFile(new URL(url), 'utf8')) + ';' };
  return next(url, context);
}`));
