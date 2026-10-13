// Builds the static part of the web app: engine bundle + shared assets.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
for (const dir of ['fonts', 'hands/default', 'icons']) cpSync(join(root, 'assets', dir), join(pub, 'assets', dir), { recursive: true });

// app icons (PNG for phones that do not take SVG)
const { createCanvas, loadImage } = await import('@napi-rs/canvas');
const svg = await loadImage(readFileSync(join(pub, 'icons/icon.svg')));
for (const n of [192, 512]) { const c = createCanvas(n, n); c.getContext('2d').drawImage(svg, 0, 0, n, n); writeFileSync(join(pub, `icons/icon-${n}.png`), c.toBuffer('image/png')); }

// demo videos on the landing page: real templates, designed by the same free rules as for users
const { DEFAULT_TEMPLATES } = await import('./src/templates.ts');
const { splitScript } = await import('./src/compose.ts');
const { cleanSpec } = await import('./src/spec.ts');
const picks = [['lai-kep', 'sunset'], ['chia-luong', 'neon'], ['ke-chuyen', 'comic'], ['ngu-ngon', 'pastel'], ['thoi-quen', 'darkboard'], ['hoc-nhanh', 'chalkboard'], ['gioi-thieu-sp', 'whiteboard'], ['khach-hang', 'kraft']];
// the four genres: same free composer, other ways of bringing the board to life
const genres = [['lai-kep', 'sunset', 'hand'], ['chia-luong', 'cosmos', 'motion'], ['hoc-nhanh', 'manim', 'math'], ['thoi-quen', 'bold', 'kinetic']];
const make = ([id, style, mode], intro) => {
  const t = DEFAULT_TEMPLATES.find((x) => x.id === id);
  const spec = cleanSpec({ title: t.title, visual: 'sketch', ratio: '9:16', style, mode, channel: 'Nét Vẽ', scenes: splitScript(t.text).map((lines) => ({ lines })).slice(0, 4),
    intro: intro ? { title: t.title, badge: 'MẸO TÀI CHÍNH', icon: 'sparkles' } : null }, 'demo');
  return { id, title: t.title, style, mode: mode || 'hand', spec };
};
const demos = [...picks.map((p, i) => make(p, i === 0)), ...genres.slice(1).map((g) => make(g))];
writeFileSync(join(pub, 'demos.json'), JSON.stringify(demos));
console.log('web/public built');
