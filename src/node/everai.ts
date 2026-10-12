// EverAI text-to-speech (everai.vn). Asynchronous API:
//   POST {EVERAI_API_URL}            -> { status: 1, result: { request_id } }
//   GET  {EVERAI_API_URL}/{id}       -> { result: { status, audio_link, ... } }
// Each line is synthesised separately so subtitle/drawing timing is exact
// (EverAI returns no word timestamps). Clips are cached by their exact request,
// so re-rendering never pays for the same sentence twice.
//
// Environment:
//   EVERAI_API_KEY     Bearer key from the EverAI dashboard (required)
//   EVERAI_VOICE_CODE  default voice, e.g. vi_female_thuytrang_mb (see everai-voices.ts)
//   EVERAI_MODEL       default everai-v1.6
//   EVERAI_API_URL     default https://www.everai.vn/api/v1/tts
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { joinLineClips, need, type TTS } from './tts.ts';

export const EVERAI_URL = 'https://www.everai.vn/api/v1/tts';
export const EVERAI_MODELS = ['everai-v1.6', 'everai-v1.5', 'everai-v1.5-turbo', 'everai-v1'];
const MAX_CHARS = 5000;

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
      const cacheDir = opts.cacheDir ?? join(outBase, '..', '..', '.cache', 'everai');
      mkdirSync(cacheDir, { recursive: true });

      const clips: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i].trim();
        if (text.length > MAX_CHARS) throw new Error(`Câu ${i + 1} dài quá ${MAX_CHARS} ký tự (giới hạn của EverAI)`);
        const body = { response_type: 'indirect', input_text: text, ...params };
        const cached = join(cacheDir, createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24) + '.mp3');
        const clip = `${outBase}-l${i}.mp3`;
        if (!existsSync(cached)) writeFileSync(cached, await requestOne(url, headers, body, pollMs, timeoutMs));
        copyFileSync(cached, clip);
        clips.push(clip);
      }
      return joinLineClips(clips, outBase);
    },
  };
}

async function requestOne(url: string, headers: Record<string, string>, body: object, pollMs: number, timeoutMs: number): Promise<Buffer> {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const j: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error(`Khoá EverAI không hợp lệ hoặc đã hết hạn (HTTP ${res.status})`);
  if (!res.ok || j.status !== 1) throw new Error(`EverAI từ chối: ${j.error_message || j.message || j.error_code || 'HTTP ' + res.status}`);
  const id = find(j.result, 'request_id');
  if (!id) throw new Error('EverAI không trả về request_id');

  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`EverAI quá thời gian chờ (request ${id})`);
    await sleep(pollMs);
    const r = await fetch(`${url}/${encodeURIComponent(id)}`, { headers });
    if (!r.ok) continue; // transient: keep polling until the timeout
    const s: any = await r.json().catch(() => ({}));
    const status = String(find(s.result ?? s, 'status') ?? '');
    if (FAILED.test(status)) throw new Error(`EverAI báo thất bại (request ${id})${find(s, 'error_message') ? ': ' + find(s, 'error_message') : ''}`);
    const link = find(s, 'audio_link');
    if (link) {
      // plain download: the API key is not sent to the audio host
      const audio = await fetch(String(link));
      if (!audio.ok) throw new Error(`Không tải được âm thanh EverAI (HTTP ${audio.status})`);
      return Buffer.from(await audio.arrayBuffer());
    }
  }
}
