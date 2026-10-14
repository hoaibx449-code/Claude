// EverAI text-to-speech (everai.vn). Asynchronous API:
//   POST {EVERAI_API_URL}            -> { status: 1, result: { request_id } }
//   GET  {EVERAI_API_URL}/{id}       -> { result: { status, audio_link, ... } }
// Read whole paragraphs to preserve prosody. EverAI has no word timestamps:
// subtitle/drawing cues are estimates fitted to the measured audio duration.
// Requests are cached by content and voice settings to avoid repeat charges.
//
// Environment:
//   EVERAI_API_KEY     Bearer key from the EverAI dashboard (required)
//   EVERAI_VOICE_CODE  default voice, e.g. vi_female_thuytrang_mb (see everai-voices.ts)
//   EVERAI_MODEL       default everai-v1.6
//   EVERAI_API_URL     default https://www.everai.vn/api/v1/tts
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { audioDuration, fitVoice, joinLineClips, need, type TTS } from './tts.ts';
import { describe, fetchRetry } from './net.ts';

export const EVERAI_URL = 'https://www.everai.vn/api/v1/tts';
export const EVERAI_MODELS = ['everai-v1.6', 'everai-v1.5', 'everai-v1.5-turbo', 'everai-v1'];
const MAX_CHARS = 5000;

export function narrationChunks(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [], length = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > MAX_CHARS) throw new Error(`Câu thoại phải có từ 1 đến ${MAX_CHARS} ký tự.`);
    if (length + (current.length ? 1 : 0) + line.length > MAX_CHARS) {
      chunks.push(current); current = []; length = 0;
    }
    length += (current.length ? 1 : 0) + line.length;
    current.push(line);
  }
  if (current.length) chunks.push(current);
  if (!chunks.length) throw new Error('Kịch bản chưa có lời đọc.');
  return chunks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** First value of `key` anywhere in a nested response. */
function find(o: any, key: string): any {
  if (!o || typeof o !== 'object') return undefined;
  if (o[key] != null && o[key] !== '') return o[key];
  for (const k of Object.keys(o)) {
    const v = find(o[k], key);
    if (v != null) return v;
  }
  return undefined;
}
const FAILED = /^(FAILURE|FAILED|ERROR|CANCELED|CANCELLED)$/i;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface EverAIOptions {
  voiceCode?: string;
  model?: string;
  speed?: number; // 0.5–2.0
  pitch?: number; // 0.5–2.0
  volume?: number; // 50–150
  cacheDir?: string;
  pollMs?: number;
  timeoutMs?: number;
}

export function everAITTS(opts: EverAIOptions = {}): TTS {
  const pollMs = opts.pollMs ?? 2000, timeoutMs = opts.timeoutMs ?? 180_000;
  return {
    name: 'everai',
    async synth(lines, outBase) {
      const key = need('EVERAI_API_KEY');
      const url = (process.env.EVERAI_API_URL || EVERAI_URL).replace(/\/$/, '');
      const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
      const params = {
        voice_code: opts.voiceCode || need('EVERAI_VOICE_CODE'),
        model_id: opts.model || process.env.EVERAI_MODEL || 'everai-v1.6',
        audio_type: 'mp3',
        bitrate: 128,
        speed_rate: Math.round(clamp(opts.speed ?? 1.0, 0.5, 2.0) * 10) / 10,
        pitch_rate: Math.round(clamp(opts.pitch ?? 1.0, 0.5, 2.0) * 10) / 10,
        volume: Math.round(clamp(opts.volume ?? 100, 50, 150)),
      };
      // Work folders are per render and runner jobs are deleted after completion.
      // Keep voice reuse outside those folders. Cloud Run instances still need a
      // shared cache for reuse across machines; this is a local persistent cache.
      // the render container runs as a user that cannot write next to the code (/app): a cache folder
      // that cannot be made used to throw before EverAI was even called, so every video fell back to
      // the free voice. Use the system temp folder then.
      let cacheDir = opts.cacheDir ?? process.env.NV_VOICE_CACHE_DIR ?? resolve('.cache', 'everai');
      try { mkdirSync(cacheDir, { recursive: true }); }
      catch { cacheDir = join(tmpdir(), 'nv-everai-cache'); mkdirSync(cacheDir, { recursive: true }); }

      const clips: string[] = [];
      const spans = [];
      let elapsed = 0;
      const chunks = narrationChunks(lines);
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i].join(' ');
        const body = { response_type: 'indirect', input_text: text, ...params };
        const cached = join(cacheDir, createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24) + '.mp3');
        const clip = `${outBase}-l${i}.mp3`;
        if (!existsSync(cached)) writeFileSync(cached, await requestOne(url, headers, body, pollMs, timeoutMs));
        copyFileSync(cached, clip);
        clips.push(clip);
        const duration = audioDuration(clip);
        spans.push(...fitVoice(chunks[i], duration).map((s) => ({ start: elapsed + s.start, end: elapsed + s.end })));
        elapsed += duration;
      }
      if (clips.length === 1) return { file: clips[0], lines: spans, duration: elapsed };
      const joined = joinLineClips(clips, outBase, 0);
      const scale = joined.duration / elapsed;
      return { ...joined, lines: spans.map((s) => ({ start: s.start * scale, end: s.end * scale })) };
    },
  };
}

async function requestOne(url: string, headers: Record<string, string>, body: object, pollMs: number, timeoutMs: number): Promise<Buffer> {
  // creating a request is not retried automatically: a lost answer could mean a paid duplicate
  let res: Response;
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); }
  catch (e) { throw new Error(`Không gửi được yêu cầu giọng tới EverAI: ${describe(e)}`); }
  const j: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error(`Khoá EverAI không hợp lệ hoặc đã hết hạn (HTTP ${res.status})`);
  if (!res.ok || j.status !== 1) throw new Error(`EverAI từ chối: ${j.error_message || j.message || j.error_code || 'HTTP ' + res.status}`);
  const id = find(j.result, 'request_id');
  if (!id) throw new Error('EverAI không trả về request_id');

  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`EverAI quá thời gian chờ (request ${id})`);
    await sleep(pollMs);
    const r = await fetchRetry(`${url}/${encodeURIComponent(id)}`, { headers }, 'Hỏi trạng thái EverAI');
    if (!r.ok) continue; // transient: keep polling until the timeout
    const s: any = await r.json().catch(() => ({}));
    const status = String(find(s.result ?? s, 'status') ?? '');
    if (FAILED.test(status)) throw new Error(`EverAI báo thất bại (request ${id})${find(s, 'error_message') ? ': ' + find(s, 'error_message') : ''}`);
    const link = find(s, 'audio_link');
    if (link) {
      // plain download: the API key is not sent to the audio host
      const audio = await fetchRetry(String(link), {}, 'Tải giọng EverAI');
      if (!audio.ok) throw new Error(`Không tải được âm thanh EverAI (HTTP ${audio.status})`);
      return Buffer.from(await audio.arrayBuffer());
    }
  }
}
