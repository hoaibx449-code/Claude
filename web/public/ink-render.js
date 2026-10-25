// Ink Studio "Trình duyệt" machine: draws the frames of a video on the user's own device and writes the MP4.
// A render machine already wrote the script, voice and drawing plan (ink/ink/export.py → draw.json, audio.aac);
// this file draws them with the same rules as ink/ink/render.py: strokes appear along their length, the hand
// follows the pen, the camera pushes in, scenes slide, captions mark the word being said.
// Made for phones too: frames go to the device's own video encoder one at a time (never more than a few
// waiting), each finished scene is kept on the device (IndexedDB), so a locked screen, a lost connection or a
// closed tab continues from the scene it stopped at; the screen is kept awake while drawing.
import { Muxer, ArrayBufferTarget } from '/vendor/mp4-muxer-5.2.2.mjs';

const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DB = 'ink-render', STORE = 'scenes';

/** What this device can do: an H.264 encoder (MP4 that plays everywhere) and how big to draw. */
export async function browserSupport() {
  if (!('VideoEncoder' in window) || !('VideoFrame' in window)) return { ok: false, why: 'Trình duyệt này chưa hỗ trợ xuất video (cần Chrome, Edge hoặc Safari 17 trở lên).' };
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory || 8) <= 4;
  try { const t = localStorage.getItem('ink-test-codec'); if (t) return { ok: true, codec: t, width: 720, height: 1280, phone }; } catch { /* no storage */ } // automated tests only
  const sizes = phone ? [[720, 1280]] : [[1080, 1920], [720, 1280]];
  for (const [w, h] of sizes) for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']) {
    const cfg = { codec, width: w, height: h, bitrate: 4e6, framerate: 30, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { ok: true, codec, width: w, height: h, phone }; } catch { /* next */ }
  }
  return { ok: false, why: 'Máy này chưa có bộ mã hoá H.264 cho trình duyệt. Hãy để máy chủ dựng giúp.' };
}

/** scenes already drawn on this device for a job (to offer "continue") */
export async function savedScenes(job, width) { try { return (await idbGet(`${job}:${width}:meta`))?.done || 0; } catch { return 0; } }

