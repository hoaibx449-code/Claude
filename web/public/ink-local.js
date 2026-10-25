// Ink Studio entirely on the user's device: no render machine. The Python engine runs in a Web Worker (ink-py.js);
// the website only answers AI questions and reads the text aloud. Steps, each saved on the device as soon as it is
// done (a closed tab continues from the last finished step):
//   storyboard (AI) → voice (site) → word timing → drawing plan → music + effects → mixed sound, encoded →
//   cover picture → frames drawn and encoded (ink-render.js) → MP4 uploaded.
import { renderInBrowser, idbGet, idbPut, idbClear } from '/ink-render.js?v=2';

const api = async (path, opts = {}) => {
  const res = await fetch(path, { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'x-nv': '1', ...(opts.body ? { 'content-type': 'application/json' } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || 'Lỗi ' + res.status); return j;
};

/** can this device make a whole video: video + audio encoders (and a worker for Python) */
export async function localSupport(sup) {
  if (!sup.ok) return sup;
  if (!('AudioEncoder' in window) || !('OfflineAudioContext' in window) || !('Worker' in window)) return { ok: false, why: 'Trình duyệt này chưa xuất được âm thanh cho video. Hãy dùng Chrome/Edge mới nhất hoặc để máy chủ dựng giúp.' };
  for (const [codec, rate] of [['mp4a.40.2', 44100], ['opus', 48000]]) {
    try { if ((await AudioEncoder.isConfigSupported({ codec, sampleRate: rate, numberOfChannels: 2, bitrate: 160000 })).supported) return { ...sup, audioCodec: codec, audioRate: rate }; } catch { /* next */ }
  }
  return { ok: false, why: 'Máy này chưa có bộ mã hoá âm thanh cho video. Hãy để máy chủ dựng giúp.' };
}

// a step that says nothing for 4 minutes (an AI answer takes at most ~1.5) is stuck: stop the worker and say so
function python(onLog) {
  const w = new Worker('/ink-py.js'); let n = 0, dog = 0; const wait = new Map();
  const fail = (msg) => { for (const p of wait.values()) p.no(new Error(msg)); wait.clear(); clearTimeout(dog); };
  const watch = () => { clearTimeout(dog); if (wait.size) dog = setTimeout(() => { fail('Bộ máy dựng không phản hồi quá 4 phút (bị treo). Bấm Dựng tiếp để làm lại từ bước đang dở.'); w.terminate(); }, 240_000); };
  w.onmessage = (e) => { const m = e.data; watch(); if (m.type === 'log') return onLog(m.data); const p = wait.get(m.id); if (!p) return; wait.delete(m.id); watch(); m.ok ? p.ok(m.out) : p.no(new Error(m.error)); };
  w.onerror = (e) => fail('Bộ máy dựng trong trình duyệt bị lỗi: ' + (e.message || 'không rõ'));
  return { call: (cmd, args = {}) => new Promise((ok, no) => { const id = ++n; wait.set(id, { ok, no }); watch(); w.postMessage({ id, cmd, args }); }), stop: () => { clearTimeout(dog); w.terminate(); } };
}

const b64bytes = (s) => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const speakable = (lines) => lines.map((l) => (/[.!?…]$/.test(l.trim()) ? l.trim() : l.trim().replace(/[.!?…]+$/, '') + '.')).join(' ');

export async function makeLocally({ job, sup, onProgress = () => {}, isCancelled = () => false }) {
  const K = (k) => `${job}:local:${k}`, t0 = performance.now();
  const step = (p, m) => { if (isCancelled()) throw new Error('Đã dừng.'); onProgress(p, m); };
  const { job: info } = await api(`/api/ink/jobs/${job}`);
  const input = info.input || {};
  let py = null; const P = () => (py ||= python((m) => onProgress(null, m)));
  const { version } = await api('/api/ink/browser/version').catch(() => ({ version: '' }));
  try {
    // 1. script and storyboard (AI answers come from the website)
    let sb = await idbGet(K('sb'));
    if (!sb && info.stage === 'render') sb = (await api(`/api/ink/jobs/${job}/storyboard?full=1`)).storyboard;
    if (!sb) {
      step(0.02, 'Đang khởi động bộ máy dựng trên máy bạn (lần đầu tải khoảng 15 MB)…');
      await P().call('init', { job, version });
      step(0.05, 'AI đang viết kịch bản…');
      sb = JSON.parse(await P().call('plan', { job, version, input: JSON.stringify(input) }));
      await api(`/api/ink/jobs/${job}/browser/plan`, { method: 'POST', body: { storyboard: sb } });
    }
    await idbPut(K('sb'), sb);
    const lines = sb.scenes.map((s) => s.say);

    // 2. the voice, read by the website (Microsoft or EverAI) with the time of every word
    let voice = await idbGet(K('voice'));
    if (!voice) {
      step(0.25, 'Đang đọc giọng…');
      const r = await api(`/api/ink/jobs/${job}/browser/voice`, { method: 'POST', body: { text: speakable(lines) } });
      voice = { mp3: b64bytes(r.audio), words: r.words, provider: r.provider };
      await idbPut(K('voice'), voice);
    }
    let voiceBuf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(voice.mp3.slice().buffer);
    // the video must last about the chosen time whatever the pace: off by more than 12% → read once more at an
    // adjusted speed (Microsoft only; the user's own script is read as written)
    const want = Number(input.seconds) || 0, off = want ? voiceBuf.duration / want : 1;
    if (input.mode !== 'script' && voice.provider === 'microsoft' && !voice.adjusted && (off < 0.88 || off > 1.12)) {
      const was = ({ slow: 0, normal: 8, fast: 15, faster: 25 })[input.pace] ?? 8;
      const rate = Math.round(Math.max(-15, Math.min(50, ((1 + was / 100) * off - 1) * 100)));
      if (rate !== was) {
        step(0.28, `Giọng dài ${Math.round(voiceBuf.duration)} giây, chỉnh tốc độ đọc cho gần ${want} giây…`);
        const r = await api(`/api/ink/jobs/${job}/browser/voice`, { method: 'POST', body: { text: speakable(lines), rate: (rate >= 0 ? '+' : '') + rate + '%' } }).catch(() => null);
        if (r) { voice = { mp3: b64bytes(r.audio), words: r.words, provider: r.provider, adjusted: true }; voiceBuf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(voice.mp3.slice().buffer); }
      }
      voice.adjusted = true; await idbPut(K('voice'), voice);
    }
    const total = voiceBuf.duration;

    // 3. timing, drawing plan, music and effects (Python in the worker)
    let plan = await idbGet(K('plan'));
    if (!plan) {
      step(0.32, 'Đang căn hình theo giọng và vẽ phác thảo…');
      await P().call('init', { job, version });
      const timing = await P().call('timing', { job, lines: JSON.stringify(lines), heard: JSON.stringify(voice.words || []), total });
      const d = JSON.parse(await P().call('drawing', { job, storyboard: JSON.stringify(sb), timing, pace: input.pace || 'normal', captions: input.captions !== false }));
      plan = { draw: d.draw, events: d.events, words: JSON.parse(timing).words };
      await idbPut(K('plan'), plan);
    }
    let sound = await idbGet(K('sound'));
    if (!sound) {
      step(0.4, 'Đang soạn nhạc nền và hiệu ứng…');
      await P().call('init', { job, version });
      const mood = input.mood === 'auto' || !input.mood ? (sb.music || 'motivating') : input.mood;
      let music = null;
      if (input.music) { try { music = await fetch(`/api/ink/jobs/${job}/browser/music`, { credentials: 'same-origin' }).then((r) => (r.ok ? r.arrayBuffer() : null)); } catch { music = null; } }
      const musicPcm = !music && mood !== 'none' ? await P().call('music', { seconds: total + 1, mood }) : null;
      const fx = await P().call('effects', { seconds: total, events: JSON.stringify(plan.events) });
      step(0.45, 'Đang trộn và mã hoá âm thanh…');
      const mixed = await mix({ voiceBuf, musicPcm, musicFile: music, fx, words: plan.words, total, volume: Number(input.musicVolume ?? 0.2), rate: sup.audioRate });
      sound = await encodeAudio(mixed, sup.audioCodec, sup.audioRate);
      await idbPut(K('sound'), sound);
    }
    py?.stop(); py = null;

    // 4. the cover picture (first frame of the video) for the list and for sharing
    if (!(await idbGet(K('cover')))) {
      const { coverJpeg } = await import('/ink-render.js?v=2');
      const [big, small] = await coverJpeg(plan.draw);
      await fetch(`/api/ink/jobs/${job}/browser/file/cover.jpg`, { method: 'PUT', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': 'image/jpeg' }, body: big });
      await fetch(`/api/ink/jobs/${job}/browser/file/thumb.jpg`, { method: 'PUT', credentials: 'same-origin', headers: { 'x-nv': '1', 'content-type': 'image/jpeg' }, body: small });
      await idbPut(K('cover'), true);
    }

    // 5. the frames, drawn and encoded scene by scene (resumable on its own)
    const r = await renderInBrowser({ job, sup, data: plan.draw, sound, isCancelled, onProgress: (p, m) => onProgress(0.5 + p * 0.5, m) });
    return { ...r, seconds: Math.round((performance.now() - t0) / 1000), clear: async () => { await r.clear(); await idbClear(`${job}:local:`); } };
  } finally { py?.stop(); }
}

/** voice + music dipping under it while someone speaks + effects, as render.py's ffmpeg mix does */
async function mix({ voiceBuf, musicPcm, musicFile, fx, words, total, volume, rate }) {
  const len = Math.ceil((total + 0.2) * rate), ctx = new OfflineAudioContext(2, len, rate);
  const mono = (pcm, sr = 44100) => { const b = ctx.createBuffer(1, pcm.length, sr); b.copyToChannel(pcm, 0); return b; };
  const play = (buf, gain, loop = false) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; const g = ctx.createGain(); s.connect(g).connect(ctx.destination); s.start(0); g.gain.value = gain; return g.gain; };
  play(voiceBuf, 1);
  let mbuf = null;
  if (musicFile) { try { mbuf = await ctx.decodeAudioData(musicFile); } catch { mbuf = null; } }
  if (!mbuf && musicPcm) mbuf = mono(musicPcm);
  if (mbuf && volume > 0) {
    const g = play(mbuf, 0, !!musicFile), low = volume * 0.35;
    g.setValueAtTime(0, 0); g.linearRampToValueAtTime(volume, 1);
    // dip while words are spoken (runs of words closer than 0.4 s), back up 0.35 s after
    let runs = []; for (const w of words || []) { const [, , s, e] = w; if (runs.length && s - runs[runs.length - 1][1] < 0.4) runs[runs.length - 1][1] = e; else runs.push([s, e]); }
    for (const [s, e] of runs) { if (s < 1) continue; g.setTargetAtTime(low, s - 0.02, 0.03); g.setTargetAtTime(volume, e + 0.05, 0.12); }
    g.setTargetAtTime(0, Math.max(0, total - 2), 0.5);
  }
  if (fx) play(mono(fx), 0.55);
  const out = await ctx.startRendering();
  // loudness close to the machines' loudnorm (-15 LUFS): scale by RMS, never clip
  let sum = 0, peak = 0, n = 0;
  for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i += 4) { sum += d[i] * d[i]; n++; peak = Math.max(peak, Math.abs(d[i])); } }
  const k = Math.min(0.178 / Math.sqrt(sum / Math.max(1, n) || 1e-9), 0.89 / Math.max(peak, 1e-6));
  for (let c = 0; c < out.numberOfChannels; c++) { const d = out.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
  return out;
}

/** the mixed sound through the device's audio encoder, in pieces the MP4 takes as they are */
async function encodeAudio(buf, codec, rate) {
  const chunks = []; let decoderConfig = null, err = null;
  const enc = new AudioEncoder({ output: (c, meta) => { if (meta?.decoderConfig && !decoderConfig) decoderConfig = { ...meta.decoderConfig, description: meta.decoderConfig.description ? new Uint8Array(meta.decoderConfig.description).slice() : undefined }; const d = new Uint8Array(c.byteLength); c.copyTo(d); chunks.push({ d, t: c.timestamp, u: c.duration || 0 }); }, error: (e) => { err = e; } });
  enc.configure({ codec, sampleRate: rate, numberOfChannels: 2, bitrate: 160000 });
  const step = 4096, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  for (let i = 0; i < buf.length; i += step) {
    const n = Math.min(step, buf.length - i), planar = new Float32Array(n * 2);
    planar.set(L.subarray(i, i + n), 0); planar.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / rate), data: planar });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    if (err) throw err;
  }
  await enc.flush(); enc.close(); if (err) throw err;
  const frame = codec === 'opus' ? 960 : 1024;
  for (const c of chunks) if (!c.u) c.u = Math.round(frame * 1e6 / rate);
  if (!decoderConfig) decoderConfig = { codec, sampleRate: rate, numberOfChannels: 2 };
  return { codec: codec === 'opus' ? 'opus' : 'aac', rate, channels: 2, chunks, decoderConfig };
}
