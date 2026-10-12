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

async function call(path: string, init: RequestInit = {}) {
  const res = await fetchRetry(API + path, { ...init, headers: { ...auth, ...(init.headers || {}) } }, 'Kết nối trang web (' + path.split('?')[0] + ')');
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}
const post = (path: string, data: unknown) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

async function runJob(job: { id: string; spec: ProjectSpec }) {
  const dir = join(tmpdir(), 'nv-' + job.id);
  mkdirSync(join(dir, 'img'), { recursive: true });
  try {
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
    let last = 0;
    const r = await renderProject({
      project: spec, projDir: dir, out: join(dir, 'video.mp4'), tts: process.env.RUNNER_TTS || spec.voice?.provider, size: 1080,
      onProgress: (f) => { if (Date.now() - last > 5000) { last = Date.now(); post(`/api/runner/jobs/${job.id}/progress`, { progress: Math.round(f * 95) }).catch(() => {}); } },
    });
    await call(`/api/runner/jobs/${job.id}/video`, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: readFileSync(r.out) });
    await call(`/api/runner/jobs/${job.id}/srt`, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: readFileSync(r.srt) });
    await post(`/api/runner/jobs/${job.id}/done`, {});
    console.log(`Xong ${job.id}: ${r.duration.toFixed(1)}s video trong ${r.seconds.toFixed(1)}s`);
  } catch (e: any) {
    const why = describe(e);
    console.error(`Lỗi ${job.id}:`, why);
    await post(`/api/runner/jobs/${job.id}/fail`, { error: why.slice(0, 300) }).catch(() => {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (;;) {
  let job = null;
  try { job = (await (await post('/api/runner/claim', { runner: hostname() })).json() as any).job; }
  catch (e: any) { console.error(e.message); }
  if (job) { await runJob(job); if (once) break; }
  else if (once || drain) break;
  else await sleep(10_000);
}