// ---------------------------------------------------------------- storage of finished scenes (resume)
const idb = () => new Promise((ok, no) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function idbDo(mode, fn) { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE)); tx.oncomplete = () => { db.close(); ok(req?.result); }; tx.onerror = () => { db.close(); no(tx.error); }; }); }
export const idbGet = (k) => idbDo('readonly', (s) => s.get(k)).catch(() => undefined);
export const idbPut = (k, v) => idbDo('readwrite', (s) => s.put(v, k));
export const idbClear = (prefix) => idbDo('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix, prefix + '￿')));

// ---------------------------------------------------------------- geometry (same as engine.prep / render.plan)
function prep(op) {
  if (op.k === 'text') { const [x0, y0, x1, y1] = op.bb; op.a = [x0, (y0 + y1) / 2]; op.b = [x1, (y0 + y1) / 2]; op.L = (x1 - x0) * 0.45; return; }
  const p = op.p, n = p.length / 2, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
  op.cum = cum; op.L = n ? cum[n - 1] : 0; op.a = [p[0], p[1]]; op.b = [p[2 * n - 2], p[2 * n - 1]];
}
function plan(ops, P, W) {
  const items = []; let s = 0, cur = null, side = null, first = null;
  for (const op of ops) {
    prep(op);
    if (side === null) { side = op.a[0] < 0.42 * W ? -1 : 1; first = side; }
    else {
      let ns = side;
      if (side === 1 && op.a[0] < 0.26 * W) ns = -1; else if (side === -1 && op.a[0] > 0.74 * W) ns = 1;
      if (ns !== side) { items.push({ t: 'swap', s0: s, s1: s + P.SWAPC, a: cur, b: op.a, sf: side, st: ns }); s += P.SWAPC; side = ns; }
      else { const d = Math.hypot(op.a[0] - cur[0], op.a[1] - cur[1]), tr = d * 0.10; if (tr > 0) { items.push({ t: 'travel', s0: s, s1: s + tr, a: cur, b: op.a, side, d }); s += tr; } }
    }
    items.push({ t: 'draw', s0: s, s1: s + op.L, op, side }); s += op.L; cur = op.b;
  }
  return { items, S: Math.max(s, 1e-6), last: cur, side0: first, sideL: side };
}

/** draw the video; `data` (drawing plan) and `sound` ({codec, rate, channels, chunks:[{d,t,u}], decoderConfig}) come from
    the page itself (made in the browser) or, when left out, from the render machine's draw.json and audio.aac */
export async function renderInBrowser({ job, sup, data = null, sound = null, onProgress = () => {}, isCancelled = () => false }) {
  const t0 = performance.now();
  const D = data || await (await fetch(`/api/ink/jobs/${job}/file/draw.json`, { credentials: 'same-origin' })).json();
  if (!sound) {
    const aac = parseAdts(new Uint8Array(await (await fetch(`/api/ink/jobs/${job}/file/audio.aac`, { credentials: 'same-origin' })).arrayBuffer()));
    const u = Math.round(1024 * 1e6 / aac.rate);
    sound = { codec: 'aac', rate: aac.rate, channels: aac.channels, decoderConfig: { codec: 'mp4a.40.2', sampleRate: aac.rate, numberOfChannels: aac.channels, description: aac.asc },
      chunks: aac.frames.map((d, n) => ({ d, t: n * u, u })) };
  }
  const { W, H, fps: FPS, params: P } = D, k = sup.width / W, OW = sup.width, OH = sup.height;
  const nFrames = Math.round(D.total * FPS);
  // assets: the hand (baked from render.py's own drawing) and the marker font of the captions
  const hand = await (await fetch('/ink/hand.json')).json();
  const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Không tải được hình ' + src.slice(0, 40))); i.src = src; });
  const sprites = { 1: await img('/ink/hand-r.png'), '-1': await img('/ink/hand-l.png') };
  try { const f = new FontFace('Pangolin', 'url(/assets/fonts/Pangolin-Regular.ttf)'); await f.load(); document.fonts.add(f); } catch { /* falls back to the system font */ }

  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // board: what is drawn so far · work: board + the stroke in progress + hand · cam: work through the camera
  // (render.scene_frames' frame) · out: what is encoded (slide, captions, progress) · prev: last cam of the scene before
  const board = canvas(OW, OH), work = canvas(OW, OH), camC = canvas(OW, OH), out = canvas(OW, OH), prev = canvas(OW, OH);
  const bx = board.getContext('2d'), wx = work.getContext('2d'), cx = camC.getContext('2d'), ox = out.getContext('2d'), px = prev.getContext('2d');
  for (const c of [bx, wx, cx, ox, px]) { c.lineCap = 'round'; c.lineJoin = 'round'; c.imageSmoothingQuality = 'high'; }
  const scaled = (c) => c.setTransform(k, 0, 0, k, 0, 0);

  // ---- drawing primitives (engine.render_full / render_partial)
  const pathTo = (c, p, n, tail) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 1; i < n; i++) c.lineTo(p[2 * i], p[2 * i + 1]); if (tail) c.lineTo(tail[0], tail[1]); };
  const strokeStyle = (c, op) => { c.strokeStyle = op.c; c.lineWidth = Math.max(1, Math.floor(op.w)); };
  function full(c, op) {
    if (op.k === 'text') { c.drawImage(op.im, op.bb[0], op.bb[1]); return; }
    const n = op.p.length / 2;
    if (op.k === 'shape' && op.f) { pathTo(c, op.p, n); c.closePath(); c.fillStyle = op.f; c.fill(); }
    strokeStyle(c, op); pathTo(c, op.p, n); if (n === 1) c.lineTo(op.p[0] + 0.01, op.p[1]); c.stroke();
  }
  function partial(c, op, frac) {
    if (op.k === 'text') {
      const x = op.a[0] + (op.b[0] - op.a[0]) * frac, w = Math.floor(Math.min(x, op.bb[2]) - op.bb[0]);
      if (w > 0) c.drawImage(op.im, 0, 0, w, op.im.height, op.bb[0], op.bb[1], w, op.im.height);
      return [x, op.a[1]];
    }
    const tgt = op.L * frac, cum = op.cum, p = op.p, n = cum.length;
    let i = 0; while (i < n - 2 && cum[i + 1] <= tgt) i++;
    const seg = cum[i + 1] - cum[i], t = seg > 0 ? (tgt - cum[i]) / seg : 1;
    const q = [p[2 * i] + (p[2 * i + 2] - p[2 * i]) * t, p[2 * i + 1] + (p[2 * i + 3] - p[2 * i + 1]) * t];
    strokeStyle(c, op); pathTo(c, p, i + 1, q); c.stroke();
    return q;
  }
  // ---- the hand (engine.draw_hand2 baked into sprites, rotated about the pen tip)
  const phiFor = (p, side) => { const x = clamp(p[0], 0, W), y = clamp(p[1], 0, H), ds = side === 1 ? W - x : x, db = H - y; return (50 + 28 * ds / (ds + db + 1e-6)) * Math.PI / 180; };
  const armVec = (phi, side) => [side * Math.cos(phi), Math.sin(phi)];
  const exitDist = (p, v) => { const ts = []; if (v[0] > 1e-6) ts.push((W - p[0]) / v[0]); else if (v[0] < -1e-6) ts.push(-p[0] / v[0]); if (v[1] > 1e-6) ts.push((H - p[1]) / v[1]); return Math.max(0, Math.min(...ts)) + 540; };
  const slideOut = (Pt, side, f) => { const phi = phiFor(Pt, side), v = armVec(phi, side), d = exitDist(Pt, v) * f; return [[Pt[0] + v[0] * d, Pt[1] + v[1] * d], phi]; };
  function drawHand(c, tip, phi, side) {
    const sp = sprites[side], m = hand[side === 1 ? 'r' : 'l'];
    c.save(); c.translate(tip[0], tip[1]); c.rotate(side * (phi - hand.phi0)); c.drawImage(sp, -m.tipX, -m.tipY); c.restore();
  }
  // ---- camera, slide, captions, progress (render.cam_matrix / slide / draw_caption / progress)
  function camera(cam, dur, t) {
    cam = cam || {}; const typ = cam.type || 'push', e = ease(Math.min(1, t / Math.max(dur, 0.1))), amt = cam.amount ?? 0.07;
    let z = typ === 'push' ? 1 + amt * e : typ === 'pull' ? 1 + amt * (1 - e) : 1;
    if (cam.punch) z *= 1 + 0.07 * Math.max(0, 1 - t / 0.25);
    const cw = W / z, ch = H / z, x0 = clamp(W / 2 - cw / 2, 0, W - cw), y0 = clamp(H * 0.47 - ch / 2, 0, H - ch);
    return [z, x0, y0];
  }
  const capFont = '64px Pangolin, "Be Vietnam Pro", sans-serif', SW = Math.max(1, Math.floor(64 * 0.045));
  const rrect = (c, x0, y0, x1, y1, r) => { c.beginPath(); c.roundRect ? c.roundRect(x0, y0, x1 - x0, y1 - y0, r) : c.rect(x0, y0, x1 - x0, y1 - y0); };
  const lines = {}; for (const w of D.words) (lines[w[0]] ||= []).push(w);
  function caption(c, t) {
    let line = -1;
    for (const w of D.words) { if (w[2] <= t + 0.05) line = w[0]; else break; }
    if (line < 0) return;
    const ws = lines[line], kk = clamp(ws.filter((w) => w[2] <= t + 0.05).length - 1, 0, ws.length - 1);
    const cut = (D.captions[line] || [[0, ws.length]]).find(([a, b]) => a <= kk && kk < b); if (!cut) return;
    const g = ws.slice(cut[0], cut[1]), Y = P.CAP_Y;
    c.font = capFont; c.textBaseline = 'middle';
    const tw = (s) => c.measureText(s).width + 2 * SW, sp = tw(' '), widths = g.map((w) => tw(w[1]));
    const tot = widths.reduce((a, b) => a + b, 0) + sp * (g.length - 1); let x = (W - tot) / 2;
    rrect(c, x - 34, Y - 58, x + tot + 34, Y + 56, 30); c.fillStyle = 'rgba(255,252,245,0.92)'; c.fill(); c.lineWidth = 5; c.strokeStyle = D.ink; c.stroke();
    g.forEach((w, i) => {
      if (cut[0] + i === kk) { rrect(c, x - 8, Y - 44, x + widths[i] + 8, Y + 42, 14); c.fillStyle = D.acc; c.fill(); }
      c.lineWidth = SW * 2; c.strokeStyle = D.ink; c.strokeText(w[1], x + SW, Y); c.fillStyle = D.ink; c.fillText(w[1], x + SW, Y);
      x += widths[i] + sp;
    });
  }
  function progress(c, gt) { c.fillStyle = '#e1dac8'; c.fillRect(0, H - 12, W, 12); c.fillStyle = D.acc; c.fillRect(0, H - 12, W * gt / D.total, 12); }

  // ---- text pictures of a scene are decoded only for that scene (phones keep little in memory)
  async function loadScene(ops) { await Promise.all(ops.filter((o) => o.k === 'text' && !o.im).map(async (o) => { o.im = await img(o.img); })); }
  const unload = (ops) => { for (const o of ops) if (o.im) o.im = null; };

  // the cover title is on the board from the very first frame
  const coverBoard = canvas(OW, OH), cb = coverBoard.getContext('2d');
  cb.fillStyle = D.bg; cb.fillRect(0, 0, OW, OH); scaled(cb); cb.lineCap = 'round'; cb.lineJoin = 'round';
  await loadScene(D.cover); for (const op of D.cover) { prep(op); full(cb, op); } unload(D.cover);

  /** every frame of scene i, handed to `emit(frameIndex, canvas)`; with `onlyLast` only its last frame (resume) */
  async function scene(i, emit, onlyLast = false) {
    const sc = D.scenes[i], start = i ? Math.round(D.scenes[i - 1].end * FPS) : 0, nf = Math.round(sc.end * FPS) - start, dur = nf / FPS;
    await loadScene(sc.ops);
    const { items, S, last, side0, sideL } = plan(sc.ops, P, W);
    const Tin = sc.t_in, Td = items.length ? Math.min(Math.max(0.6, S / P.DRAW_SPEED), Math.max(0.6, Math.min(sc.td_max, dur * 0.7))) : 0;
    bx.setTransform(1, 0, 0, 1, 0, 0);
    if (i === 0) bx.drawImage(coverBoard, 0, 0); else { bx.fillStyle = D.bg; bx.fillRect(0, 0, OW, OH); }
    scaled(bx);
    const first = items.length ? items[0].op.a : [W / 2, H / 2], ntr = Math.max(2, Math.floor(P.TR * FPS)), slide = i > 0 && sc.kind !== 'cut';
    let idx = 0;
    for (let f = onlyLast ? nf - 1 : 0; f < nf; f++) {
      const t = f / FPS, sd = clamp((t - Tin) / (Td || 1), 0, 1) * S;
      while (idx < items.length && items[idx].s1 <= sd) { if (items[idx].t === 'draw') full(bx, items[idx].op); idx++; }
      if (onlyLast) while (idx < items.length) { if (items[idx].t === 'draw') full(bx, items[idx].op); idx++; }
      wx.setTransform(1, 0, 0, 1, 0, 0); wx.drawImage(board, 0, 0); scaled(wx);
      let hd = null;
      if (!items.length || onlyLast) { /* nothing to draw */ }
      else if (t < Tin) { const [tip, phi] = slideOut(first, side0, 1 - ease(t / Tin)); hd = [tip, phi, side0]; }
      else if (idx < items.length) {
        const it = items[idx], u = (sd - it.s0) / Math.max(1e-6, it.s1 - it.s0);
        if (it.t === 'travel') { const lift = Math.sin(Math.PI * u) * Math.min(60, it.d * 0.15), tip = [it.a[0] + (it.b[0] - it.a[0]) * u, it.a[1] + (it.b[1] - it.a[1]) * u - lift]; hd = [tip, phiFor(tip, it.side), it.side]; }
        else if (it.t === 'swap') { if (u < 0.5) { const [tip, phi] = slideOut(it.a, it.sf, ease(u * 2)); hd = [tip, phi, it.sf]; } else { const [tip, phi] = slideOut(it.b, it.st, 1 - ease((u - 0.5) * 2)); hd = [tip, phi, it.st]; } }
        else { const tip = u > 0 ? partial(wx, it.op, clamp(u, 0, 1)) : it.op.a; hd = [tip, phiFor(tip, it.side), it.side]; }
      } else { const u = (t - (Tin + Td)) / P.T_OUT; if (u < 1) { const [tip, phi] = slideOut(last, sideL, ease(Math.max(u, 0))); hd = [tip, phi, sideL]; } }
      if (hd) drawHand(wx, ...hd);
      // camera onto the frame, the previous scene sliding away, then captions and progress on top
      const [z, x0, y0] = camera(sc.cam, dur, t);
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = D.bg; cx.fillRect(0, 0, OW, OH);
      cx.setTransform(z, 0, 0, z, -x0 * k * z, -y0 * k * z); cx.drawImage(work, 0, 0);
      if (onlyLast) break;
      ox.setTransform(1, 0, 0, 1, 0, 0);
      if (slide && f < ntr) {
        const off = Math.floor(OW * ease((f + 1) / ntr));
        if (OW - off > 0) ox.drawImage(prev, off, 0, OW - off, OH, 0, 0, OW - off, OH);
        if (off > 0) ox.drawImage(camC, 0, 0, off, OH, OW - off, 0, off, OH);
      } else ox.drawImage(camC, 0, 0);
      const gt = (start + f) / FPS;
      scaled(ox); if (D.words.length) caption(ox, gt); progress(ox, gt);
      await emit(start + f, out, f === 0);
    }
    px.setTransform(1, 0, 0, 1, 0, 0); px.drawImage(camC, 0, 0); // this scene's last picture, for the next slide
    unload(sc.ops);
  }

  // ---- encoding, scene by scene; finished scenes are saved so the work survives a closed tab
  const kid = `${job}:${OW}:`;
  const savedMeta = await idbGet(kid + 'meta');
  let decoderConfig = savedMeta?.decoderConfig || null, startScene = savedMeta?.done || 0;
  if (startScene >= D.scenes.length) startScene = D.scenes.length;
  if (startScene > 0) await scene(startScene - 1, async () => {}, true); // continue after a break: the picture to slide from
  const bitrate = Math.min(sup.width >= 1080 ? 6e6 : 3.5e6, Math.floor(85e6 * 8 / Math.max(10, D.total))); // stays under the 100 MB upload limit
  let chunks = [], encErr = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => { if (meta?.decoderConfig && !decoderConfig) decoderConfig = { ...meta.decoderConfig, description: meta.decoderConfig.description ? new Uint8Array(meta.decoderConfig.description).slice() : undefined }; const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push({ d: b, t: chunk.timestamp, u: chunk.duration || Math.round(1e6 / FPS), k: chunk.type === 'key' }); },
    error: (e) => { encErr = e; },
  });
  const avc = sup.codec.startsWith('avc');
  enc.configure({ codec: sup.codec, width: OW, height: OH, bitrate, framerate: FPS, latencyMode: 'quality', ...(avc ? { avc: { format: 'avc' } } : {}) });
  let wake = null; const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* not allowed: fine */ } };
  await keepAwake(); const onVis = () => { if (document.visibilityState === 'visible' && !wake) keepAwake(); }; document.addEventListener('visibilitychange', onVis);
  try {
    let lastYield = performance.now();
    for (let i = startScene; i < D.scenes.length; i++) {
      chunks = [];
      await scene(i, async (fi, cv, sceneStart) => {
        if (isCancelled()) throw new Error('Đã dừng.');
        if (encErr) throw encErr;
        const vf = new VideoFrame(cv, { timestamp: Math.round(fi * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
        enc.encode(vf, { keyFrame: sceneStart || fi % (FPS * 2) === 0 }); vf.close();
        while (enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 4)); // never let frames pile up (phones)
        if (performance.now() - lastYield > 40) { await new Promise((r) => setTimeout(r, 0)); lastYield = performance.now(); }
        onProgress(fi / nFrames, `Đang vẽ cảnh ${i + 1}/${D.scenes.length}`);
      });
      await enc.flush(); if (encErr) throw encErr;
      await idbPut(kid + 's' + i, chunks); await idbPut(kid + 'meta', { done: i + 1, decoderConfig, at: Date.now() });
    }
    enc.close();
  } finally { document.removeEventListener('visibilitychange', onVis); try { await wake?.release(); } catch { /* gone */ } }

  // ---- the MP4: saved scenes in order, then the sound frames as they are (ADTS AAC from the render machine)
  onProgress(0.99, 'Đang ghép video và âm thanh');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: avc ? 'avc' : 'vp9', width: OW, height: OH, frameRate: FPS }, audio: { codec: sound.codec, numberOfChannels: sound.channels, sampleRate: sound.rate } });
  let firstChunk = true;
  for (let i = 0; i < D.scenes.length; i++) {
    const list = await idbGet(kid + 's' + i);
    if (!list) throw new Error('Thiếu dữ liệu cảnh ' + (i + 1) + '. Bấm Dựng lại.');
    for (const c of list) { muxer.addVideoChunkRaw(c.d, c.k ? 'key' : 'delta', c.t, c.u, firstChunk ? { decoderConfig } : undefined); firstChunk = false; }
  }
  sound.chunks.forEach((c, n) => muxer.addAudioChunkRaw(c.d, 'key', c.t, c.u, n ? undefined : { decoderConfig: sound.decoderConfig }));
  muxer.finalize();
  const mp4 = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  return { mp4, seconds: Math.round((performance.now() - t0) / 1000), clear: () => idbClear(kid) };
}

