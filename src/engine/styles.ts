import type { Ctx, StyleKey, ToolKind } from './types.ts';

export interface Style {
  name: string;
  tool: ToolKind;
  ink: string; // colour the line art is drawn in
  sub: string; // subtitles
  channel: string;
  episode: string;
  good: string; // tick marks in diagrams
  accent2: string; // arrows
  /** Extra offset passes of each stroke [dx, dy, alpha, width×]: chalk grain, pencil double line. */
  passes: [number, number, number, number][];
  brush?: boolean; // ink brush: pressure varies along each stroke
  width: number; // stroke width multiplier for this tool
  fills?: string[]; // kraft: colour the shapes after outlining them
  bg(c: Ctx, W: number, H: number): void;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
function grid(c: Ctx, W: number, H: number, step: number, color: (i: number) => string) {
  c.lineWidth = 1;
  for (let i = 0, x = 0; x < W; x += step, i++) { c.strokeStyle = color(i); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let i = 0, y = 0; y < H; y += step, i++) { c.strokeStyle = color(i); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}
function fibers(c: Ctx, W: number, H: number, n: number, rgb: string, maxA: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    c.strokeStyle = `rgba(${rgb},${r() * maxA})`; c.lineWidth = 1;
    const x = r() * W, y = r() * H;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + r() * 30 - 15, y + r() * 6 - 3); c.stroke();
  }
}

