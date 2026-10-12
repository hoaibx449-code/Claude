// Strict validation of project scripts coming from the browser or an AI model.
// Anything not on these lists is dropped, so stored specs are always renderable.
import { HttpError } from './util.ts';

export const STYLES = ['notebook', 'whiteboard', 'chalkboard', 'kraft', 'oly', 'blueprint', 'ricepaper'] as const;
export const TOOLS = ['marker', 'chalk', 'fountain', 'colormarker', 'pencil', 'technical', 'brush'] as const;
export const RATIOS = ['9:16', '16:9'] as const;
export const VOICE_PROVIDERS = ['everai', 'google', 'elevenlabs', 'mock'] as const;
export const DOODLES = ['Ballet', 'Bikini', 'Chilling', 'Clumsy', 'Coffee', 'Dancing', 'DogJump', 'Doggie', 'Float', 'Groovy', 'IceCream',
  'Jumping', 'Laying', 'Levitate', 'Loving', 'Meditating', 'Moshing', 'Petting', 'Plant', 'Reading', 'ReadingSide', 'RollerSkating',
  'Rolling', 'Running', 'Selfie', 'Sitting', 'SittingReading', 'Sleek', 'Sprinting', 'Strolling', 'Swinging', 'Unboxing', 'Zombieing'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

/** Placeholder art until an AI image is drawn: stable per prompt. */
export function doodleFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return 'doodle:' + DOODLES[Math.abs(h) % DOODLES.length];
}

export function cleanSpec(input: any, userId: string) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.scenes)) throw new HttpError(400, 'Kịch bản không hợp lệ.');
  const ownImage = new RegExp(`^r2:img/${userId}/[a-f0-9]{24}\\.(png|jpg|webp)$`);
  const scenes = input.scenes.slice(0, 20).map((sc: any) => {
    const lines = (Array.isArray(sc?.lines) ? sc.lines : []).map((l: unknown) => str(l, 160)).filter(Boolean).slice(0, 3);
    const panels = (Array.isArray(sc?.panels) ? sc.panels : []).slice(0, 2).map((p: any, k: number) => {
      const prompt = str(p?.prompt, 400);
      let image = str(p?.image, 120);
      if (!(ownImage.test(image) || /^doodle:[A-Za-z]+$/.test(image) && DOODLES.includes(image.slice(7)))) image = doodleFor(prompt || lines[k] || String(k));
      return { image, prompt };
    });
    return { lines, panels };
  }).filter((sc: any) => sc.lines.length && sc.panels.length);
  if (!scenes.length) throw new HttpError(400, 'Kịch bản cần ít nhất một cảnh có lời và hình.');
  const v = input.voice || {};
  return {
    title: str(input.title, 100) || 'Video mới',
    channel: str(input.channel, 40),
    episode: str(input.episode, 30),
    ratio: pick(input.ratio, RATIOS, '9:16'),
    style: pick(input.style, STYLES, 'notebook'),
    tool: input.tool ? pick(input.tool, TOOLS, 'marker') : undefined,
    voice: {
      provider: pick(v.provider, VOICE_PROVIDERS, 'everai'),
      voiceId: /^[a-z]{2}_[a-z]+_[a-z0-9_-]{2,40}$/i.test(v.voiceId || '') ? v.voiceId : undefined,
      speed: num(v.speed, 0.5, 2, 1),
    },
    scenes,
  };
}
