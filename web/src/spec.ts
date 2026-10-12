// Strict validation of project scripts coming from the browser or an AI model.
// Anything not on these lists is dropped, so stored specs are always renderable.
import { HttpError } from './util.ts';

export const STYLES = ['notebook', 'whiteboard', 'chalkboard', 'kraft', 'oly', 'pencil', 'blueprint', 'ricepaper'] as const;
export const TOOLS = ['marker', 'chalk', 'fountain', 'colormarker', 'pencil', 'technical', 'brush'] as const;
export const RATIOS = ['9:16', '16:9'] as const;
export const VOICE_PROVIDERS = ['everai', 'google', 'elevenlabs', 'mock'] as const;
export const DIAGRAM_KINDS = ['bars', 'compare', 'steps', 'flow', 'number', 'statement', 'stick'] as const;
export const ACTIONS = ['idle', 'walk', 'run', 'wave', 'think', 'cheer', 'sad', 'point', 'shrug', 'jump'] as const;
export const VISUAL_MODES = ['mix', 'images', 'diagram'] as const;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

function cleanDiagram(d: any) {
  if (!d || typeof d !== 'object' || !DIAGRAM_KINDS.includes(d.kind)) return null;
  const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
  const out: any = { kind: d.kind };
  if (str(d.title, 60)) out.title = str(d.title, 60);
  switch (d.kind) {
    case 'bars':
      out.values = (Array.isArray(d.values) ? d.values : []).map(Number).filter((v: number) => isFinite(v) && v >= 0 && v < 1e12).slice(0, 5);
      out.labels = strs(d.labels, 5, 16); out.unit = str(d.unit, 6);
      if (str(d.start, 10)) out.start = str(d.start, 10);
      if (d.trend === false) out.trend = false;
      if (!out.values.length) return null;
      break;
    case 'compare':
      out.left = str(d.left, 24); out.right = str(d.right, 24); out.leftNote = str(d.leftNote, 80); out.rightNote = str(d.rightNote, 80);
      if (!out.left || !out.right) return null;
      break;
    case 'steps': out.items = strs(d.items, 4, 70); if (!out.items.length) return null; break;
    case 'flow': out.items = strs(d.items, 4, 28); if (out.items.length < 2) return null; break;
    case 'number': out.number = str(d.number, 10); out.caption = str(d.caption, 80); if (!out.number) return null; break;
    case 'statement': out.text = str(d.text, 140); if (!out.text) return null; break;
    case 'stick':
      out.actors = (Array.isArray(d.actors) ? d.actors : []).slice(0, 2).map((a: any) => {
        const o: any = { action: pick(a?.action, ACTIONS, 'idle') };
        if (str(a?.label, 16)) o.label = str(a.label, 16);
        return o;
      });
      if (!out.actors.length) out.actors = [{ action: 'idle' }];
      if (str(d.bubble, 60)) out.bubble = str(d.bubble, 60);
      if (str(d.caption, 60)) out.caption = str(d.caption, 60);
      break;
  }
  return out;
}

export function cleanSpec(input: any, userId: string) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.scenes)) throw new HttpError(400, 'Kịch bản không hợp lệ.');
  const ownImage = new RegExp(`^r2:img/${userId}/[a-f0-9]{24}\\.(png|jpg|webp)$`);
  const visual = pick(input.visual, VISUAL_MODES, 'diagram');
  const scenes = input.scenes.slice(0, 20).map((sc: any) => {
    const lines = (Array.isArray(sc?.lines) ? sc.lines : []).map((l: unknown) => str(l, 160)).filter(Boolean).slice(0, 3);
    let diagram = cleanDiagram(sc?.diagram);
    // diagram-only videos: a scene that came back with pictures becomes a handwritten statement
    if (!diagram && visual === 'diagram' && lines.length) diagram = { kind: 'statement', text: lines[lines.length - 1].slice(0, 140) };
    if (diagram) return { lines, panels: [], diagram };
    const panels = (Array.isArray(sc?.panels) ? sc.panels : []).slice(0, 2).map((p: any, k: number) => {
      const prompt = str(p?.prompt, 400);
      const image = str(p?.image, 120);
      // only the user's own AI drawings; anything else means "not drawn yet"
      return { image: ownImage.test(image) ? image : '', prompt };
    });
    return { lines, panels };
  }).filter((sc: any) => sc.lines.length && (sc.panels.length || sc.diagram));
  if (!scenes.length) throw new HttpError(400, 'Kịch bản cần ít nhất một cảnh có lời và hình.');
  const v = input.voice || {};
  return {
    title: str(input.title, 100) || 'Video mới',
    caption: str(input.caption, 300),
    hashtags: (Array.isArray(input.hashtags) ? input.hashtags : []).map((h: unknown) => str(h, 30).replace(/\s+/g, ''))
      .map((h: string) => (h.startsWith('#') ? h : '#' + h)).filter((h: string) => /^#[\p{L}\p{N}_]{2,29}$/u.test(h)).slice(0, 10),
    visual,
    channel: str(input.channel, 40),
    episode: str(input.episode, 30),
    ratio: pick(input.ratio, RATIOS, '9:16'),
    style: pick(input.style, STYLES, 'notebook'),
    tool: input.tool ? pick(input.tool, TOOLS, 'marker') : undefined,
    voice: {
      provider: pick(v.provider, VOICE_PROVIDERS, 'everai'),
      voiceId: /^[A-Za-z0-9_-]{3,60}$/.test(v.voiceId || '') ? v.voiceId : undefined,
      speed: num(v.speed, 0.5, 2, 1),
    },
    scenes,
  };
}