export const STYLES: Record<StyleKey, Style> = {
  notebook: {
    name: 'Giấy kem kể chuyện', tool: 'marker', ink: '#2a2a2a', sub: '#3a2f8c', channel: '#5d5873', episode: '#c0392b', good: '#1f7a4c', accent2: '#1d4ed8', passes: [[0, 0, 1, 1]], width: 1,
    bg(c, W, H) { c.fillStyle = '#f3eee2'; c.fillRect(0, 0, W, H); },
  },
  whiteboard: {
    name: 'Bảng trắng', tool: 'marker', ink: '#1d1d1f', sub: '#1d1d1f', channel: '#555', episode: '#d62828', good: '#1f7a4c', accent2: '#1d4ed8', passes: [[0, 0, 1, 1]], width: 1.2,
    bg(c, W, H) { c.fillStyle = '#fbfbf8'; c.fillRect(0, 0, W, H); },
  },
  chalkboard: {
    name: 'Bảng phấn', tool: 'chalk', ink: '#f1f1e8', sub: '#f7d154', channel: '#cfd8cf', episode: '#f7d154', good: '#9be7a6', accent2: '#8fd3ff', passes: [[0, 0, 0.75, 1], [1.2, 0.8, 0.35, 0.7], [-0.8, 1, 0.3, 0.6]], width: 1.1,
    bg(c, W, H) {
      c.fillStyle = '#24402f'; c.fillRect(0, 0, W, H);
      const r = rng(7);
      for (let i = 0; i < (W * H) / 90; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * W, r() * H, 2, 2); }
    },
  },
  kraft: {
    name: 'Giấy kraft', tool: 'colormarker', ink: '#2b1d10', sub: '#2b1d10', channel: '#4a3520', episode: '#b8321f', good: '#2f6b3a', accent2: '#2b1d10', passes: [[0, 0, 1, 1]], width: 1.1, fills: ['#f4c430', '#3f9b5f', '#e2694a', '#5aa0d8'],
    bg(c, W, H) { c.fillStyle = '#c9a77c'; c.fillRect(0, 0, W, H); fibers(c, W, H, 600, '90,60,30', 0.12, 3); },
  },
  oly: {
    name: 'Vở ô ly', tool: 'fountain', ink: '#3a2aa8', sub: '#3a2aa8', channel: '#6b64a8', episode: '#d62828', good: '#1b7f4e', accent2: '#1b7f4e', passes: [[0, 0, 1, 1]], width: 0.8,
    bg(c, W, H) {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      const s = W / 27;
      c.lineWidth = 1;
      for (let i = 0, y = 0; y < H; y += s / 4, i++) {
        c.strokeStyle = i % 4 === 0 ? 'rgba(120,110,210,.5)' : 'rgba(120,110,210,.18)';
        c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      }
      for (let x = 0; x < W; x += s) { c.strokeStyle = 'rgba(120,110,210,.35)'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      c.strokeStyle = 'rgba(214,40,40,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(s * 1.2, 0); c.lineTo(s * 1.2, H); c.stroke();
    },
  },
  pencil: {
    name: 'Sổ phác chì', tool: 'pencil', ink: '#3b3b3b', sub: '#3b3b3b', channel: '#6b6b6b', episode: '#7a7a7a', good: '#3b3b3b',
    accent2: '#3b3b3b', passes: [[0, 0, 0.85, 1], [0.9, -0.6, 0.45, 0.8]], width: 0.65,
    bg(c, W, H) {
      c.fillStyle = '#fbf9f2'; c.fillRect(0, 0, W, H);
      const r = rng(11);
      for (let i = 0; i < (W * H) / 120; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.025})`; c.fillRect(r() * W, r() * H, 1.5, 1.5); }
    },
  },
  blueprint: {
    name: 'Bản vẽ kỹ thuật', tool: 'technical', ink: '#eaf3ff', sub: '#ffe28a', channel: '#bcd3f0', episode: '#ffe28a', good: '#a6f0b6', accent2: '#9fd1ff', passes: [[0, 0, 1, 1]], width: 0.7,
    bg(c, W, H) {
      c.fillStyle = '#1d4e8f'; c.fillRect(0, 0, W, H);
      grid(c, W, H, W / 27, (i) => (i % 5 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.18)'));
    },
  },
  neon: {
    name: 'Neon đêm', tool: 'colormarker', ink: '#f5f3ff', sub: '#fde68a', channel: '#c4b5fd', episode: '#fb923c', good: '#4ade80', accent2: '#22d3ee',
    // a soft glow: a wide faint pass under the sharp line
    passes: [[0, 0, 0.18, 3.2], [0, 0, 0.35, 1.8], [0, 0, 1, 0.9]], width: 1.1,
    bg(c, W, H) {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1a0b3d'); g.addColorStop(1, '#2d0f2a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = rng(13);
      for (let i = 0; i < (W * H) / 500; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.12})`; c.fillRect(r() * W, r() * H, 1.2, 1.2); }
    },
  },
  pastel: {
    name: 'Pastel dễ thương', tool: 'colormarker', ink: '#4a3b6b', sub: '#4a3b6b', channel: '#8b7bb0', episode: '#f472b6', good: '#34d399', accent2: '#60a5fa', passes: [[0, 0, 1, 1]], width: 1.2,
    fills: ['#fde2e4', '#d8f3dc', '#fff1c1', '#dbeafe'],
    bg(c, W, H) {
      c.fillStyle = '#fff7fb'; c.fillRect(0, 0, W, H);
      const r = rng(17);
      for (let i = 0; i < 26; i++) { c.fillStyle = ['rgba(244,114,182,.10)', 'rgba(96,165,250,.10)', 'rgba(52,211,153,.10)'][i % 3]; c.beginPath(); c.arc(r() * W, r() * H, 4 + r() * 10, 0, Math.PI * 2); c.fill(); }
    },
  },
  newspaper: {
    name: 'Báo giấy cổ điển', tool: 'fountain', ink: '#1f1b16', sub: '#1f1b16', channel: '#5c5346', episode: '#9b2c2c', good: '#2f5d3a', accent2: '#1f1b16', passes: [[0, 0, 1, 1]], width: 0.9,
    bg(c, W, H) {
      c.fillStyle = '#efe6d2'; c.fillRect(0, 0, W, H); fibers(c, W, H, 300, '90,70,40', 0.08, 19);
      c.fillStyle = 'rgba(31,27,22,.85)'; c.fillRect(24, 84, W - 48, 3); c.fillRect(24, 90, W - 48, 1);
    },
  },
  comic: {
    name: 'Truyện tranh', tool: 'marker', ink: '#111111', sub: '#111111', channel: '#333', episode: '#e11d48', good: '#16a34a', accent2: '#2563eb', passes: [[0, 0, 1, 1.25]], width: 1.4,
    fills: ['#fde047', '#93c5fd', '#fca5a5', '#86efac'],
    bg(c, W, H) {
      c.fillStyle = '#fffbea'; c.fillRect(0, 0, W, H);
      // halftone dots
      c.fillStyle = 'rgba(234,179,8,.18)';
      const s = W / 36;
      for (let y = 0, row = 0; y < H; y += s, row++) for (let x = row % 2 ? s / 2 : 0; x < W; x += s) { c.beginPath(); c.arc(x, y, s * 0.16, 0, Math.PI * 2); c.fill(); }
    },
  },
  darkboard: {
    name: 'Bảng đen hiện đại', tool: 'chalk', ink: '#f8fafc', sub: '#fb923c', channel: '#94a3b8', episode: '#fb923c', good: '#4ade80', accent2: '#a78bfa', passes: [[0, 0, 0.9, 1], [0.8, 0.6, 0.25, 0.7]], width: 1,
    bg(c, W, H) {
      const g = c.createRadialGradient(W / 2, H / 3, 10, W / 2, H / 2, Math.max(W, H)); g.addColorStop(0, '#1f2937'); g.addColorStop(1, '#0b0f17'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = rng(23);
      for (let i = 0; i < (W * H) / 140; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.035})`; c.fillRect(r() * W, r() * H, 2, 1); }
    },
  },
  sunset: {
    name: 'Hoàng hôn tím cam', tool: 'marker', ink: '#2e1065', sub: '#2e1065', channel: '#6d28d9', episode: '#ea580c', good: '#15803d', accent2: '#7c3aed', passes: [[0, 0, 1, 1]], width: 1.2,
    fills: ['#fed7aa', '#ddd6fe', '#fecaca', '#fde68a'],
    bg(c, W, H) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#faf5ff'); g.addColorStop(0.65, '#fff7ed'); g.addColorStop(1, '#ffedd5'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const b = c.createLinearGradient(0, 0, W, 0); b.addColorStop(0, '#7c3aed'); b.addColorStop(1, '#f97316'); c.fillStyle = b; c.fillRect(0, 0, W, 6); c.fillRect(0, H - 6, W, 6);
    },
  },
  cosmos: {
    name: 'Vũ trụ phẳng (motion)', tool: 'colormarker', ink: '#f8fafc', sub: '#fde68a', channel: '#a5b4fc', episode: '#fb923c', good: '#4ade80', accent2: '#38bdf8', passes: [[0, 0, 1, 1]], width: 1.25,
    fills: ['#f97316', '#a855f7', '#22d3ee', '#facc15'],
    bg(c, W, H) {
      const g = c.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#3b0764'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      const r = rng(29);
      for (let i = 0; i < (W * H) / 900; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; c.beginPath(); c.arc(r() * W, r() * H, 0.6 + r() * 1.4, 0, Math.PI * 2); c.fill(); }
      // a planet rising from a corner
      c.fillStyle = 'rgba(249,115,22,.18)'; c.beginPath(); c.arc(W * 0.95, H * 1.02, Math.min(W, H) * 0.42, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(168,85,247,.22)'; c.beginPath(); c.arc(W * 0.02, H * 0.06, Math.min(W, H) * 0.16, 0, Math.PI * 2); c.fill();
    },
  },
  manim: {
    name: 'Toán học (kiểu Manim)', tool: 'technical', ink: '#ece6e2', sub: '#ece6e2', channel: '#888', episode: '#ffd166', good: '#83c167', accent2: '#58c4dd', passes: [[0, 0, 0.25, 2.4], [0, 0, 1, 1]], width: 0.9,
    bg(c, W, H) {
      c.fillStyle = '#0c0c0f'; c.fillRect(0, 0, W, H);
      grid(c, W, H, Math.min(W, H) / 9, () => 'rgba(88,196,221,.07)');
    },
  },
  bold: {
    name: 'Chữ nổi bật (kinetic)', tool: 'marker', ink: '#ffffff', sub: '#ffffff', channel: '#fde68a', episode: '#fde047', good: '#86efac', accent2: '#38bdf8', passes: [[0, 0, 1, 1]], width: 1.3,
    fills: ['#fde047', '#f472b6', '#38bdf8', '#4ade80'],
    bg(c, W, H) {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#6d28d9'); g.addColorStop(0.55, '#c026d3'); g.addColorStop(1, '#f97316'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = -H; i < W; i += 46) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 18, 0); c.lineTo(i + 18 + H, H); c.lineTo(i + H, H); c.fill(); }
    },
  },
  ricepaper: {
    name: 'Giấy dó mực tàu', tool: 'brush', ink: '#141414', sub: '#141414', channel: '#5a5040', episode: '#b3261e', good: '#2f5d3a', accent2: '#141414', passes: [[0, 0, 1, 1]], width: 1.3, brush: true,
    bg(c, W, H) { c.fillStyle = '#f2ecdf'; c.fillRect(0, 0, W, H); fibers(c, W, H, 400, '120,100,60', 0.1, 5); },
  },
};
