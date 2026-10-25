// Text-to-speech providers. Each returns the audio file plus when each line is spoken,
// so drawings start exactly when the narration mentions them.
// API keys come only from environment variables and are never logged.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Span } from '../engine/types.ts';
import { estimateVoice } from '../engine/timeline.ts';
import { genderOf, standIn } from '../engine/voices.ts';

export interface VoiceResult { file: string; lines: Span[]; duration: number }
export interface TTS { name: string; synth(lines: string[], outBase: string): Promise<VoiceResult> }

/** Approximate cues for continuous narration without provider timestamps.
 * Fit every cue to the actual audio, rather than using an unrelated reading speed.
 */
export function fitVoice(lines: string[], duration: number): Span[] {
  if (!lines.length || !Number.isFinite(duration) || duration <= 0) throw new Error('Thời lượng lời đọc không hợp lệ.');
  const weights = lines.map((line) => Math.max(1, Array.from(line.trim()).length));
  const total = weights.reduce((a, b) => a + b, 0);
  let start = 0;
  return weights.map((weight, i) => {
    const end = i === weights.length - 1 ? duration : start + duration * weight / total;
    const span = { start, end }; start = end; return span;
  });
}

export function audioDuration(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  return parseFloat(out);
}

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

/**
 * Join one audio clip per line with short pauses. Used for providers that return
 * no timestamps: each line's start/end is then exact by construction.
 */
export function joinLineClips(clips: string[], outBase: string, gap = 0.25): VoiceResult {
  const durs = clips.map(audioDuration);
  const lines: Span[] = [];
  let t = 0;
  durs.forEach((d) => { lines.push({ start: t, end: t + d }); t += d + gap; });
  const file = outBase + '.m4a';
  const inputs = clips.flatMap((c) => ['-i', c]);
  const parts = clips.map((_, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=${gap}[p${i}]`).join(';');
  const filter = `${parts};${clips.map((_, i) => `[p${i}]`).join('')}concat=n=${clips.length}:v=0:a=1[a]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', file]);
  return { file, lines, duration: audioDuration(file) };
}

/** No network: silent track with estimated timing. For layout checks and tests. */
export const mockTTS: TTS = {
  name: 'mock',
  async synth(lines, outBase) {
    const v = estimateVoice(lines);
    const file = outBase + '.wav';
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', v.duration.toFixed(2), file]);
    return { file, ...v };
  },
};

/** ElevenLabs: /with-timestamps returns per-character times. */
export function elevenLabsTTS(voiceId?: string): TTS {
  return {
    name: 'elevenlabs',
    async synth(lines, outBase) {
      const key = need('ELEVENLABS_API_KEY');
      const id = voiceId || need('ELEVENLABS_VOICE_ID');
      const text = lines.join(' ');
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }),
      });
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j: any = await res.json();
      const file = outBase + '.mp3';
      writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
      const starts: number[] = j.alignment.character_start_times_seconds;
      const ends: number[] = j.alignment.character_end_times_seconds;
      const spans: Span[] = [];
      let off = 0;
      for (const l of lines) {
        const a = Math.min(off, starts.length - 1), b = Math.min(off + l.length - 1, ends.length - 1);
        spans.push({ start: starts[a], end: ends[b] });
        off += l.length + 1; // the joining space
      }
      return { file, lines: spans, duration: audioDuration(file) };
    },
  };
}

/** Google Cloud TTS: SSML marks before each line give their start times. */
/** Access token of the machine's own Google service account (Cloud Run), or null elsewhere. */
async function gcpToken(): Promise<{ token: string; project: string } | null> {
  try {
    const md = (p: string) => fetch('http://metadata.google.internal/computeMetadata/v1/' + p, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(1500) });
    const [t, pr] = await Promise.all([md('instance/service-accounts/default/token'), md('project/project-id')]);
    if (!t.ok || !pr.ok) return null;
    return { token: ((await t.json()) as any).access_token, project: await pr.text() };
  } catch { return null; }
}

