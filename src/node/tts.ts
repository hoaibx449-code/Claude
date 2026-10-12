// Text-to-speech providers. Each returns the audio file plus when each line is spoken,
// so drawings start exactly when the narration mentions them.
// API keys come only from environment variables and are never logged.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Span } from '../engine/types.ts';
import { estimateVoice } from '../engine/timeline.ts';

export interface VoiceResult { file: string; lines: Span[]; duration: number }
export interface TTS { name: string; synth(lines: string[], outBase: string): Promise<VoiceResult> }

export function audioDuration(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString();
  return parseFloat(out);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
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
export function googleTTS(voiceName?: string, languageCode = 'vi-VN'): TTS {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return {
    name: 'google',
    async synth(lines, outBase) {
      const key = need('GOOGLE_TTS_API_KEY');
      const ssml = '<speak>' + lines.map((l, i) => `<mark name="l${i}"/>${esc(l)}<break time="250ms"/>`).join('') + '</speak>';
      const res = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { ssml },
          voice: { languageCode, name: voiceName || process.env.GOOGLE_TTS_VOICE || 'vi-VN-Neural2-A' },
          audioConfig: { audioEncoding: 'MP3' },
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
      if (spans.some((s) => Number.isNaN(s.start))) return { file, ...estimateVoice(lines), duration };
      return { file, lines: spans, duration };
    },
  };
}

export function pickTTS(name: string | undefined, voice?: { voiceId?: string; languageCode?: string }): TTS {
  switch (name) {
    case 'elevenlabs': return elevenLabsTTS(voice?.voiceId);
    case 'google': return googleTTS(voice?.voiceId, voice?.languageCode);
    case 'mock': case undefined: return mockTTS;
    default: throw new Error(`Không có nhà cung cấp giọng "${name}"`);
  }
}
