// Full render pipeline shared by the CLI and the queue runner:
// images -> narration -> timeline -> frames (Skia) -> FFmpeg (H.264 + AAC) + SRT.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { buildTimeline } from '../engine/timeline.ts';
import { logicalSize, prepare, renderFrame, SANS } from '../engine/render.ts';
import type { HandMeta, ProjectSpec, Timeline } from '../engine/types.ts';
import { pickTTS, withFallback } from './tts.ts';
import { cachedImage, pickImages } from './images.ts';
import { writeSfxTrack } from './sfx.ts';
import { existsSync } from 'node:fs';

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
  signal?: AbortSignal;
  onStage?: (phase: 'preparing' | 'images' | 'voice' | 'rendering', message: string) => void | Promise<void>;
}

export async function renderProject(o: RenderOptions) {
  const { project, projDir } = o;
  o.signal?.throwIfAborted();
  await o.onStage?.('preparing', 'Kiểm tra kịch bản và tài nguyên');
  const out = resolve(o.out);
  if (!/\.mp4$/i.test(out)) throw new Error('Đường dẫn video phải có đuôi .mp4.');
  if (!project.scenes.length || project.scenes.some((sc) => !sc.lines.length)) throw new Error('Mỗi video và mỗi cảnh phải có lời đọc.');
  const workRoot = join(dirname(out), '.work');
  mkdirSync(workRoot, { recursive: true });
  const work = mkdtempSync(join(workRoot, 'render-'));
  const fps = o.fps ?? 30;
  const size = o.size ?? 1080;
  try {
    if (!Number.isInteger(fps) || fps < 1 || fps > 60 || !Number.isFinite(size) || size < 64 || size > 2160) throw new Error('FPS phải từ 1–60; kích thước phải từ 64–2160.');

    GlobalFonts.registerFromPath(join(ROOT, 'assets/fonts/Pangolin-Regular.ttf'), 'Pangolin');
    GlobalFonts.registerFromPath(join(ROOT, 'assets/fonts/BeVietnamPro-ExtraBold.ttf'), SANS);

    // 1. images
    await o.onStage?.('images', 'Chuẩn bị hình minh họa');
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
    const name = o.tts ?? project.voice?.provider;
    // a paid voice that fails (no key, quota, outage) is replaced by the free voice instead of failing the video
    const tts = name && name !== 'mock' && name !== 'free' ? withFallback(await pickTTS(name, project.voice).catch(() => pickTTS('free', project.voice)), project.voice?.voiceId) : await pickTTS(name, project.voice);
    const voice = [];
    for (let i = 0; i < project.scenes.length; i++) {
      await o.onStage?.('voice', `Chuẩn bị lời đọc: cảnh ${i + 1}/${project.scenes.length}`);
      o.signal?.throwIfAborted();
      voice.push(await tts.synth(project.scenes[i].lines, join(work, `scene${i}`)));
    }
    const timeline = buildTimeline(project.scenes, voice, { intro: !!project.intro?.title });

    // 3. hand
    const handDir = resolve(project.hand ? resolve(projDir, project.hand) : join(ROOT, 'assets/hands/default'));
    const meta: HandMeta = JSON.parse(readFileSync(join(handDir, 'hand.json'), 'utf8'));
    const hand = { img: await loadImage(join(handDir, 'hand.webp')), fingers: await loadImage(join(handDir, 'fingers.webp')), meta };

    // 4. frames -> ffmpeg
    await o.onStage?.('rendering', 'Dựng các khung hình và âm thanh');
    const { W, H } = logicalSize(project.ratio);
    const dpr = size / Math.min(W, H);
    // H.264 yuv420p requires both dimensions to be even.
    const PW = Math.round(W * dpr / 2) * 2, PH = Math.round(H * dpr / 2) * 2;
    const env = { createCanvas: (w: number, h: number) => createCanvas(w, h) as any };
    const icons = JSON.parse(readFileSync(join(ROOT, 'assets/icons/tabler.json'), 'utf8'));
    const media: Record<string, any> = {};
    for (const [k, f] of Object.entries(project.media || {})) media[k] = await loadImage(resolve(projDir, f)).catch(() => null);
    const model = prepare({ env, project, timeline, images, hand, dpr, icons, media });
    const canvas = createCanvas(PW, PH), ctx = canvas.getContext('2d');

    const audioArgs: string[] = [], delays: string[] = [];
    voice.forEach((v, i) => {
      audioArgs.push('-i', v.file);
      const ms = Math.round((timeline.scenes[i].start + 0.3) * 1000);
      delays.push(`[${i + 1}:a]aresample=44100,adelay=${ms}:all=1[a${i}]`);
    });
    // format videos: sound effects on their cues, and music that ducks under the voice
    let next = voice.length + 1;
    const sfxFile = join(work, 'sfx.wav');
    const sfx = model.look && project.sfx !== false && writeSfxTrack(model.look.cues, timeline.duration, sfxFile) ? next++ : 0;
    if (sfx) audioArgs.push('-i', sfxFile);
    const musicFile = project.music ? resolve(projDir, project.music) : '';
    const music = musicFile && existsSync(musicFile) ? next++ : 0;
    if (music) audioArgs.push('-stream_loop', '-1', '-i', musicFile);
    let mix = `${delays.join(';')};${voice.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voice.length}:normalize=0[vo]`;
    const layers = ['[vo]'];
    if (music) {
      mix += `;[vo]asplit=2[vo1][vo2];[${music}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.2[mu];[mu][vo2]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[mud]`;
      layers[0] = '[vo1]'; layers.push('[mud]');
    }
    if (sfx) { mix += `;[${sfx}:a]aresample=44100[fx]`; layers.push('[fx]'); }
    mix += layers.length > 1 ? `;${layers.join('')}amix=inputs=${layers.length}:normalize=0:duration=longest,alimiter=limit=0.95[aout]` : `;[vo]anull[aout]`;
    const ff = spawn('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${PW}x${PH}`, '-r', String(fps), '-i', 'pipe:0',
      ...audioArgs,
      '-filter_complex', mix, '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-t', timeline.duration.toFixed(3), '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    let encoderError: Error | undefined;
    ff.stdin.on('error', (error) => { encoderError = error; });
    const done = new Promise<void>((ok, fail) => {
      ff.once('error', fail);
      ff.once('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg thoát với mã ${code}`))));
    });
    // Attach rejection handling immediately while frames are being produced.
    void done.catch(() => {});

    const frames = Math.ceil(timeline.duration * fps), t0 = Date.now();
    try {
      for (let f = 0; f < frames; f++) {
        o.signal?.throwIfAborted();
        if (encoderError) throw encoderError;
        renderFrame(ctx, model, f / fps);
        const buf = Buffer.from(ctx.getImageData(0, 0, PW, PH).data.buffer);
        if (!ff.stdin.write(buf)) await Promise.race([once(ff.stdin, 'drain'), done.then(() => { throw new Error('FFmpeg dừng trước khi nhận đủ khung hình.'); })]);
        if (f % (fps * 5) === 0) o.onProgress?.(f / frames);
      }
      ff.stdin.end();
      await done;
    } catch (error) {
      ff.stdin.destroy(); ff.kill(); await done.catch(() => {}); throw error;
    }
    writeFileSync(out.replace(/\.mp4$/i, '.srt'), toSrt(project, timeline));
    return { out, srt: out.replace(/\.mp4$/i, '.srt'), duration: timeline.duration, frames, width: PW, height: PH, seconds: (Date.now() - t0) / 1000, voice: tts.name };
  } finally { rmSync(work, { recursive: true, force: true }); }
}

