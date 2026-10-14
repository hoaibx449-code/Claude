// Render machine: pulls queued jobs from the web app, renders them and uploads the MP4 + SRT.
// Runs anywhere with Node + FFmpeg (your computer, Cloud Run, a VPS).
//   NV_API_URL=https://your-site RUNNER_TOKEN=... node src/cli/runner.ts [--once | --drain]
// Voice/image keys (EVERAI_API_KEY, ...) are read from the environment as for the CLI.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSpec } from '../../src/engine/types.ts';
import { renderProject, ROOT } from './pipeline.ts';
import { describe, fetchRetry } from '../../src/node/net.ts';

const API = (process.env.NV_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.RUNNER_TOKEN || '';
const once = process.argv.includes('--once');
const drain = process.argv.includes('--drain'); // process every queued job, then exit
if (!API || !TOKEN) { console.error('Cần NV_API_URL và RUNNER_TOKEN'); process.exit(1); }
const auth = { authorization: `Bearer ${TOKEN}` };
let activeLease = '';

async function call(path: string, init: RequestInit = {}) {
  const request = { ...init, headers: { ...auth, ...(activeLease ? { 'x-nv-lease': activeLease } : {}), ...(init.headers || {}) } };
  // Retrying a lost claim could reserve another job and orphan the first one.
  const res = path === '/api/illustrated-runner/claim'
    ? await fetch(API + path, { ...request, signal: AbortSignal.timeout(30_000) })
    : await fetchRetry(API + path, request, 'Kết nối trang web (' + path.split('?')[0] + ')');
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}
const post = (path: string, data: unknown) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

async function runJob(job: { id: string; lease: string; spec: ProjectSpec }) {
  if (!/^lease-[a-f0-9]{32}$/.test(job.lease || '')) throw new Error('Máy chủ chưa hỗ trợ lease; cập nhật web và runner cùng phiên bản.');
  activeLease = job.lease;
  const controller = new AbortController();
  let progress = 0, heartbeatBusy = false;
  let phase = 'preparing', message = 'Chuẩn bị tài nguyên', reports = Promise.resolve();
  const report = () => {
    const payload = { progress, phase, message };
    const next = reports.then(() => post(`/api/illustrated-runner/jobs/${job.id}/progress`, payload));
    reports = next.then(() => {}, () => {});
    return next;
  };
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try { await report(); }
    catch (error: any) { if (/HTTP 409/.test(error.message)) controller.abort(new Error('Lượt dựng đã hết hạn.')); }
    finally { heartbeatBusy = false; }
  }, 60_000);
  const dir = join(tmpdir(), 'nv-' + job.id + '-' + job.lease);
  try {
    mkdirSync(join(dir, 'img'), { recursive: true });
    const spec = job.spec;
    // map stored image references to local files
    for (const sc of spec.scenes) for (const p of sc.panels) {
      const ref = p.image || '';
      if (/^doodle:[A-Za-z]{3,40}$/.test(ref)) { p.image = join(ROOT, 'assets/doodles', ref.slice(7) + '.svg'); continue; }
      if (/^peep:[a-z.-]{3,40}$/.test(ref)) continue; // a hand-drawn person, drawn by the engine
      if (ref.startsWith('r2:')) {
        const file = join(dir, 'img', ref.split('/').pop()!);
        writeFileSync(file, Buffer.from(await (await call('/api/illustrated-runner/asset?key=' + encodeURIComponent(ref.slice(3)))).arrayBuffer()));
        p.image = file;
      } else throw new Error('Có khung hình chưa có tranh AI.');
    }
    // uploaded pictures (reference character, product photos)
    for (const [k, ref] of Object.entries(spec.media || {})) {
      if (!ref.startsWith('r2:')) { delete spec.media![k]; continue; }
      const file = join(dir, 'img', 'm-' + ref.split('/').pop()!);
      writeFileSync(file, Buffer.from(await (await call('/api/illustrated-runner/asset?key=' + encodeURIComponent(ref.slice(3)))).arrayBuffer()));
      spec.media![k] = file;
    }
    // background music chosen on the site (public home page media)
    if (spec.music && /^site:[a-f0-9]{24}\.(mp3|m4a)$/.test(spec.music)) {
      const file = join(dir, 'music.' + spec.music.split('.').pop());
      try { writeFileSync(file, Buffer.from(await (await call('/api/site/' + spec.music.slice(5))).arrayBuffer())); spec.music = file; }
      catch (e: any) { console.error('Bỏ nhạc nền:', e.message); delete spec.music; }
    } else delete spec.music;
    // the user's own narration recording
    if (spec.audio?.voice === 'upload' && spec.audio.voiceFile?.startsWith('r2:')) {
      const file = join(dir, 'voice.' + spec.audio.voiceFile.split('.').pop());
      try { writeFileSync(file, Buffer.from(await (await call('/api/illustrated-runner/asset?key=' + encodeURIComponent(spec.audio.voiceFile.slice(3)))).arrayBuffer())); spec.audio.voiceFile = file; }
      catch (e:any){throw new Error('Không tải được giọng đọc gốc. Tệp nguồn vẫn được giữ; hãy thử lại.');}
    }
    const cachedVoiceFiles:string[]=[];
    if((spec.audio?.voice||'tts')==='tts')for(let i=0;i<spec.scenes.length;i++){
      try{const file=join(dir,`cached-voice-${i}.audio`);writeFileSync(file,Buffer.from(await(await call(`/api/illustrated-runner/voice/${job.id}/${i}`)).arrayBuffer()));cachedVoiceFiles[i]=file;}
      catch(e:any){if(!/HTTP 404/.test(e.message))throw e;}
    }
    let last = 0;
    const r = await renderProject({
      project: spec, projDir: dir, out: join(dir, 'video.mp4'), tts: process.env.RUNNER_TTS || spec.voice?.provider, size: 1080,
      signal: controller.signal,cachedVoiceFiles,
      onVoice:async(i,v)=>{if(!cachedVoiceFiles[i])await call(`/api/illustrated-runner/voice/${job.id}/${i}`,{method:'PUT',headers:{'content-type':'application/octet-stream'},body:readFileSync(v.file)});},
      onStage: async (next, detail) => { phase = next; message = detail; await report(); },
      onProgress: (f) => { progress = Math.round(f * 95); if (Date.now() - last > 5000) { last = Date.now(); report().catch(() => {}); } },
    });
    phase = 'uploading'; message = 'Lưu MP4 và phụ đề'; progress = 95; await report();
    await call(`/api/illustrated-runner/jobs/${job.id}/video`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: readFileSync(r.out) });
    await call(`/api/illustrated-runner/jobs/${job.id}/srt`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: readFileSync(r.srt) });
    // a frame for the video list (optional: a failure here never fails the video)
    try {
      const thumb = join(dir, 'thumb.jpg');
      const x = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(2, Math.max(0.3, r.duration / 3))), '-i', r.out, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', thumb]);
      if (x.status === 0) await call(`/api/illustrated-runner/jobs/${job.id}/thumb`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: readFileSync(thumb) });
    } catch (e: any) { console.error('Bỏ ảnh xem trước:', e.message); }
    await post(`/api/illustrated-runner/jobs/${job.id}/done`, { seconds: Math.round(r.seconds), duration: Math.round(r.duration), voice: r.voice, voiceError: r.voiceError, chars: spec.scenes.reduce((n, sc) => n + sc.lines.join(' ').length, 0) });
    console.log(`Xong ${job.id}: ${r.duration.toFixed(1)}s video trong ${r.seconds.toFixed(1)}s`);
    return true;
  } catch (e: any) {
    const why = describe(e);
    console.error(`Lỗi ${job.id}:`, why);
    await post(`/api/illustrated-runner/jobs/${job.id}/fail`, { error: why.slice(0, 300) }).catch(() => {});
    return false;
  } finally {
    clearInterval(heartbeat);
    activeLease = '';
    rmSync(dir, { recursive: true, force: true });
  }
}

// Voice keys entered on the admin page override the machine's own environment.
async function loadKeys() {
  try {
    const { env } = (await (await call('/api/illustrated-runner/config')).json()) as { env: Record<string, string> };
    for (const [k, v] of Object.entries(env || {})) if (/^[A-Z_]+_API_KEY$/.test(k) && v) process.env[k] = v;
  } catch (e: any) { console.error('Không đọc được cài đặt:', e.message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  let job = null;
  // tell the site which voice services this machine can use, so it offers only voices that really work
  const caps = { everai: !!process.env.EVERAI_API_KEY, google: !!process.env.GOOGLE_TTS_API_KEY, eleven: !!process.env.ELEVENLABS_API_KEY };
  try { job = (await (await post('/api/illustrated-runner/claim', { runner: hostname(), caps })).json() as any).job; }
  catch (e: any) { console.error(e.message); if (once || drain) { process.exitCode = 1; break; } }
  if (job) { await loadKeys(); if (!(await runJob(job))) process.exitCode = 1; if (once) break; }
  else if (once || drain) break;
  else await sleep(10_000);
}
