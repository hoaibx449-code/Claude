// EverAI text-to-speech (everai.vn). The API is asynchronous: POST creates a
// request, GET by request_id returns its status and the audio link.
// Each line is synthesised separately so subtitle/drawing timing is exact.
//
// Environment:
//   EVERAI_API_KEY      Bearer key from the EverAI dashboard (required)
//   EVERAI_API_URL      the "[POST] Text to speech" URL from help.everai.vn/api-docs (required)
//   EVERAI_STATUS_URL   the "[GET] Get Request" URL, with {id} where the request id goes
//                       (default: EVERAI_API_URL + "/{id}")
//   EVERAI_VOICE_CODE   default voice code
import { writeFileSync } from 'node:fs';
import { joinLineClips, need, type TTS } from './tts.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Responses are read defensively: the fields may sit at the top level or under "result"/"data".
function pick(obj: any, keys: string[]): any {
  for (const scope of [obj, obj?.result, obj?.data]) {
    if (!scope || typeof scope !== 'object') continue;
    for (const k of keys) if (scope[k] != null) return scope[k];
  }
  return undefined;
}
const DONE = /^(success|done|completed|finished)$/i;
const FAILED = /^(fail|failed|failure|error|cancel(l)?ed)$/i;

export interface EverAIOptions {
  voiceCode?: string;
  speed?: number;
  pitch?: number;
  pollMs?: number;
  timeoutMs?: number;
}

export function everAITTS(opts: EverAIOptions = {}): TTS {
  const pollMs = opts.pollMs ?? 1500, timeoutMs = opts.timeoutMs ?? 120_000;
  return {
    name: 'everai',
    async synth(lines, outBase) {
      const key = need('EVERAI_API_KEY');
      const postUrl = need('EVERAI_API_URL');
      const statusUrl = process.env.EVERAI_STATUS_URL || postUrl.replace(/\/$/, '') + '/{id}';
      const voice = opts.voiceCode || need('EVERAI_VOICE_CODE');
      const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

      const clips: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const res = await fetch(postUrl, {
          method: 'POST', headers,
          body: JSON.stringify({
            response_type: 'indirect',
            input_text: lines[i],
            voice_code: voice,
            audio_type: 'mp3',
            bitrate: 128,
            speed_rate: opts.speed ?? 1.0,
            pitch_rate: opts.pitch ?? 1.0,
          }),
        });
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`EverAI ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
        let link = pick(body, ['audio_link', 'audio_url', 'url']);
        const id = pick(body, ['request_id', 'id']);
        if (!link && !id) throw new Error('EverAI không trả về request_id');

        const t0 = Date.now();
        while (!link) {
          if (Date.now() - t0 > timeoutMs) throw new Error(`EverAI quá thời gian chờ (request ${id})`);
          await sleep(pollMs);
          const r = await fetch(statusUrl.replace('{id}', encodeURIComponent(id)), { headers });
          const j: any = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(`EverAI ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
          const status = String(pick(j, ['status', 'state']) ?? '');
          if (FAILED.test(status)) throw new Error(`EverAI báo lỗi cho request ${id}: ${status}`);
          const l = pick(j, ['audio_link', 'audio_url', 'url']);
          if (l && (!status || DONE.test(status))) link = l;
        }

        const audio = await fetch(link);
        if (!audio.ok) throw new Error(`Không tải được âm thanh EverAI (${audio.status})`);
        const clip = `${outBase}-l${i}.mp3`;
        writeFileSync(clip, Buffer.from(await audio.arrayBuffer()));
        clips.push(clip);
      }
      return joinLineClips(clips, outBase);
    },
  };
}
