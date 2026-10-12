import type { Ctx, StyleKey, ToolKind } from './types.ts';

export interface Style {
  name: string;
  tool: ToolKind;
  ink: string; // colour the line art is drawn in
  sub: string; // subtitles
  channel: string;
  episode: string;
  good: string; // tick marks in diagrams
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
    name: 'Giấy kem kể chuyện', tool: 'marker', ink: '#2a2a2a', sub: '#3a2f8c', channel: '#5d5873', episode: '#c0392b', good: '#1f7a4c',
    bg(c, W, H) { c.fillStyle = '#f3eee2'; c.fillRect(0, 0, W, H); },
  },
  whiteboard: {
    name: 'Bảng trắng', tool: 'marker', ink: '#1d1d1f', sub: '#1d1d1f', channel: '#555', episode: '#d62828', good: '#1f7a4c',
    bg(c, W, H) { c.fillStyle = '#fbfbf8'; c.fillRect(0, 0, W, H); },
  },
  chalkboard: {
    name: 'Bảng phấn', tool: 'chalk', ink: '#f1f1e8', sub: '#f7d154', channel: '#cfd8cf', episode: '#f7d154', good: '#9be7a6',
    bg(c, W, H) {
      c.fillStyle = '#24402f'; c.fillRect(0, 0, W, H);
      const r = rng(7);
      for (let i = 0; i < (W * H) / 90; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(r() * W, r() * H, 2, 2); }
    },
  },
  kraft: {
    name: 'Giấy kraft', tool: 'colormarker', ink: '#2b1d10', sub: '#2b1d10', channel: '#4a3520', episode: '#b8321f', good: '#2f6b3a',
    bg(c, W, H) { c.fillStyle = '#c9a77c'; c.fillRect(0, 0, W, H); fibers(c, W, H, 600, '90,60,30', 0.12, 3); },
  },
  oly: {
    name: 'Vở ô ly', tool: 'fountain', ink: '#3a2aa8', sub: '#3a2aa8', channel: '#6b64a8', episode: '#d62828', good: '#1b7f4e',
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
  blueprint: {
    name: 'Bản vẽ kỹ thuật', tool: 'technical', ink: '#eaf3ff', sub: '#ffe28a', channel: '#bcd3f0', episode: '#ffe28a', good: '#a6f0b6',
    bg(c, W, H) {
      c.fillStyle = '#1d4e8f'; c.fillRect(0, 0, W, H);
      grid(c, W, H, W / 27, (i) => (i % 5 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.18)'));
    },
  },
  ricepaper: {
    name: 'Giấy dó mực tàu', tool: 'brush', ink: '#141414', sub: '#141414', channel: '#5a5040', episode: '#b3261e', good: '#2f5d3a',
    bg(c, W, H) { c.fillStyle = '#f2ecdf'; c.fillRect(0, 0, W, H); fibers(c, W, H, 400, '120,100,60', 0.1, 5); },
  },
};
