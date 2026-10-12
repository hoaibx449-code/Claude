// Full render pipeline shared by the CLI and the queue runner:
// images -> narration -> timeline -> frames (Skia) -> FFmpeg (H.264 + AAC) + SRT.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { buildTimeline } from '../engine/timeline.ts';
import { logicalSize, prepare, renderFrame } from '../engine/render.ts';
import type { HandMeta, ProjectSpec, Timeline } from '../engine/types.ts';
import { pickTTS } from './tts.ts';
import { cachedImage, pickImages } from './images.ts';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function srtTime(s: number) {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function toSrt(project: ProjectSpec, tl: Timeline) {
  let n = 0;
  return project.scenes.flatMap((sc, i) => sc.lines.map((l, k) => {
    const s = tl.scenes[i].lines[k];
    return `${++n}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${l}\n`;
  })).join('\n');
}


export interface RenderOptions {
  project: ProjectSpec;
  /** Folder that relative image/hand paths are resolved against. */
  projDir: string;
  out: string;
  tts?: string;
  images?: string;
  size?: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
}

export async function renderProject(o: RenderOptions) {
  const { project, projDir } = o;
  const out = resolve(o.out);
  const work = join(dirname(out), '.work');
  mkdirSync(work, { recursive: true });
  const fps = o.fps ?? 30;

  GlobalFonts.registerFromPath(join(ROOT, 'assets/fonts/Pangolin-Regular.ttf'), 'Pangolin');

  // 1. images
  const gen = pickImages(o.images ?? project.images?.provider);
  const imagePaths: string[][] = [];
  for (const sc of project.scenes) {
    const row: string[] = [];
    for (const p of sc.panels) {
      if (p.image) row.push(resolve(projDir, p.image));
      else if (p.prompt && gen) row.push(await cachedImage(gen, p.prompt, join(projDir, '.cache', gen.name)));
      else throw new Error('Khung hình thiếu "image" và chưa chọn nhà cung cấp ảnh (--images openai|gemini)');
    }
    imagePaths.push(row);
  }
  const images = await Promise.all(imagePaths.map((r) => Promise.all(r.map((p) => loadImage(p)))));

  // 2. voice
  const tts = await pickTTS(o.tts ?? project.voice?.provider, project.voice);
  const voice = [];
  for (let i = 0; i < project.scenes.length; i++) voice.push(await tts.synth(project.scenes[i].lines, join(work, `scene${i}`)));
  const timeline = buildTimeline(project.scenes, voice);

  // 3. hand
  const handDir = resolve(project.hand ? resolve(projDir, project.hand) : join(ROOT, 'assets/hands/default'));
  const meta: HandMeta = JSON.parse(readFileSync(join(handDir, 'hand.json'), 'utf8'));
  const hand = { img: await loadImage(join(handDir, 'hand.webp')), fingers: await loadImage(join(handDir, 'fingers.webp')), meta };

  // 4. frames -> ffmpeg
  const { W, H } = logicalSize(project.ratio);
  const dpr = (o.size ?? 1080) / Math.min(W, H);
  const PW = Math.round(W * dpr), PH = Math.round(H * dpr);
  const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
  const icons = JSON.parse(readFileSync(join(ROOT, 'assets/icons/tabler.json'), 'utf8'));
  const model = prepare({ env, project, timeline, images, hand, dpr, icons });
  const canvas = createCanvas(PW, PH), ctx = canvas.getContext('2d');

  const audioArgs: string[] = [], delays: string[] = [];
  voice.forEach((v, i) => {
    audioArgs.push('-i', v.file);
    const ms = Math.round((timeline.scenes[i].start + 0.3) * 1000);
    delays.push(`[${i + 1}:a]aresample=44100,adelay=${ms}:all=1[a${i}]`);
  });
  const mix = `${delays.join(';')};${voice.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voice.length}:normalize=0[aout]`;
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${PW}x${PH}`, '-r', String(fps), '-i', 'pipe:0',
    ...audioArgs,
    '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-t', timeline.duration.toFixed(3), '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<void>((ok, fail) => ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg thoát với mã ${code}`)))));

  const frames = Math.ceil(timeline.duration * fps), t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    renderFrame(ctx, model, f / fps);
    const buf = Buffer.from(ctx.getImageData(0, 0, PW, PH).data.buffer);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (fps * 5) === 0) o.onProgress?.(f / frames);
  }
  ff.stdin.end();
  await done;
  writeFileSync(out.replace(/\.mp4$/, '.srt'), toSrt(project, timeline));
  return { out, srt: out.replace(/\.mp4$/, '.srt'), duration: timeline.duration, frames, width: PW, height: PH, seconds: (Date.now() - t0) / 1000, voice: tts.name };
}

