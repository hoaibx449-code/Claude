// Strict validation of project scripts coming from the browser or an AI model.
// Anything not on these lists is dropped, so stored specs are always renderable.
import { HttpError } from './util.ts';
import { composeScene } from './compose.ts';
import { detectIntent, FORMATS, NICHES } from './intent.ts';

export const STYLES = ['notebook', 'whiteboard', 'chalkboard', 'kraft', 'oly', 'pencil', 'blueprint', 'ricepaper', 'neon', 'pastel', 'newspaper', 'comic', 'darkboard', 'sunset', 'cosmos', 'manim', 'bold'] as const;
export const MODES = ['hand', 'motion', 'math', 'kinetic'] as const;
export const MAX_SCENES = 80;
/** an uploaded picture of this user (reference character, product photo) */
export const mediaRef = (userId: string) => new RegExp(`^r2:up/${userId.replace(/[^\w-]/g, '')}/[a-f0-9]{24}\\.(png|jpg|webp)$`);
export const TRANSITIONS = ['auto', 'fade', 'slide', 'wipe', 'zoom'] as const;
export const TOOLS = ['marker', 'chalk', 'fountain', 'colormarker', 'pencil', 'technical', 'brush'] as const;
export const RATIOS = ['9:16', '16:9'] as const;
export const VOICE_PROVIDERS = ['everai', 'google', 'elevenlabs', 'free', 'mock'] as const;
export const DIAGRAM_KINDS = ['bars', 'compare', 'steps', 'flow', 'number', 'statement', 'stick', 'sketch', 'plot'] as const;
const PLOT_FNS = ['linear', 'exp', 'log', 'sin', 'square', 'sqrt', 'down', 'wave'] as const;
export const ACTIONS = ['idle', 'walk', 'run', 'wave', 'think', 'cheer', 'sad', 'point', 'shrug', 'jump'] as const;
export const VISUAL_MODES = ['sketch', 'diagram', 'mix', 'images'] as const;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);

const COLORS = ['ink', 'accent', 'accent2', 'good'] as const;
const pct = (v: unknown, def: number) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : def);
const ref = (v: unknown) => (Array.isArray(v) && v.length === 2 ? [pct(v[0], 50), pct(v[1], 50)] : /^[A-Za-z0-9_-]{1,20}$/.test(String(v ?? '')) ? String(v) : null);

