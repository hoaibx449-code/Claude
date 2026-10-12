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
  ricepaper: {
    name: 'Giấy dó mực tàu', tool: 'brush', ink: '#141414', sub: '#141414', channel: '#5a5040', episode: '#b3261e', good: '#2f5d3a', accent2: '#141414', passes: [[0, 0, 1, 1]], width: 1.3, brush: true,
    bg(c, W, H) { c.fillStyle = '#f2ecdf'; c.fillRect(0, 0, W, H); fibers(c, W, H, 400, '120,100,60', 0.1, 5); },
  },
};
