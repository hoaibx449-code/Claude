// Builds assets/icons/tabler.json (line-art icons drawn stroke by stroke) from @tabler/icons (MIT).
// Brand logos are left out (trademarks). Run: node tools/build-icons.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const dir = 'node_modules/@tabler/icons';
const nodes = JSON.parse(readFileSync(`${dir}/tabler-nodes-outline.json`, 'utf8'));
const out = {};
const r = (v) => Math.round(Number(v) * 100) / 100;
for (const [name, list] of Object.entries(nodes)) {
  if (name.startsWith('brand-')) continue;
  const ds = [];
  for (const [tag, a] of list) {
    if (tag === 'path') ds.push(a.d);
    else if (tag === 'circle') { const cx = r(a.cx), cy = r(a.cy), rr = r(a.r); ds.push(`M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 ${-2 * rr} 0`); }
    else if (tag === 'rect') { const x = r(a.x), y = r(a.y), w = r(a.width), h = r(a.height); ds.push(`M${x} ${y}h${w}v${h}h${-w}z`); }
  }
  if (ds.length) out[name] = ds.join('|');
}
mkdirSync('assets/icons', { recursive: true });
writeFileSync('assets/icons/tabler.json', JSON.stringify(out));
copyFileSync(`${dir}/LICENSE`, 'assets/icons/LICENSE-tabler.txt');
console.log(Object.keys(out).length, 'icons');
