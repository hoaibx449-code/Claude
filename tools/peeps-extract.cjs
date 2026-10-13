// Turns the Open Peeps pieces (CC0 artwork by Pablo Stanley, packaged by react-peeps, MIT) into
// plain path data the engine draws: node tools/peeps-extract.cjs <react-peeps>/lib/peeps out.json
// Each piece: list of [d, fill, transform] where fill is "ink" (outline), "bg" (paper white) or a colour.
const fs = require('fs'), path = require('path'), Module = require('module');
const [, , lib, out] = process.argv;
const INK = '#INK', BG = '#BG';
// a React stand-in that just builds the element tree
const React = {
  Fragment: 'frag',
  createElement(type, props, ...children) {
    props = { ...(props || {}), children: children.flat(9).filter((c) => c != null && c !== false) };
    if (typeof type === 'function') return type(props);
    return { type, props };
  },
  useMemo: (f) => f(),
};
const load = Module._load;
Module._load = function (req, parent, isMain) { return req === 'react' ? { __esModule: true, default: React, ...React } : load.apply(this, arguments); };

const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function parseT(s) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of String(s || '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0] || 0, v[1] || 0]);
    else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
    else if (fn === 'matrix') m = mul(m, v);
    else if (fn === 'rotate') { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a); const r = [c, s2, -s2, c, 0, 0]; m = v.length > 2 ? mul(mul(mul(m, [1, 0, 0, 1, v[1], v[2]]), r), [1, 0, 0, 1, -v[1], -v[2]]) : mul(m, r); }
  }
  return m;
}
const fillOf = (f) => (f === INK ? 'ink' : f === BG ? 'bg' : f && f !== 'none' ? f : f === 'none' ? 'none' : 'ink');
function collect(node, m, list) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collect(n, m, list)); return; }
  const { type, props } = node;
  const mm = props.transform ? mul(m, parseT(props.transform)) : m;
  let d = null;
  if (type === 'path') d = props.d;
  else if (type === 'circle') { const { cx = 0, cy = 0, r } = props; d = `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`; }
  else if (type === 'ellipse') { const { cx = 0, cy = 0, rx, ry } = props; d = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`; }
  else if (type === 'rect') { const { x = 0, y = 0, width: w, height: h } = props; d = `M${x} ${y}h${w}v${h}h${-w}Z`; }
  else if (type === 'polygon' || type === 'polyline') d = 'M' + String(props.points).trim().replace(/\s+/g, ' ') + (type === 'polygon' ? 'Z' : '');
  if (d) list.push([d, fillOf(props.fill), mm.map((x) => Math.round(x * 1000) / 1000), props.fillRule === 'evenodd' || props['fill-rule'] === 'evenodd' ? 1 : 0]);
  (props.children || []).forEach((c) => collect(c, mm, list));
}
const res = {};
const groups = { standing: 'pose/standing', sitting: 'pose/sitting', bust: 'pose/bust', hair: 'hair', face: 'face', facialHair: 'facialHair', accessories: 'accessories' };
for (const [g, dir] of Object.entries(groups)) {
  res[g] = {};
  for (const f of fs.readdirSync(path.join(lib, dir)).filter((f) => f.endsWith('.js') && !f.startsWith('z_') && f !== 'index.js')) {
    const mod = require(path.join(lib, dir, f));
    const C = mod.default || Object.values(mod).find((v) => typeof v === 'function');
    if (!C) continue;
    const list = [];
    try { collect(React.createElement(C, { strokeColor: INK, backgroundColor: BG }), [1, 0, 0, 1, 0, 0], list); } catch (e) { console.error(g, f, e.message); continue; }
    if (list.length) res[g][f.slice(0, -3)] = list;
  }
  console.error(g, Object.keys(res[g]).length);
}
fs.writeFileSync(out, JSON.stringify(res));
console.error('bytes', fs.statSync(out).size);