/** Free composition: each item is checked field by field; unknown items are dropped. */
function cleanSketch(items: unknown, lines: number, media: string[] = []) {
  if (!Array.isArray(items)) return null;
  const out: any[] = [];
  for (const it of items.slice(0, 18) as any[]) {
    if (!it || typeof it !== 'object') continue;
    const o: any = { t: it.t };
    if (/^[A-Za-z0-9_-]{1,20}$/.test(String(it.id ?? ''))) o.id = String(it.id);
    if (Number.isInteger(it.line) && it.line >= 0 && it.line < lines) o.line = it.line;
    if (str(it.cue, 40)) o.cue = str(it.cue, 40);
    if (COLORS.includes(it.color)) o.color = it.color;
    const at = () => { o.x = pct(it.x, 50); o.y = pct(it.y, 50); };
    switch (it.t) {
      case 'text':
        o.text = str(it.text, 60); if (!o.text) continue; at();
        o.size = pick(it.size, ['s', 'm', 'l', 'xl', 'xxl'] as const, 'm');
        if (it.align === 'left') o.align = 'left';
        if (it.w != null) o.w = pct(it.w, 80);
        break;
      case 'icon':
        o.name = str(it.name, 40).toLowerCase(); if (!/^[a-z0-9-]{2,40}$/.test(o.name)) continue; at();
        o.w = Math.max(6, Math.min(60, pct(it.w, 22)));
        if (str(it.label, 30)) o.label = str(it.label, 30);
        break;
      case 'person':
        at(); o.action = pick(it.action, ACTIONS, 'idle'); o.h = Math.max(12, Math.min(60, pct(it.h, 30)));
        if (it.facing === -1) o.facing = -1;
        if (str(it.label, 16)) o.label = str(it.label, 16);
        if (str(it.bubble, 50)) o.bubble = str(it.bubble, 50);
        break;
      case 'chart': {
        const d = cleanDiagram({ ...it, title: undefined });
        if (!d || !['bars', 'flow', 'compare', 'steps', 'number', 'plot'].includes(d.kind)) continue;
        at(); Object.assign(o, d, { t: 'chart', w: Math.max(30, pct(it.w, 80)), h: Math.max(15, Math.min(80, pct(it.h, 35))) });
        break;
      }
      case 'arrow':
        o.from = ref(it.from); o.to = ref(it.to); if (!o.from || !o.to) continue;
        if (Number.isFinite(Number(it.curve))) o.curve = Math.max(-1, Math.min(1, Number(it.curve)));
        if (str(it.label, 24)) o.label = str(it.label, 24);
        break;
      case 'image':
        o.src = str(it.src, 20); if (!media.includes(o.src)) continue; at();
        o.w = Math.max(15, Math.min(100, pct(it.w, 55)));
        if (it.h != null) o.h = Math.max(10, Math.min(90, pct(it.h, 40)));
        if (it.shape === 'circle' || it.shape === 'rounded') o.shape = it.shape;
        if (str(it.label, 40)) o.label = str(it.label, 40);
        break;
      case 'qr':
        o.text = str(it.text, 300); if (!/^https?:\/\/[^\s"<>]{3,}$/.test(o.text)) continue; at();
        o.w = Math.max(15, Math.min(60, pct(it.w, 32)));
        if (str(it.label, 30)) o.label = str(it.label, 30);
        break;
      case 'circle': case 'underline': case 'box': case 'cross': case 'check':
        o.on = ref(it.on ?? it.around ?? it.under); if (!o.on || Array.isArray(o.on)) continue;
        break;
      default: continue;
    }
    out.push(o);
  }
  return out.length ? out : null;
}

function cleanDiagram(d: any, lines = 3, media: string[] = []) {
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
    case 'plot':
      out.fn = pick(d.fn, PLOT_FNS, 'exp');
      out.values = (Array.isArray(d.values) ? d.values : []).map(Number).filter((v: number) => isFinite(v) && Math.abs(v) < 1e12).slice(0, 12);
      if (!out.values.length) delete out.values;
      if (str(d.xLabel, 16)) out.xLabel = str(d.xLabel, 16);
      if (str(d.yLabel, 16)) out.yLabel = str(d.yLabel, 16);
      if (str(d.caption, 40)) out.caption = str(d.caption, 40);
      break;
    case 'sketch':
      out.items = cleanSketch(d.items, lines, media); if (!out.items) return null;
      delete out.title;
      break;
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
  const visual = pick(input.visual, VISUAL_MODES, 'sketch');
  const ratio = pick(input.ratio, RATIOS, '9:16');
  // what kind of video this is (detected from the words when not given)
  const words = input.scenes.map((sc: any) => (Array.isArray(sc?.lines) ? sc.lines.join(' ') : '')).join(' ');
  const guess = FORMATS.includes(input.format) && NICHES.includes(input.niche) ? null : detectIntent(words);
  const format = FORMATS.includes(input.format) ? input.format : guess!.format;
  const niche = NICHES.includes(input.niche) ? input.niche : guess!.niche;
  const total = Math.min(MAX_SCENES, input.scenes.length);
  // uploaded pictures: only this user's own files
  const own = mediaRef(userId), media: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.media && typeof input.media === 'object' ? input.media : {}).slice(0, 12)) if (/^[a-z0-9]{1,20}$/.test(k) && own.test(String(v))) media[k] = String(v);
  const mk = Object.keys(media);
  const scenes = input.scenes.slice(0, MAX_SCENES).map((sc: any, si: number) => {
    const lines = (Array.isArray(sc?.lines) ? sc.lines : []).map((l: unknown) => str(l, 160)).filter(Boolean).slice(0, 3);
    let diagram = cleanDiagram(sc?.diagram, lines.length, mk);
    // drawn-only videos: a scene that came back without a usable drawing gets one designed from its words
    if (!diagram && (visual === 'diagram' || visual === 'sketch') && lines.length) diagram = { kind: 'sketch', items: cleanSketch(composeScene(lines, ratio === '9:16', si, { format, index: si, total }), lines.length) };
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
    visual, format, niche,
    channel: str(input.channel, 40),
    episode: str(input.episode, 30),
    ratio,
    subtitles: input.subtitles === true,
    transition: pick(input.transition, TRANSITIONS, 'auto'),
    style: pick(input.style, STYLES, 'notebook'),
    mode: pick(input.mode, MODES, 'hand'),
    intro: input.intro && str(input.intro.title, 90) ? {
      title: str(input.intro.title, 90), sub: str(input.intro.sub, 80) || undefined, badge: str(input.intro.badge, 18) || undefined,
      icon: /^[a-z0-9-]{2,40}$/.test(String(input.intro.icon || '')) ? String(input.intro.icon) : undefined,
    } : null,
    media,
    character: mk.includes(input.character) ? input.character : undefined,
    affiliate: input.affiliate && /^https?:\/\/[^\s"<>]{3,300}$/.test(String(input.affiliate.link || '')) ? {
      link: String(input.affiliate.link), product: str(input.affiliate.product, 80), price: str(input.affiliate.price, 30), image: mk.includes(input.affiliate.image) ? input.affiliate.image : undefined,
    } : undefined,
    tool: input.tool ? pick(input.tool, TOOLS, 'marker') : undefined,
    voice: {
      provider: pick(v.provider, VOICE_PROVIDERS, 'everai'),
      voiceId: /^[A-Za-z0-9_-]{3,60}$/.test(v.voiceId || '') ? v.voiceId : undefined,
      speed: num(v.speed, 0.5, 2, 1),
    },
    scenes,
  };
}