export function googleTTS(voiceName?: string, languageCode = 'vi-VN', auth?: { token: string; project: string }, tune: { pitch?: number; rate?: number } = {}): TTS {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'google',
    async synth(lines, outBase) {
      const key = auth ? '' : need('GOOGLE_TTS_API_KEY');
      const ssml = '<speak>' + lines.map((l, i) => `<mark name="l${i}"/>${esc(l)}`).join(' ') + '</speak>';
      const res = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize' + (auth ? '' : `?key=${encodeURIComponent(key)}`), {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth.token}`, 'x-goog-user-project': auth.project } : {}) },
        body: JSON.stringify({
          input: { ssml },
          voice: { languageCode, name: voiceName || process.env.GOOGLE_TTS_VOICE || 'vi-VN-Neural2-A' },
          audioConfig: { audioEncoding: 'MP3', ...(tune.pitch ? { pitch: tune.pitch } : {}), ...(tune.rate && tune.rate !== 1 ? { speakingRate: tune.rate } : {}) },
          enableTimePointing: ['SSML_MARK'],
        }),
      });
      if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j: any = await res.json();
      const file = outBase + '.mp3';
      writeFileSync(file, Buffer.from(j.audioContent, 'base64'));
      const duration = audioDuration(file);
      const marks = new Map<string, number>((j.timepoints || []).map((p: any) => [p.markName, p.timeSeconds]));
      const startOf = (i: number) => marks.get(`l${i}`) ?? (i === 0 ? 0 : NaN);
      const spans = lines.map((_, i) => ({ start: startOf(i), end: i + 1 < lines.length ? startOf(i + 1) : duration }));
      if (spans.some((s, i) => !Number.isFinite(s.start) || s.start < 0 || s.end <= s.start || s.end > duration || (i > 0 && s.start < spans[i - 1].end))) return { file, lines: fitVoice(lines, duration), duration };
      return { file, lines: spans, duration };
    },
  };
}

/** Offline fallback: speak the paragraph once to retain sentence context (male or female voice). */
export function espeakFor(voiceId?: string): TTS {
  return {
    name: 'espeak',
    async synth(lines, outBase) {
      const file = outBase + '-e.wav';
      execFileSync('espeak-ng', ['-v', genderOf(voiceId) === 'nam' ? 'vi+m3' : 'vi+f3', '-s', '170', '-w', file, '--stdin'], { input: lines.join(' ') });
      const duration = audioDuration(file);
      return { file, lines: fitVoice(lines, duration), duration };
    },
  };
}
export const espeakTTS = espeakFor();

/**
 * Free voice (no API key): Google Neural2 through the render machine's own Google account
 * (the free monthly allowance covers ordinary use), else espeak-ng offline.
 */
export function freeTTS(voiceId?: string): TTS {
  return {
    name: 'free',
    async synth(lines, outBase) {
      const auth = await gcpToken();
      if (auth) {
        // the stand-in keeps the chosen voice's gender (a male voice never comes out female)
        const v = standIn(voiceId);
        try { return await googleTTS(v.name, 'vi-VN', auth, v).synth(lines, outBase); } catch (e) { console.error('Giọng Google miễn phí lỗi, dùng giọng máy:', (e as Error).message); }
      }
      return espeakFor(voiceId).synth(lines, outBase);
    },
  };
}

/** A voice that cannot even start (no key on this machine, unknown provider): fails with that reason when used. */
export function failingTTS(name: string, e: unknown): TTS {
  return { name, async synth() { throw new Error(`máy dựng không dùng được giọng ${name}: ${String((e as Error)?.message || e).slice(0, 160)}`); } };
}

/** Try the chosen voice; if its key is missing or the service fails, read with the free voice instead. */
export function withFallback(primary: TTS, voiceId?: string): TTS {
  return {
    name: primary.name,
    async synth(lines, outBase) {
      try { return await primary.synth(lines, outBase); }
      catch (e) {
        console.error(`Giọng ${primary.name} lỗi (${(e as Error).message}), chuyển sang giọng miễn phí.`);
        const r = await freeTTS(voiceId).synth(lines, outBase + '-free');
        (this as TTS).name = primary.name + '→free';
        // why the chosen voice was not used: shown on the admin page
        (this as TTS & { error?: string }).error = String((e as Error).message || e).slice(0, 200);
        return r;
      }
    },
  };
}

export async function pickTTS(name: string | undefined, voice?: { voiceId?: string; languageCode?: string; model?: string; speed?: number; pitch?: number; volume?: number }): Promise<TTS> {
  switch (name) {
    case 'free': return freeTTS(voice?.voiceId);
    case 'everai': return (await import('./everai.ts')).everAITTS({ voiceCode: voice?.voiceId, model: voice?.model, speed: voice?.speed, pitch: voice?.pitch, volume: voice?.volume });
    case 'elevenlabs': return elevenLabsTTS(voice?.voiceId);
    case 'google': return googleTTS(voice?.voiceId, voice?.languageCode);
    case 'mock': case undefined: return mockTTS;
    default: throw new Error(`Không có nhà cung cấp giọng "${name}"`);
  }
}