/** the cover: the first frame of the video once the hand has finished it (title + drawing), as JPEGs 1080 and 360 wide */
export async function coverJpeg(D) {
  const c = document.createElement('canvas'); c.width = D.W; c.height = D.H;
  const x = c.getContext('2d'); x.fillStyle = D.bg; x.fillRect(0, 0, D.W, D.H); x.lineCap = 'round'; x.lineJoin = 'round';
  const ops = [...D.cover, ...(D.scenes[0]?.ops || [])];
  for (const op of ops) {
    if (op.k === 'text') { const im = new Image(); im.src = op.img; await im.decode(); x.drawImage(im, op.bb[0], op.bb[1]); continue; }
    const p = op.p, n = p.length / 2;
    x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 1; i < n; i++) x.lineTo(p[2 * i], p[2 * i + 1]);
    if (op.k === 'shape' && op.f) { x.closePath(); x.fillStyle = op.f; x.fill(); x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 1; i < n; i++) x.lineTo(p[2 * i], p[2 * i + 1]); }
    if (n === 1) x.lineTo(p[0] + 0.01, p[1]);
    x.strokeStyle = op.c; x.lineWidth = Math.max(1, Math.floor(op.w)); x.stroke();
  }
  const small = document.createElement('canvas'); small.width = 360; small.height = Math.round(360 * D.H / D.W);
  small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
  const jpg = (cv, q) => new Promise((ok) => cv.toBlob(ok, 'image/jpeg', q));
  return [await jpg(c, 0.9), await jpg(small, 0.8)];
}

/** raw AAC frames out of an ADTS stream, and the AudioSpecificConfig the MP4 needs */
function parseAdts(b) {
  const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const frames = []; let i = 0, rate = 44100, channels = 2, asc = null;
  while (i + 7 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xf0) !== 0xf0) { i++; continue; }
    const noCrc = b[i + 1] & 1, profile = (b[i + 2] >> 6) & 3, sfi = (b[i + 2] >> 2) & 15, ch = ((b[i + 2] & 1) << 2) | (b[i + 3] >> 6);
    const len = ((b[i + 3] & 3) << 11) | (b[i + 4] << 3) | (b[i + 5] >> 5), hl = noCrc ? 7 : 9;
    if (len < hl || i + len > b.length) break;
    if (!asc) { rate = RATES[sfi]; channels = ch; asc = new Uint8Array([((profile + 1) << 3) | (sfi >> 1), ((sfi & 1) << 7) | (ch << 3)]); }
    frames.push(b.subarray(i + hl, i + len)); i += len;
  }
  if (!frames.length) throw new Error('Âm thanh của video không đọc được.');
  return { frames, rate, channels, asc };
}
