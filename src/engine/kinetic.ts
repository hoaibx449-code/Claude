// Kinetic typography: the narration itself is the picture. Each phrase is set big in the
// middle of the frame, its words pop in exactly when they are spoken, key words (numbers,
// the words the script put on the board, the longest word) are larger, coloured and marked.
import type { Ctx, SceneSpec, SceneTiming } from './types.ts';
import type { Box, Colors } from './diagram.ts';

interface Word { text: string; x: number; y: number; size: number; at: number; key: boolean; w: number }
interface Phrase { start: number; end: number; words: Word[]; rows: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9%]/g, '');

/** Split a line into phrases of at most `max` words, cutting at punctuation first. */
export function phrases(line: string, max = 7): string[][] {
  const words = line.split(/\s+/).filter(Boolean), out: string[][] = [];
  let cur: string[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const left = words.length - i - 1;
    if ((/[,;:.!?…]$/.test(w) && cur.length >= 2 && left >= 2) || (cur.length >= max && left >= 2)) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** `deco`: line art of the scene's main icon (24×24 units), drawn huge and faint behind the words. */
export function buildKinetic(c: Ctx, sc: SceneSpec, T: SceneTiming, box: Box, col: Colors, keys: string[], deco?: [number, number][][]) {
  const F = col.font || 'Pangolin', portrait = box.h > box.w;
  const keySet = new Set(keys.flatMap((k) => k.split(/\s+/)).map(fold).filter((k) => k.length > 1));
  const out: Phrase[] = [];
  sc.lines.forEach((line, li) => {
    const span = T.lines[li]; if (!span) return;
    const words = line.split(/\s+/).filter(Boolean);
    // when each word is said: syllable weights with pauses after punctuation (as cueFraction)
    const weight = words.map((w) => 1 + (/[,;:]$/.test(w) ? 1.5 : /[.!?…]$/.test(w) ? 2.5 : 0));
    const total = weight.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const times = weight.map((w) => { const t = span.start + (acc / total) * (span.end - span.start); acc += w; return t; });
    let k = 0;
    for (const ph of phrases(line, portrait ? 6 : 8)) {
      const idx = ph.map(() => k++);
      // key words: numbers, words written on the board, else the longest one
      let key = ph.map((w) => /\d/.test(w) || keySet.has(fold(w)));
      if (!key.some(Boolean)) { let best = -1, bl = 3; ph.forEach((w, i) => { if (fold(w).length > bl) { bl = fold(w).length; best = i; } }); if (best >= 0) key = key.map((_, i) => i === best); }
      // layout: shrink until the phrase fits in at most 4 rows
      let size = portrait ? 66 : 60, rows: { i: number; w: number }[][] = [];
      for (; size >= 30; size -= 4) {
        rows = []; let row: { i: number; w: number }[] = [], rw = 0;
        const space = (c.font = `${size}px ${F}`, c.measureText(' ').width);
        ph.forEach((w, i) => {
          c.font = `${key[i] ? size * 1.22 : size}px ${F}`;
          const ww = c.measureText(w).width;
          if (row.length && rw + space + ww > box.w) { rows.push(row); row = []; rw = 0; }
          rw += (row.length ? space : 0) + ww; row.push({ i, w: ww });
        });
        if (row.length) rows.push(row);
        if (rows.length <= 4 && rows.every((r) => r.every((x) => x.w <= box.w))) break;
      }
      c.font = `${size}px ${F}`;
      const space = c.measureText(' ').width, lh = size * 1.45;
      const y0 = box.y + box.h / 2 - ((rows.length - 1) * lh) / 2 + size * 0.35;
      const placed: Word[] = [];
      rows.forEach((row, r) => {
        const rw = row.reduce((a, x) => a + x.w, 0) + space * (row.length - 1);
        let x = box.x + (box.w - rw) / 2;
        for (const { i, w } of row) {
          placed.push({ text: ph[i], x, y: y0 + r * lh, size: key[i] ? size * 1.22 : size, at: times[idx[i]] - 0.06, key: key[i], w });
          x += w + space;
        }
      });
      out.push({ start: placed[0].at, end: span.end, words: placed, rows: rows.length });
    }
  });
  // a phrase stays until the next one starts (the last one until the scene ends)
  out.forEach((p, i) => { p.end = i + 1 < out.length ? out[i + 1].start : T.end; });
  const sceneStart = T.start;

  return {
    start: sceneStart, end: T.lines[T.lines.length - 1]?.end ?? T.end,
    draw(c: Ctx, _p: number, alpha: number, t: number) {
      if (alpha <= 0) return;
      if (deco?.length) {
        const size = Math.min(box.w, box.h) * 0.8, k = size / 24, cx = box.x + box.w / 2, cy = box.y + box.h / 2 + Math.sin(t * 0.8) * 8;
        c.save(); c.globalAlpha = alpha * 0.1; c.translate(cx, cy); c.rotate(Math.sin(t * 0.4) * 0.06); c.translate(-12 * k, -12 * k);
        c.strokeStyle = col.ink; c.lineWidth = 1.4 * k; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const l of deco) { c.beginPath(); l.forEach(([x, y], i) => (i ? c.lineTo(x * k, y * k) : c.moveTo(x * k, y * k))); c.stroke(); }
        c.restore();
      }
      let cur = out.findIndex((p) => t < p.end);
      if (cur < 0) cur = out.length - 1;
      if (t < (out[0]?.start ?? 0) - 0.05) return;
      for (const pi of [cur - 1, cur]) {
        const P = out[pi]; if (!P) continue;
        // the previous phrase flies up and fades as the new one comes in
        const leave = pi < cur ? Math.min(1, (t - out[cur].start) / 0.3) : 0;
        if (leave >= 1) continue;
        c.save(); c.globalAlpha = alpha * (1 - leave); c.translate(0, -60 * leave * leave);
        for (const w of P.words) {
          const q = Math.max(0, Math.min(1, (t - w.at) / 0.28));
          if (q <= 0) continue;
          const back = 1 + 2.2 * (q - 1) ** 3 + 1.2 * (q - 1) ** 2; // ease-out with a small overshoot
          const s = 0.55 + 0.45 * back, cx = w.x + w.w / 2, cy = w.y - w.size * 0.35;
          c.save(); c.translate(cx, cy); c.scale(s, s);
          if (w.key) c.rotate(Math.sin(t * 2 + w.x) * 0.025);
          c.translate(-cx, -cy); c.globalAlpha *= Math.min(1, q * 1.6);
          if (w.key) {
            // marker band behind the key word, swept from left to right
            const band = Math.min(1, Math.max(0, (t - w.at - 0.12) / 0.3));
            c.fillStyle = col.accent2; c.globalAlpha *= 0.32;
            c.fillRect(w.x - 8, w.y - w.size * 0.82, (w.w + 16) * band, w.size * 1.04);
            c.globalAlpha /= 0.32;
          }
          c.font = `${w.size}px ${F}`; c.textAlign = 'left';
          c.fillStyle = 'rgba(0,0,0,.22)'; c.fillText(w.text, w.x + 3, w.y + 4);
          c.fillStyle = w.key ? col.accent : col.ink; c.fillText(w.text, w.x, w.y);
          c.restore();
        }
        c.restore();
      }
    },
    pen: () => [0, 0] as [number, number],
  };
}
