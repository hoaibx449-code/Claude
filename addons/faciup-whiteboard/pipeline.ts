// Full render pipeline shared by the CLI and the queue runner:
// images -> narration -> timeline -> frames (Skia) -> FFmpeg (H.264 + AAC) + SRT.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage, Path2D } from '@napi-rs/canvas';
import { setPeeps, hasPeeps } from '../../src/engine/act/peeps.ts';
import { buildTimeline } from '../../src/engine/timeline.ts';
import { cuesOf, logicalSize, prepare, renderFrame, SANS } from './renderer.ts';
import type { HandMeta, ProjectSpec, Timeline } from '../../src/engine/types.ts';
import { audioDuration, fitVoice, mockTTS, pickTTS, withFallback, type VoiceResult } from '../../src/node/tts.ts';
import { moodOf, writeMusic, type Mood } from '../../src/node/music.ts';
import { cachedImage, pickImages } from '../../src/node/images.ts';
import { writeSfxTrack } from '../../src/node/sfx.ts';
import { existsSync } from 'node:fs';

/** The photographed poses of adaptive hand positioning (assets/hands/poses, see tools/hands-build.py). */
export async function loadPoses(dir: string) {
  if (!existsSync(join(dir, 'poses.json'))) return undefined;
  const out: Record<string, any> = {};
  for (const pm of JSON.parse(readFileSync(join(dir, 'poses.json'), 'utf8'))) {
    out[pm.id] = { meta: pm, img: await loadImage(join(dir, `hand-${pm.id}.webp`)), fingers: await loadImage(join(dir, `fingers-${pm.id}.webp`)) };
  }
  return out;
}

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
    GlobalFonts.registerFromPath(join(ROOT, 'addons/faciup-whiteboard/assets/PatrickHand-Regular.ttf'), 'WB Hand');
    GlobalFonts.registerFromPath(join(ROOT, 'assets/fonts/BeVietnamPro-ExtraBold.ttf'), SANS);

    // 1. images
    await o.onStage?.('images', 'Chuẩn bị hình minh họa');
    const gen = pickImages(o.images ?? project.images?.provider);
    const imagePaths: string[][] = [];
    for (const sc of project.scenes) {
      const row: string[] = [];
      for (const p of sc.panels) {
        if (p.image?.startsWith('peep:')) row.push('');
        else if (p.image) row.push(resolve(projDir, p.image));
        else if (p.prompt && gen) row.push(await cachedImage(gen, p.prompt, join(projDir, '.cache', gen.name)));
        else throw new Error('Khung hình thiếu "image" và chưa chọn nhà cung cấp ảnh (--images openai|gemini)');
      }
      imagePaths.push(row);
    }
    const images = await Promise.all(imagePaths.map((r) => Promise.all(r.map((p) => (p ? loadImage(p) : createCanvas(4, 3) as any)))));

    // 2. voice: generated (TTS), the user's own recording, or none (layout only)
    const mode = project.audio?.voice || 'tts';
    const name = o.tts ?? project.voice?.provider;
    let tts = { name: 'none' } as { name: string };
    let voice: VoiceResult[] = [];
    let continuous = false;
    if (mode === 'upload' && project.audio?.voiceFile && existsSync(resolve(projDir, project.audio.voiceFile))) {
      await o.onStage?.('voice', 'Khớp lời đọc tải lên với các cảnh');
      voice = splitUploaded(project, resolve(projDir, project.audio.voiceFile));
      continuous = true; tts = { name: 'upload' };
    } else if (mode === 'none') {
      for (let i = 0; i < project.scenes.length; i++) voice.push(await mockTTS.synth(project.scenes[i].lines, join(work, `scene${i}`)));
      tts = { name: 'none' };
    } else {
      // Add-on: preserve the chosen voice; never silently replace it with a different provider.
      const engine = await pickTTS(name, project.voice);
      for (let i = 0; i < project.scenes.length; i++) {
        await o.onStage?.('voice', `Chuẩn bị lời đọc: cảnh ${i + 1}/${project.scenes.length}`);
        o.signal?.throwIfAborted();
        voice.push(await engine.synth(project.scenes[i].lines, join(work, `scene${i}`)));
      }
      tts = engine;
    }
    // story animation opens on an action, not a title card
    const timeline = buildTimeline(project.scenes, voice, { intro: !!project.intro?.title && project.look !== 'act', continuous });

    // 3. hand
    const handDir = resolve(project.hand ? resolve(projDir, project.hand) : join(ROOT, 'assets/hands/default'));
    const meta: HandMeta = JSON.parse(readFileSync(join(handDir, 'hand.json'), 'utf8'));
    const hand: any = { img: await loadImage(join(handDir, 'hand.webp')), fingers: await loadImage(join(handDir, 'fingers.webp')), meta };
    if(project.look==='whiteboard')hand.whiteboardImage=await loadImage(join(ROOT,'addons/faciup-whiteboard/assets/hand.png'));
    hand.poses = await loadPoses(join(ROOT, 'assets/hands/poses'));

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
    if (project.figures !== 'rig' && !hasPeeps()) {
      (globalThis as any).Path2D ||= Path2D;
      setPeeps(JSON.parse(readFileSync(join(ROOT, 'assets/peeps/peeps.json'), 'utf8')));
    }
    const model = prepare({ env, project, timeline, images, hand, dpr, icons, media });
    const canvas = createCanvas(PW, PH), ctx = canvas.getContext('2d');

    // sound layers stay separate (voice, music, effects), each with its own level, and are also
    // written as stems next to the video so they can be replaced or remixed later
    const lv = { voice: project.audio?.voiceVolume ?? 1, music: project.audio?.musicVolume ?? 0.2, sfx: project.audio?.sfxVolume ?? 1 };
    const audioArgs: string[] = [];
    let next = 1;
    let mix = '';
    const layers: string[] = [];
    const hasVoice = tts.name !== 'none' && voice.length > 0;
    if (hasVoice) {
      if (continuous) {
        audioArgs.push('-i', voice[0].file);
        const ms = Math.round((timeline.scenes[0].start + 0.3) * 1000);
        mix += `[${next}:a]aresample=44100,adelay=${ms}:all=1,volume=${lv.voice}[vo]`; next++;
      } else {
        const delays: string[] = [];
        voice.forEach((v, i) => {
          audioArgs.push('-i', v.file);
          const ms = Math.round((timeline.scenes[i].start + 0.3) * 1000);
          delays.push(`[${next + i}:a]aresample=44100,adelay=${ms}:all=1[a${i}]`);
        });
        next += voice.length;
        mix += `${delays.join(';')};${voice.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voice.length}:normalize=0,volume=${lv.voice}[vo]`;
      }
      layers.push('[vo]');
    }
    // effects on their cues
    const sfxFile = join(work, 'sfx.wav');
    const cues = cuesOf(model);
    const sfx = cues.length && project.sfx !== false && lv.sfx > 0 && writeSfxTrack(cues, timeline.duration, sfxFile, lv.sfx) ? next++ : 0;
    if (sfx) audioArgs.push('-i', sfxFile);
    // music: the chosen track, else (story animation) a piece written for the mood of the script
    let musicFile = project.music ? resolve(projDir, project.music) : '';
    const mood = project.audio?.mood;
    if ((!musicFile || !existsSync(musicFile)) && mood !== 'none' && (mood || project.look === 'act')) {
      musicFile = join(work, 'music.wav');
      writeMusic((mood as Mood) || moodOf(project.scenes.map((s) => s.lines.join(' ')).join(' ')), timeline.duration, musicFile);
    }
    const music = musicFile && existsSync(musicFile) && lv.music > 0 ? next++ : 0;
    if (music) audioArgs.push('-stream_loop', '-1', '-i', musicFile);
    if (music) {
      if (hasVoice) {
        mix += `;[vo]asplit=2[vo1][vo2];[${music}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${lv.music}[mu];[mu][vo2]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[mud]`;
        layers[0] = '[vo1]';
      } else mix += `${mix ? ';' : ''}[${music}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${lv.music}[mud]`;
      layers.push('[mud]');
    }
    if (sfx) { mix += `${mix ? ';' : ''}[${sfx}:a]aresample=44100[fx]`; layers.push('[fx]'); }
    if (!layers.length) { mix = `anullsrc=r=44100:cl=stereo[aout]`; }
    else mix += layers.length > 1 ? `;${layers.join('')}amix=inputs=${layers.length}:normalize=0:duration=longest,alimiter=limit=0.95[aout]` : `;${layers[0]}anull[aout]`;
    const stems = { sfx: sfx ? sfxFile : '', music: music ? musicFile : '', voice: hasVoice ? (continuous ? voice[0].file : '') : '' };
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
    writeStems(out, stems, timeline.duration);
    return { out, srt: out.replace(/\.mp4$/i, '.srt'), duration: timeline.duration, frames, width: PW, height: PH, seconds: (Date.now() - t0) / 1000, voice: tts.name, voiceError: (tts as { error?: string }).error || '' };
  } finally { rmSync(work, { recursive: true, force: true }); }
}


/** The user's recording, split across scenes in proportion to their text (one continuous file). */
export function splitUploaded(project: ProjectSpec, file: string): VoiceResult[] {
  const D = audioDuration(file), all = project.scenes.flatMap((s) => s.lines);
  const spans = fitVoice(all, D);
  const out: VoiceResult[] = [];
  let k = 0;
  project.scenes.forEach((sc, i) => {
    const first = spans[k].start, mine = spans.slice(k, k + sc.lines.length);
    k += sc.lines.length;
    const end = i === project.scenes.length - 1 ? D : spans[k].start;
    out.push({ file, lines: mine.map((s) => ({ start: s.start - first, end: s.end - first })), duration: end - first });
  });
  return out;
}

/** Effects and music as separate files next to the video (voice too when it is one file). */
function writeStems(out: string, stems: { sfx: string; music: string; voice: string }, duration: number) {
  const base = out.replace(/\.mp4$/i, '');
  for (const [k, f] of Object.entries(stems)) {
    if (!f || !existsSync(f)) continue;
    try { spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-t', duration.toFixed(2), '-c:a', 'aac', '-b:a', '128k', `${base}.${k}.m4a`]); } catch { /* stems are optional */ }
  }
}
