// Render machine: pulls queued jobs from the web app, renders them and uploads the MP4 + SRT.
// Runs anywhere with Node + FFmpeg (your computer, Cloud Run, a VPS).
//   NV_API_URL=https://your-site RUNNER_TOKEN=... node src/cli/runner.ts [--once | --drain]
// Voice/image keys (EVERAI_API_KEY, ...) are read from the environment as for the CLI.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSpec } from '../engine/types.ts';
import { renderProject } from '../node/pipeline.ts';
import { describe, fetchRetry } from '../node/net.ts';

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
  const res = path === '/api/runner/claim'
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
    const next = reports.then(() => post(`/api/runner/jobs/${job.id}/progress`, payload));
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
      if (ref.startsWith('r2:')) {
        const file = join(dir, 'img', ref.split('/').pop()!);
        writeFileSync(file, Buffer.from(await (await call('/api/runner/asset?key=' + encodeURIComponent(ref.slice(3)))).arrayBuffer()));
        p.image = file;
      } else throw new Error('Có khung hình chưa có tranh AI.');
    }
    // uploaded pictures (reference character, product photos)
    for (const [k, ref] of Object.entries(spec.media || {})) {
      if (!ref.startsWith('r2:')) { delete spec.media![k]; continue; }
      const file = join(dir, 'img', 'm-' + ref.split('/').pop()!);
      writeFileSync(file, Buffer.from(await (await call('/api/runner/asset?key=' + encodeURIComponent(ref.slice(3)))).arrayBuffer()));
      spec.media![k] = file;
    }
    // background music chosen on the site (public home page media)
    if (spec.music && /^site:[a-f0-9]{24}\.(mp3|m4a)$/.test(spec.music)) {
      const file = join(dir, 'music.' + spec.music.split('.').pop());
      try { writeFileSync(file, Buffer.from(await (await call('/api/site/' + spec.music.slice(5))).arrayBuffer())); spec.music = file; }
      catch (e: any) { console.error('Bỏ nhạc nền:', e.message); delete spec.music; }
    } else delete spec.music;
    let last = 0;
    const r = await renderProject({
      project: spec, projDir: dir, out: join(dir, 'video.mp4'), tts: process.env.RUNNER_TTS || spec.voice?.provider, size: 1080,
      signal: controller.signal,
      onStage: async (next, detail) => { phase = next; message = detail; await report(); },
      onProgress: (f) => { progress = Math.round(f * 95); if (Date.now() - last > 5000) { last = Date.now(); report().catch(() => {}); } },
    });
    phase = 'uploading'; message = 'Lưu MP4 và phụ đề'; progress = 95; await report();
    await call(`/api/runner/jobs/${job.id}/video`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: readFileSync(r.out) });
    await call(`/api/runner/jobs/${job.id}/srt`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: readFileSync(r.srt) });
    await post(`/api/runner/jobs/${job.id}/done`, { seconds: Math.round(r.seconds), duration: Math.round(r.duration), voice: r.voice, chars: spec.scenes.reduce((n, sc) => n + sc.lines.join(' ').length, 0) });
    console.log(`Xong ${job.id}: ${r.duration.toFixed(1)}s video trong ${r.seconds.toFixed(1)}s`);
    return true;
  } catch (e: any) {
    const why = describe(e);
    console.error(`Lỗi ${job.id}:`, why);
    await post(`/api/runner/jobs/${job.id}/fail`, { error: why.slice(0, 300) }).catch(() => {});
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
    const { env } = (await (await call('/api/runner/config')).json()) as { env: Record<string, string> };
    for (const [k, v] of Object.entries(env || {})) if (/^[A-Z_]+_API_KEY$/.test(k) && v) process.env[k] = v;
  } catch (e: any) { console.error('Không đọc được cài đặt:', e.message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  let job = null;
  try { job = (await (await post('/api/runner/claim', { runner: hostname() })).json() as any).job; }
  catch (e: any) { console.error(e.message); if (once || drain) { process.exitCode = 1; break; } }
  if (job) { await loadKeys(); if (!(await runJob(job))) process.exitCode = 1; if (once) break; }
  else if (once || drain) break;
  else await sleep(10_000);
}
