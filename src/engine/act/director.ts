// The director turns the story script (cast + scenes of animation events) and the narration
// timing into a model that draws any frame as a pure function of t:
//  · a world of stages side by side (a new place is the next stage: the camera travels there,
//    people walk there, what was drawn stays on the paper);
//  · the hand draws sets, props and people stroke by stroke, the nib on the path, then leaves;
//  · people act: walking (feet follow the ground), gestures, emotions, speech bubbles, turning;
//  · camera framing changes on purpose (wide, two-shot, close), match cuts and morphs link scenes;
//  · sparse text only for key words, figures and the conclusion;
//  · sound cues for the pen, steps, pops, transitions.
import type { Ctx, Ratio, SceneSpec, Timeline } from '../types.ts';
import { clamp, drawPlan, ease, easeBack, hash, lerp, paint, paintPlan, place, planAt, resample, roughArrow, roughLine, seg, transform, type DrawPlan, type Prim, type Pt } from './geom.ts';
import { actionPose, BODY_HEIGHT, characterPrims, emotionFace, emotionPosture, handPoint, headPoint, LOOKS, mixPose, type CharLook, type Emotion, type Pose } from './rig.ts';
import { propPrims, SETS } from './props.ts';
import { HAND_SPEED, pace } from '../strokes.ts';
import { drawReveal, makeReveal, revealPen, type Reveal } from '../reveal.ts';
import { faceOf, hasPeeps, peepPicture, PEEP_LOOKS, poseOf, FRAME, type PeepLook, type PeepPicture } from './peeps.ts';
import type { Env } from '../types.ts';
import type { ActBeat, ActCast, ActScene, When } from './spec.ts';

export type ActSfx = 'whoosh' | 'pop' | 'msg' | 'tick' | 'ding' | 'scribble' | 'step' | 'buzz' | 'swish' | 'tap';
export interface ActCue { t: number; k: ActSfx; d?: number; v?: number }

interface Move { t0: number; t1: number; x0: number; x1: number; run: boolean }
interface BodyEv { t0: number; t1: number; do: string; hold: boolean; k?: number }
interface Actor {
  id: string; look: CharLook; seed: number;
  /** drawn as an Open Peeps person instead of the vector rig */
  peep?: PeepLook;
  /** the hand drawing a peeps person: its picture revealed stroke by stroke */
  reveal?: { R: Reveal; pic: PeepPicture; flip: number; x: number };
  x0: number; visibleFrom: number;
  draw?: { start: number; end: number; plan: DrawPlan };
  moves: Move[]; body: BodyEv[]; emos: { t: number; e: Emotion }[]; faces: { t: number; f: number }[];
  talks: { t0: number; t1: number }[]; holds: { t: number; kind: string | null }[];
}
interface PropS { id: string; kind: string; prims: Prim[]; appear: number; draw?: { start: number; end: number; plan: DrawPlan }; gone?: number; morph?: { t0: number; t1: number; to: Prim[] } }
export interface HandTask { start: number; end: number; space: 'world' | 'screen'; pen(q: number): { x: number; y: number; lift: number } }
interface CamKey { t: number; dur: number; x: number; y: number; z: number; from?: { x: number; y: number; z: number } }
interface Bubble { who: string; t0: number; t1: number; text: string; think: boolean }
interface Mark { who: string; t0: number; t1: number; kind: string }
interface Txt { t0: number; t1: number; text: string; kind: string; who?: string; style: number; scene: number;
  /** written by the hand stroke by stroke (handwriting from the font's centre lines) */
  rv?: { R: Reveal; x: number; y: number; start: number; end: number };
  /** a rough arrow from the note to the person */
  arrow?: { plan: DrawPlan; start: number; end: number } }
interface Badge { t0: number; t1: number; ok: boolean }

export interface ActModel {
  W: number; H: number; portrait: boolean; scale: number;
  /** screen position of the camera centre and where the ground sits at zoom 1 */
  SX: number; SY: number; groundY: number;
  actors: Actor[]; props: PropS[]; hand: HandTask[]; cams: CamKey[]; bubbles: Bubble[]; marks: Mark[]; texts: Txt[]; badges: Badge[];
  cues: ActCue[]; duration: number; font: string; hand2: string;
  /** auto-added micro actions (pacing) */
  filled: number;
  measure?: Ctx;
  env?: Env; dpr: number;
  /** logical px per peeps unit */
  peepScale: number;
}

const GESTURE: Record<string, number> = { wave: 1.6, point: 1.4, nod: 1.1, shake: 1.2, surprised: 0.9, celebrate: 1.8, cheer: 1.8, laugh: 1.6, shrug: 1.3, handshake: 1.8, clap: 1.4, bow: 1.2, facepalm: 1.4, give: 1.4, reach: 1.2, 'look-around': 1.6 };
const BLEND = 0.28;

export function resolveWhen(w: When | undefined, sceneStart: number, lines: { start: number; end: number }[], sceneEnd: number, fallback: number): number {
  if (w == null || w === '') return fallback;
  if (typeof w === 'number') return sceneStart + w;
  const m = /^L(\d+)(e|@([\d.]+))?([+-][\d.]+)?$/.exec(String(w).trim());
  if (m) {
    const L = lines[Math.min(Number(m[1]), lines.length - 1)] || { start: sceneStart, end: sceneEnd };
    let t = m[2] === 'e' ? L.end : m[3] ? L.start + Number(m[3]) * (L.end - L.start) : L.start;
    if (m[4]) t += Number(m[4]);
    return t;
  }
  const e = /^end([+-][\d.]+)?$/.exec(String(w).trim());
  if (e) return sceneEnd + Number(e[1] || 0);
  const n = Number(w);
  return Number.isFinite(n) ? sceneStart + n : fallback;
}

const lookOf = (c: ActCast | undefined, i: number): CharLook => {
  const presets = Object.values(LOOKS);
  if (!c) return presets[i % presets.length];
  if (typeof c.look === 'string') return LOOKS[c.look] || presets[i % presets.length];
  return { ...presets[i % presets.length], ...c.look };
};

export function buildAct(opts: { project: { ratio: Ratio; cast?: ActCast[]; scenes: SceneSpec[]; figures?: 'peeps' | 'rig' }; timeline: Timeline; font: string; hand: string; measure?: Ctx; env?: Env; dpr?: number }): ActModel {
  const { project, timeline } = opts, portrait = project.ratio === '9:16';
  const W = portrait ? 540 : 960, H = portrait ? 960 : 540;
  const scale = portrait ? 1.6 : 1.12;
  const SX = portrait ? 258 : 480, SY = portrait ? 440 : 262, groundY = portrait ? 772 : 478;
  const stageW = portrait ? 600 : 1000;
  const m: ActModel = { W, H, portrait, scale, SX, SY, groundY, actors: [], props: [], hand: [], cams: [], bubbles: [], marks: [], texts: [], badges: [], cues: [], duration: timeline.duration, font: opts.font, hand2: opts.hand, filled: 0, measure: opts.measure, env: opts.env, dpr: opts.dpr || 1, peepScale: (BODY_HEIGHT * scale) / FRAME.height.standing * 1.05 };
  // hand-drawn people (Open Peeps) whenever the artwork is loaded; 'rig' keeps the vector figures
  const usePeeps = project.figures !== 'rig' && hasPeeps() && !!opts.env;
  const castSpec = project.cast || [];
  const actors = new Map<string, Actor>();
  const actor = (id: string): Actor => {
    let a = actors.get(id);
    if (!a) {
      const i = actors.size, c = castSpec.find((x) => x.id === id);
      a = { id, look: lookOf(c, castSpec.indexOf(c!) >= 0 ? castSpec.indexOf(c!) : i), seed: i * 7 + 3, x0: 0, visibleFrom: Infinity, moves: [], body: [], emos: [], faces: [], talks: [], holds: [] };
      if (usePeeps) { const key = typeof c?.look === 'string' ? c.look : ''; a.peep = PEEP_LOOKS[key] || Object.values(PEEP_LOOKS)[i % Object.keys(PEEP_LOOKS).length]; }
      actors.set(id, a); m.actors.push(a);
    }
    return a;
  };
  const camY0 = -(groundY - SY);
  const xAt = (a: Actor, t: number) => {
    let x = a.x0;
    for (const mv of a.moves) { if (t < mv.t0) break; x = t >= mv.t1 ? mv.x1 : lerp(mv.x0, mv.x1, (t - mv.t0) / (mv.t1 - mv.t0 || 1)); }
    return x;
  };
  const lastMoveEnd = (a: Actor) => a.moves.length ? a.moves[a.moves.length - 1].t1 : -Infinity;
  const walkTo = (a: Actor, t0: number, x1: number, run = false, dur?: number) => {
    const x0 = xAt(a, t0), d = Math.abs(x1 - x0);
    if (d < 2) return t0;
    const speed = (run ? 260 : 125) * scale;
    const t1 = t0 + (dur ?? Math.max(0.5, d / speed));
    a.moves.push({ t0, t1, x0, x1, run });
    a.faces.push({ t: t0, f: x1 > x0 ? 1 : -1 });
    // footsteps on each contact
    const stride = 2 * 50 * Math.sin(run ? 0.7 : 0.42) * scale;
    for (let s = stride; s < d; s += stride) m.cues.push({ t: t0 + (s / d) * (t1 - t0), k: 'step', v: run ? 1 : 0.7 });
    return t1;
  };
  const camKey = (t: number, dur: number, x: number, y: number, z: number) => m.cams.push({ t, dur, x, y, z });
  const sceneFrame = (sc: ActScene, X: number, ids: string[], t: number, kind?: string) => {
    // no cast given: everyone standing on this stage
    if (!ids.length || (kind === 'two' && ids.length < 2)) ids = m.actors.filter((a) => Math.abs(xAt(a, t) - X) < stageW * 0.55).map((a) => a.id);
    const xs = ids.map((id) => actors.get(id)).filter(Boolean).map((a) => xAt(a!, t));
    const mode = kind || sc.cam || (xs.length >= 2 ? 'two' : xs.length === 1 ? 'two' : 'wide');
    // the ground stays low on the screen whatever the zoom, so people fill the frame
    const anchored = (z: number) => -(groundY + (portrait ? 18 : 6) - SY) / z;
    if (mode === 'wide' || !xs.length) { const z = portrait ? 0.9 : 0.92; return { x: X, y: anchored(z), z }; }
    const lo = Math.min(...xs), hi = Math.max(...xs), cx = (lo + hi) / 2;
    if (mode === 'close') return { x: cx, y: -(BODY_HEIGHT * scale * 0.72), z: 1.55 };
    const span = hi - lo + 150 * scale;
    const z = clamp((portrait ? 500 : 780) / span, 0.88, 1.3);
    return { x: cx, y: anchored(z), z };
  };

  let X = 0, prevSet = '', handFree = 0, styleN = 0;
  const focusOf = (sc: ActScene | undefined) => sc?.cast?.[0]?.id || sc?.beats?.find((b) => b.who)?.who;
  project.scenes.forEach((S, si) => {
    const sc: ActScene = (S as any).act || {};
    const T = timeline.scenes[si];
    const t0 = T.start, tEnd = T.end;
    const lines = T.lines;
    const set = sc.set || prevSet || 'blank';
    const newStage = si > 0 && set !== prevSet;
    let tr = sc.transition || (si === 0 ? 'draw' : newStage ? 'pan' : 'draw');
    if (newStage && (tr === 'draw' || tr === 'morph')) tr = 'pan';
    if (newStage) X += stageW;
    const trDur = tr === 'pan' ? 0.9 : tr === 'walk' ? 1.4 : tr === 'match' ? 0.5 : 0;
    const ready = t0 + trDur;
    if (tr === 'pan' || tr === 'walk' || tr === 'cut' || tr === 'match') m.cues.push({ t: t0 - (tr === 'match' ? 0.3 : 0), k: 'whoosh' });

    // set props of a new place: on the paper already (visible while the camera travels) unless drawn
    const drawList = sc.draw || (si === 0 ? ['set', ...(sc.cast || []).map((c) => c.id)] : []);
    if (si === 0 || newStage) {
      for (const [k, p] of (SETS[set] || SETS.blank).entries()) {
        const s = (p.s ?? 1) * (p.kind === 'ground' ? 1 : scale * 0.85);
        m.props.push({ id: `set${si}-${k}`, kind: p.kind, prims: place(propPrims(p.kind, si * 50 + k * 7), X + p.x * (portrait ? 1 : 1.6), p.y ?? 0, s), appear: drawList.includes('set') ? Infinity : t0 - (newStage ? trDur : 0) });
      }
    }
    for (const [k, p] of (sc.props || []).entries()) {
      const id = p.id || `p${si}-${k}`;
      m.props.push({ id, kind: p.kind, prims: place(propPrims(p.kind, si * 90 + k * 11), X + p.x * (portrait ? 1 : 1.6), p.y ?? 0, (p.s ?? 1) * scale), appear: drawList.includes(id) ? Infinity : t0 });
    }

    // camera: travel to this scene's framing
    const castIds = (sc.cast || []).map((c) => c.id);
    if (tr === 'match' && si > 0) {
      const fa = actors.get(focusOf(sc) || focusOf((project.scenes[si - 1] as any).act) || '');
      if (fa) {
        const hx = xAt(fa, t0 - 0.36);
        camKey(t0 - 0.36, 0.36, hx, -(BODY_HEIGHT * scale * 0.86), 3.2);
      }
    }

    // people: placement, entrances, walking from the previous place
    let lastEnter = ready;
    for (const c of sc.cast || []) {
      const a = actor(c.id), x = X + c.x * (portrait ? 1 : 1.6);
      if (c.emo) a.emos.push({ t: t0, e: c.emo });
      if (a.visibleFrom === Infinity) {
        if (c.enter) {
          a.x0 = X + (c.enter === 'left' ? -1 : 1) * (W / 2 + 120) / (portrait ? 1 : 1);
          a.visibleFrom = ready;
          lastEnter = Math.max(lastEnter, walkTo(a, ready, x));
        } else if (drawList.includes(c.id)) { a.x0 = x; }
        else { a.x0 = x; a.visibleFrom = t0; }
      } else {
        const from = xAt(a, t0);
        if (Math.abs(from - x) > 2) {
          if (tr === 'cut' || tr === 'match') a.moves.push({ t0, t1: t0 + 0.001, x0: from, x1: x, run: false });
          else lastEnter = Math.max(lastEnter, walkTo(a, t0, x, false, tr === 'pan' || tr === 'walk' ? Math.max(trDur, Math.abs(x - from) / (300 * scale)) : undefined));
        }
      }
      if (c.do) a.body.push({ t0: t0, t1: Infinity, do: c.do, hold: true });
      if (c.face != null) a.faces.push({ t: Math.max(t0, lastMoveEnd(a)), f: c.face < 0 ? -1 : 1 });
    }
    const frame = sceneFrame(sc, X, castIds, lastEnter);
    if (tr === 'match' && si > 0) {
      const fa = actors.get(focusOf(sc) || '');
      const hx = fa ? xAt(fa, t0) : frame.x;
      camKey(t0, 0, hx, -(BODY_HEIGHT * scale * 0.86), 3.2);
      camKey(t0 + 0.02, 0.55, frame.x, frame.y, frame.z);
    } else if (tr === 'walk') {
      camKey(t0, Math.max(trDur, lastEnter - t0), frame.x, frame.y, frame.z);
    } else camKey(t0, si === 0 ? 0 : tr === 'cut' ? 0 : Math.max(0.6, trDur), frame.x, frame.y, frame.z);

    // morph: an object of the previous scene turns into another
    if (sc.morph) {
      const src = [...m.props].reverse().find((p) => p.id === sc.morph!.from || p.kind === sc.morph!.from);
      if (src) {
        const bx = src.prims.flatMap((p) => p.d), cx = bx.reduce((a, p) => a + p[0], 0) / bx.length, by = Math.max(...bx.map((p) => p[1]));
        src.morph = { t0: Math.max(t0, ready), t1: Math.max(t0, ready) + 0.7, to: place(propPrims(sc.morph.to, si * 13), cx, by, scale) };
        m.cues.push({ t: src.morph.t0, k: 'swish' });
      }
    }

    // the hand draws, in order, what the scene asks
    let ht = Math.max(ready, handFree + (handFree > t0 - 1 ? 0.2 : 0.5));
    const span = tEnd - ht;
    const tasks: { id: string; plan: DrawPlan; speed: number; min: number; max: number; target: Actor | PropS[] }[] = [];
    for (const id of drawList) {
      if (id === 'set') {
        const ps = m.props.filter((p) => p.id.startsWith(`set${si}-`) && p.kind !== 'ground');
        if (ps.length) tasks.push({ id, plan: drawPlan(ps.flatMap((p) => p.prims)), speed: 2000, min: 0.8, max: 2.4, target: ps });
        for (const p of m.props) if (p.id.startsWith(`set${si}-`) && p.kind === 'ground') p.appear = ht;
        continue;
      }
      const a = actors.get(id);
      if (a && a.peep) {
        // a peeps person: the hand draws the picture along its own strokes
        const st = bodyAt(a, ht), [g, pose] = poseOf(actionAt(a, ht).do, a.peep), pic = peepPicture(m.env!, a.peep, g, pose, 'Calm', m.peepScale, m.dpr);
        if (pic) {
          const R0 = makeReveal(m.env!, pic.canvas, pic.w, pic.h, m.dpr, undefined, { dark: true });
          const len = R0.plan ? R0.plan.total : pic.w * 6;
          a.reveal = { R: R0, pic, flip: st.f, x: xAt(a, ht) };
          tasks.push({ id, plan: { prims: [], lens: [], starts: [], travel: [], total: len } as any, speed: HAND_SPEED, min: 1.4, max: 3.6, target: a });
        }
        continue;
      }
      if (a) {
        const st = bodyAt(a, ht), prims = place(characterPrims(a.look, st.pose, emotionFace(st.emo, ht, false, a.seed), st.f, st.yaw, a.seed), xAt(a, ht), 0, scale);
        tasks.push({ id, plan: drawPlan(prims), speed: HAND_SPEED, min: 1.4, max: 3.6, target: a });
        continue;
      }
      const ps = m.props.filter((p) => p.id === id);
      if (ps.length) tasks.push({ id, plan: drawPlan(ps.flatMap((p) => p.prims)), speed: HAND_SPEED * 1.1, min: 0.5, max: 2.2, target: ps });
    }
    let need = tasks.reduce((s, k) => s + clamp(k.plan.total / k.speed, k.min, k.max), 0);
    const room = Math.max(0.8, span * 0.65);
    const squeeze = need > room ? room / need : 1;
    for (const k of tasks) {
      const d = clamp(k.plan.total / k.speed, k.min, k.max) * squeeze, start = ht, end = ht + d;
      const P = k.plan;
      const rv = !Array.isArray(k.target) ? k.target.reveal : undefined;
      if (rv) {
        // pace the picture to its time, then the nib follows the reveal (mirrored when facing left)
        if (rv.R.plan) { const f = pace(rv.R.plan, d); rv.R.plan = f.plan; rv.R.share = f.share; }
        const { pic, flip, x } = rv;
        m.hand.push({ start, end, space: 'world', pen: (q) => { const p = revealPen(rv.R, q); return { x: x + (p.x - pic.ax) * flip, y: p.y - pic.ay, lift: p.lift }; } });
        for (const [a, b] of rv.R.plan ? strokeSpansOf(rv.R) : [[0, 1]]) m.cues.push({ t: start + a * d, k: 'scribble', d: Math.max(0.05, (b - a) * d) });
        const who = k.target as Actor; who.draw = { start, end, plan: P }; who.visibleFrom = start;
        ht = end + 0.12;
        continue;
      }
      m.hand.push({ start, end, space: 'world', pen: (q) => planAt(P, q) });
      // the pen sounds stroke by stroke, silent while it travels to the next one
      let run: [number, number] | null = null;
      P.prims.forEach((_, i) => {
        const a = start + (P.starts[i] / P.total) * d, b = start + ((P.starts[i] + P.lens[i]) / P.total) * d;
        if (run && a - run[1] < 0.06) run[1] = b; else { if (run) m.cues.push({ t: run[0], k: 'scribble', d: run[1] - run[0] }); run = [a, b]; }
      });
      if (run) m.cues.push({ t: run[0], k: 'scribble', d: (run as [number, number])[1] - (run as [number, number])[0] });
      if (Array.isArray(k.target)) for (const p of k.target) { p.draw = { start, end, plan: P }; p.appear = start; }
      else { k.target.draw = { start, end, plan: P }; k.target.visibleFrom = start; }
      ht = end + 0.12;
    }
    if (tasks.length) handFree = ht;
    void need;

    // beats
    const actorReady = (a: Actor) => Math.max(ready, a.draw ? a.draw.end + 0.15 : -Infinity, a.visibleFrom === Infinity ? ready : a.visibleFrom, lastMoveEnd(a) > t0 ? lastMoveEnd(a) : -Infinity);
    for (const b of sc.beats || []) {
      const a = b.who ? actor(b.who) : undefined;
      let t = resolveWhen(b.at, t0, lines, tEnd, a ? actorReady(a) : ready);
      if (a) {
        if (a.visibleFrom === Infinity) { a.x0 = X; a.visibleFrom = t; }
        t = Math.max(t, a.draw ? a.draw.end + 0.1 : -Infinity);
        if (b.emo) a.emos.push({ t, e: b.emo });
        if (b.hold !== undefined) a.holds.push({ t, kind: b.hold });
        if (b.do === 'walk' || b.do === 'run') {
          let x1 = typeof b.to === 'number' ? X + b.to * (portrait ? 1 : 1.6) : xAt(a, t);
          if (typeof b.to === 'string' && actors.get(b.to)) { const o = actors.get(b.to)!, ox = xAt(o, Math.max(t, lastMoveEnd(o))), here = xAt(a, t); x1 = ox + (here < ox ? -1 : 1) * 118 * scale; }
          const end = walkTo(a, t, x1, b.do === 'run', b.dur);
          // after walking up to someone, face them
          if (typeof b.to === 'string' && actors.get(b.to)) { const o = actors.get(b.to)!; a.faces.push({ t: end, f: xAt(o, end) > x1 ? 1 : -1 }); o.faces.push({ t: end - 0.3, f: x1 > xAt(o, end) ? 1 : -1 }); }
        } else if (b.do) {
          const g = GESTURE[b.do];
          const dur = b.dur ?? g ?? Infinity;
          a.body.push({ t0: t, t1: g || b.dur ? t + dur : Infinity, do: b.do, hold: !(g || b.dur) });
          if (b.do === 'wave' || b.do === 'point' || b.do === 'handshake') m.cues.push({ t: t + 0.05, k: 'swish', v: 0.6 });
          if (b.do === 'clap') for (let k = 0; k < 4; k++) m.cues.push({ t: t + 0.1 + k * 0.42, k: 'tap' });
        }
        if (b.face != null) {
          const f = typeof b.face === 'string' ? (actors.get(b.face) ? (xAt(actors.get(b.face)!, t) > xAt(a, t) ? 1 : -1) : 1) : b.face < 0 ? -1 : 1;
          a.faces.push({ t, f });
        }
        if (b.say || b.think) {
          const text = (b.say || b.think)!;
          const d = b.dur && !b.do ? b.dur : Math.max(1.4, Math.min(3.6, text.split(/\s+/).length * 0.36 + 0.6));
          m.bubbles.push({ who: a.id, t0: t, t1: t + d, text, think: !b.say });
          if (b.say) { a.talks.push({ t0: t + 0.1, t1: t + d - 0.2 }); if (!b.do) a.body.push({ t0: t, t1: t + d, do: a.look.size && a.look.size < 0.9 ? 'talk' : 'talk', hold: false }); }
          m.cues.push({ t, k: 'pop', v: 0.6 });
        }
        if (b.mark) { m.marks.push({ who: a.id, t0: t, t1: t + 1.8, kind: b.mark }); m.cues.push({ t, k: b.mark === 'cross' ? 'buzz' : b.mark === 'check' || b.mark === 'star' || b.mark === 'bulb' ? 'ding' : 'pop' }); }
        if (b.cam) {
          const f2 = sceneFrame(sc, X, b.cam === 'close' ? [a.id] : castIds, t, b.cam);
          camKey(t, 0.6, f2.x, f2.y, f2.z);
        }
      } else if (b.cam) {
        const f2 = sceneFrame(sc, X, castIds, t, b.cam);
        camKey(t, 0.6, f2.x, f2.y, f2.z);
      }
      if (b.sfx && /^(whoosh|pop|msg|tick|ding|scribble|step|buzz|swish|tap)$/.test(b.sfx)) m.cues.push({ t, k: b.sfx as ActSfx });
    }

    // text: stamps, figures, labels; the conclusion is written by the hand
    for (const tx of sc.text || []) {
      const kind = tx.kind || 'stamp';
      let t = resolveWhen(tx.at, t0, lines, tEnd, ready + 0.3);
      const t1 = tx.dur ? t + tx.dur : si === project.scenes.length - 1 ? timeline.duration + 1 : tEnd - 0.15;
      if (kind === 'big' || kind === 'note') {
        t = Math.max(t, handFree + 0.3);
        const box = bigTextBox(m, tx.text, kind === 'note');
        const pic = m.env ? textPicture(m, box) : null;
        let d = Math.max(1.0, Math.min(2.6, tx.text.length * 0.07));
        const T: Txt = { t0: t, t1, text: tx.text, kind, who: tx.who, style: styleN, scene: si };
        if (pic) {
          // handwriting: the words' own centre lines, written by the hand at a writing pace
          // every mark of the words is written (accents included), in reading order
          const R = makeReveal(m.env!, pic.canvas, pic.w, pic.h, m.dpr, undefined, { minLen: 1.5, reading: box.lh });
          d = clamp((R.plan?.total || 600) / (HAND_SPEED * 1.3), 1.0, 3.6);
          let ox = box.x - pic.w / 2, oy = box.y - box.size * 1.05, space: 'world' | 'screen' = 'screen';
          const who = tx.who && actors.get(tx.who);
          if (kind === 'note' && who) {
            // a note beside the person, above the head, on the side with more room
            // on the side away from the other people (bubbles live over their heads), kept on the stage
            const hx = xAt(who, t), others = m.actors.filter((o) => o !== who && o.visibleFrom <= t).map((o) => xAt(o, t));
            const side = others.length ? (others.reduce((a2, v) => a2 + v, 0) / others.length < hx ? 1 : -1) : hx - X > 0 ? -1 : 1;
            ox = hx + side * 40 * scale - (side < 0 ? pic.w : 0);
            ox = Math.max(X - (portrait ? 255 : 450), Math.min(X + (portrait ? 230 : 450) - pic.w, ox));
            oy = -BODY_HEIGHT * scale * 1.3 - pic.h; space = 'world';
            const from: Pt = [ox + (side < 0 ? pic.w * 0.85 : pic.w * 0.15), oy + pic.h + 6], to: Pt = [hx + side * 22 * scale, -BODY_HEIGHT * scale * 1.05];
            const plan = drawPlan(roughArrow(from, to, si * 31 + 7, '#e0453a', 3));
            T.arrow = { plan, start: t + d + 0.05, end: t + d + 0.55 };
          }
          T.rv = { R, x: ox, y: oy, start: t, end: t + d };
          const sp = space;
          m.hand.push({ start: t, end: t + d, space: sp, pen: (q) => { const p = revealPen(R, q); return { x: ox + p.x, y: oy + p.y, lift: p.lift }; } });
          if (T.arrow) { const A = T.arrow; m.hand.push({ start: A.start, end: A.end, space: 'world', pen: (q) => planAt(A.plan, q) }); }
          for (const [a, b] of R.plan ? strokeSpansOf(R) : [[0, 1]]) m.cues.push({ t: t + a * d, k: 'scribble', d: Math.max(0.05, (b - a) * d) });
        } else {
          const bx = box;
          m.hand.push({ start: t, end: t + d, space: 'screen', pen: (q) => writePen(bx, q) });
          m.cues.push({ t, k: 'scribble', d });
        }
        T.t1 = Math.max(t1, t + d + (T.arrow ? 1.4 : 0.8));
        m.texts.push(T);
        handFree = t + d + (T.arrow ? 0.7 : 0.15);
      } else {
        m.texts.push({ t0: t, t1, text: tx.text, kind, who: tx.who, style: styleN++ % 3, scene: si });
        m.cues.push({ t, k: 'pop', v: 0.8 });
      }
    }
    if (sc.badge) { const t = ready + 0.05; m.badges.push({ t0: t, t1: si === project.scenes.length - 1 ? timeline.duration + 1 : tEnd - 0.1, ok: sc.badge === 'right' }); m.cues.push({ t, k: sc.badge === 'right' ? 'ding' : 'buzz' }); }
    prevSet = set;
  });

  // pacing: no stretch longer than ~3.5 s without a new visual event
  m.filled = fillPacing(m, timeline);
  m.cams.sort((a, b) => a.t - b.t);
  for (const a of m.actors) { a.body.sort((p, q) => p.t0 - q.t0); a.faces.sort((p, q) => p.t - q.t); a.emos.sort((p, q) => p.t - q.t); a.moves.sort((p, q) => p.t0 - q.t0); }
  let cur = { x: m.cams[0]?.x ?? 0, y: m.cams[0]?.y ?? camY0, z: m.cams[0]?.z ?? 1 };
  for (const k of m.cams) { k.from = camAtKeys(m.cams, k.t, cur); cur = { x: k.x, y: k.y, z: k.z }; }
  m.hand.sort((a, b) => a.start - b.start);
  // dialogue alternates: a bubble closes when the next one opens
  m.bubbles.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < m.bubbles.length; i++) if (m.bubbles[i + 1].t0 < m.bubbles[i].t1) m.bubbles[i].t1 = Math.max(m.bubbles[i].t0 + 0.6, m.bubbles[i + 1].t0 - 0.05);
  for (const a of m.actors) for (const tk of a.talks) { const b = m.bubbles.find((x) => x.who === a.id && Math.abs(x.t0 - (tk.t0 - 0.1)) < 0.01); if (b) tk.t1 = Math.min(tk.t1, b.t1 - 0.1); }
  m.cues.sort((a, b) => a.t - b.t);
  return m;

  // ---- state of a person at time t (closure over the model under construction)
  function bodyAt(a: Actor, t: number) { return actorState(m, a, t); }
}

function camAtKeys(keys: CamKey[], t: number, start: { x: number; y: number; z: number }) {
  let v = start;
  for (const k of keys) {
    if (k.t > t) break;
    const from = k.from || v, u = k.dur <= 0 ? 1 : ease((t - k.t) / k.dur);
    v = { x: lerp(from.x, k.x, u), y: lerp(from.y, k.y, u), z: lerp(from.z, k.z, u) };
  }
  return v;
}
export function cameraAt(m: ActModel, t: number) {
  let v = { x: m.cams[0]?.x ?? 0, y: m.cams[0]?.y ?? -(m.groundY - m.SY), z: m.cams[0]?.z ?? 1 };
  for (const k of m.cams) {
    if (k.t > t) break;
    const u = k.dur <= 0 ? 1 : ease((t - k.t) / k.dur), from = k.from || v;
    v = { x: lerp(from.x, k.x, u), y: lerp(from.y, k.y, u), z: lerp(from.z, k.z, u) };
  }
  return v;
}

function fillPacing(m: ActModel, timeline: Timeline) {
  let added = 0;
  const events: number[] = [];
  for (const a of m.actors) { a.body.forEach((b) => events.push(b.t0)); a.moves.forEach((v) => events.push(v.t0, v.t1)); a.emos.forEach((e) => events.push(e.t)); a.talks.forEach((s) => events.push(s.t0)); }
  m.hand.forEach((h) => events.push(h.start, h.end)); m.texts.forEach((x) => events.push(x.t0)); m.marks.forEach((x) => events.push(x.t0)); m.bubbles.forEach((x) => events.push(x.t0)); m.cams.forEach((c) => events.push(c.t));
  timeline.scenes.forEach((S) => events.push(S.start));
  events.sort((a, b) => a - b);
  const micro = ['nod', 'look-around', 'shrug', 'nod'];
  for (let i = 1; i < events.length; i++) {
    const gap = events[i] - events[i - 1];
    if (gap <= 3.5) continue;
    const t = events[i - 1] + gap / 2 - 0.6;
    const live = m.actors.filter((a) => a.visibleFrom <= t && !a.moves.some((v) => t >= v.t0 - 0.3 && t <= v.t1 + 0.3));
    if (!live.length) continue;
    const a = live[Math.floor(hash(Math.round(t * 10)) * live.length)];
    const k = micro[added % micro.length];
    a.body.push({ t0: t, t1: t + 1.2, do: k, hold: false });
    added++;
  }
  return added;
}

// ---------------------------------------------------------------- state at time t
/** What the person is doing at t (walking, a gesture, or the held action) and since when. */
export function actionAt(a: Actor, t: number): { do: string; t0: number; t1: number; run?: boolean; dist?: number } {
  for (const mv of a.moves) if (t >= mv.t0 && t <= mv.t1 && mv.t1 - mv.t0 > 0.01) return { do: mv.run ? 'run' : 'walk', t0: mv.t0, t1: mv.t1, run: mv.run, dist: Math.abs(lerp(mv.x0, mv.x1, (t - mv.t0) / (mv.t1 - mv.t0)) - mv.x0) };
  let held: BodyEv | null = null, gest: BodyEv | null = null;
  for (const b of a.body) { if (b.t0 > t) break; if (b.hold) { held = b; gest = null; } else if (t < b.t1) gest = b; else if (gest === b) gest = null; }
  const ev = gest || held;
  return ev ? { do: ev.do, t0: ev.t0, t1: ev.t1 } : { do: 'idle', t0: 0, t1: Infinity };
}
const TAU = Math.PI * 2;
export function actorState(m: ActModel, a: Actor, t: number) {
  // emotion
  let emo: Emotion = 'neutral';
  for (const e of a.emos) { if (e.t > t) break; emo = e.e; }
  // facing and turning
  let f = 1, prevF = 1, ft = -Infinity;
  for (const e of a.faces) { if (e.t > t) break; if (e.f !== f) { prevF = f; ft = e.t; } f = e.f; }
  const turn = ease((t - ft) / 0.32);
  const yaw = lerp(prevF * 0.5, f * 0.5, turn);
  const facing = yaw >= 0 ? 1 : -1;
  // body: walking, else the latest action (gestures return to the held state)
  const poseAt = (tt: number): Pose => {
    for (const mv of a.moves) {
      if (tt >= mv.t0 && tt <= mv.t1 && mv.t1 - mv.t0 > 0.01) {
        const dist = Math.abs(lerp(mv.x0, mv.x1, (tt - mv.t0) / (mv.t1 - mv.t0)) - mv.x0);
        const stride = 2 * 50 * Math.sin(mv.run ? 0.7 : 0.42) * m.scale;
        const ev: any = { do: mv.run ? 'run' : 'walk', t0: mv.t0, t1: mv.t1, phase: (dist / stride) * Math.PI };
        return actionPose(ev, tt - mv.t0, a.seed, facing);
      }
    }
    let held: BodyEv | null = null, gest: BodyEv | null = null;
    for (const b of a.body) { if (b.t0 > tt) break; if (b.hold) { held = b; gest = null; } else if (tt < b.t1) gest = b; else if (gest === b) gest = null; }
    const ev = gest || held;
    if (!ev) return actionPose({ do: 'idle', t0: 0, t1: 1 }, tt, a.seed, facing);
    return actionPose({ do: ev.do, t0: ev.t0, t1: ev.t1 === Infinity ? ev.t0 + 4 : ev.t1, k: ev.k }, tt - ev.t0, a.seed, facing);
  };
  // last change of action before t, for blending
  let change = -Infinity;
  for (const mv of a.moves) { if (mv.t0 <= t) change = Math.max(change, mv.t0); if (mv.t1 <= t) change = Math.max(change, mv.t1); }
  for (const b of a.body) { if (b.t0 <= t) change = Math.max(change, b.t0); if (b.t1 !== Infinity && b.t1 <= t) change = Math.max(change, b.t1); }
  let pose = poseAt(t);
  if (t - change < BLEND && change > -Infinity) pose = mixPose(poseAt(change - 0.001), pose, ease((t - change) / BLEND));
  pose = emotionPosture(emo, pose);
  // face: actions that carry an expression
  const doing = a.body.filter((b) => b.t0 <= t && (b.hold || t < b.t1)).pop()?.do;
  const faceEmo: Emotion = doing === 'laugh' ? 'laugh' : doing === 'surprised' && t - (a.body.find((b) => b.do === 'surprised' && b.t0 <= t)?.t0 ?? 0) < 1 ? 'surprised' : doing === 'celebrate' || doing === 'cheer' ? 'laugh' : emo;
  const talking = a.talks.some((s) => t >= s.t0 && t <= s.t1);
  let hold: string | null = null;
  for (const h of a.holds) { if (h.t > t) break; hold = h.kind; }
  return { pose, emo: faceEmo, f: facing, yaw, talking, hold };
}

export function actorPrims(m: ActModel, a: Actor, t: number): Prim[] {
  const st = actorState(m, a, t), x = actorX(a, t);
  const face = emotionFace(st.emo, t, st.talking, a.seed);
  // boiling lines: the wobble changes 6 times a second, like a drawn animation
  const boil = Math.floor(t * 6) % 3;
  let prims = place(characterPrims(a.look, st.pose, face, st.f, st.yaw, a.seed + boil * 1000, 0.7), x, 0, m.scale);
  if (st.hold) {
    const [hx, hy] = handPoint(st.pose, st.f, st.yaw);
    prims = prims.concat(place(propPrims(st.hold, 5), x + hx * m.scale, hy * m.scale + 8 * m.scale, m.scale * 0.8).map((p) => ({ ...p, z: 3.6 })));
  }
  return prims;
}
export function actorX(a: Actor, t: number) {
  let x = a.x0;
  for (const mv of a.moves) { if (t < mv.t0) break; x = t >= mv.t1 ? mv.x1 : lerp(mv.x0, mv.x1, (t - mv.t0) / (mv.t1 - mv.t0 || 1)); }
  return x;
}
function headWorld(m: ActModel, a: Actor, t: number): Pt {
  if (a.peep) {
    const pic = peepNow(m, a, t);
    if (pic) { const f = actorState(m, a, t).f; return [actorX(a, t) + (pic.head[0] - pic.ax) * f, pic.head[1] - pic.ay - pic.h * 0.12]; }
  }
  const st = actorState(m, a, t), [hx, hy] = headPoint(st.pose, st.f, st.yaw);
  return [actorX(a, t) + hx * m.scale, hy * m.scale];
}

// ---------------------------------------------------------------- big handwritten text
interface TextBox { x: number; y: number; w: number; lines: string[]; size: number; lh: number; widths: number[] }
function bigTextBox(m: ActModel, text: string, note = false): TextBox {
  const size = note ? (m.portrait ? 30 : 28) : m.portrait ? 42 : 38, maxW = note ? (m.portrait ? 230 : 300) : m.portrait ? 430 : 760;
  const c = m.measure;
  if (c) c.font = `${size}px ${m.hand2}`;
  const width = (s: string) => (c ? c.measureText(s).width : s.length * size * 0.5);
  const words = text.split(/\s+/), lines: string[] = [];
  let cur = '';
  for (const w of words) { const next = cur ? cur + ' ' + w : w; if (width(next) > maxW && cur) { lines.push(cur); cur = w; } else cur = next; }
  if (cur) lines.push(cur);
  const lh = size * 1.25, y = m.portrait ? 196 : 110;
  return { x: m.portrait ? 258 : 480, y, w: maxW, lines, size, lh, widths: lines.map(width) };
}
/** The words as a picture (handwriting font, ink on transparency), to be written stroke by stroke. */
function textPicture(m: ActModel, b: TextBox) {
  const pad = 8, w = Math.max(...b.widths) + pad * 2, h = b.lines.length * b.lh + pad;
  const cv = m.env!.createCanvas(Math.ceil(w * m.dpr), Math.ceil(h * m.dpr)), c = cv.getContext('2d');
  c.scale(m.dpr, m.dpr); c.font = `${b.size}px ${m.hand2}`; c.fillStyle = '#22252b'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  b.lines.forEach((l, i) => c.fillText(l, w / 2, b.size * 1.0 + i * b.lh));
  return { canvas: cv, w, h };
}
function strokeSpansOf(R: Reveal): [number, number][] {
  const P = R.plan!, out: [number, number][] = [];
  P.strokes.forEach((s, i) => { const L = P.cums[i][P.cums[i].length - 1] * P.rates[i]; const a = (P.starts[i] / P.total) * R.share, b = ((P.starts[i] + L) / P.total) * R.share; const last = out[out.length - 1]; if (last && a - last[1] < 0.02) last[1] = b; else out.push([a, b]); });
  return out;
}
function writePen(b: TextBox, q: number) {
  const total = b.lines.reduce((s, l) => s + l.length, 0) || 1;
  let c = q * total, li = 0;
  while (li < b.lines.length - 1 && c > b.lines[li].length) { c -= b.lines[li].length; li++; }
  const L = b.lines[li], wpx = b.widths[li], u = clamp(c / (L.length || 1));
  const x = b.x - wpx / 2 + wpx * u, y = b.y + li * b.lh - b.size * 0.32 + Math.sin(u * L.length * 2.2) * b.size * 0.2;
  return { x, y, lift: 0 };
}

// ---------------------------------------------------------------- drawing a frame
const PAPER = '#fbfaf6';

export function renderAct(c: Ctx, m: ActModel, t: number, drawHandFn?: (x: number, y: number, lift: number, rot: number) => void) {
  const { W, H } = m;
  c.save();
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  const cam = cameraAt(m, t);
  const toScreen = (p: Pt): Pt => [(p[0] - cam.x) * cam.z + m.SX, (p[1] - cam.y) * cam.z + m.SY];
  c.save();
  c.translate(m.SX, m.SY); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
  // props (sets first, then the rest), people, marks, bubbles
  for (const p of m.props) {
    if (t < p.appear) continue;
    if (p.draw && t < p.draw.end) { if (t >= p.draw.start && p.draw.plan.prims[0] === p.prims[0]) paintPlan(c, p.draw.plan, seg(t, p.draw.start, p.draw.end)); continue; }
    if (p.morph && t >= p.morph.t0) { paint(c, morphPrims(p.prims, p.morph.to, ease(seg(t, p.morph.t0, p.morph.t1)))); continue; }
    paint(c, p.prims);
  }
  for (const a of m.actors) {
    if (t < a.visibleFrom || (a.draw && t < a.draw.end - 0.1)) continue;
    // contact shadow: keeps people on the ground
    const x = actorX(a, t), sitting = actorState(m, a, t).pose.seat > 0;
    c.save(); c.globalAlpha = 0.12; c.fillStyle = '#3a3a48'; c.beginPath(); c.ellipse(x + (sitting ? 0 : 0), 2, 46 * m.scale, 7 * m.scale, 0, 0, TAU); c.fill(); c.restore();
  }
  for (const a of m.actors) {
    if (t < a.visibleFrom) continue;
    if (a.peep) { drawPeepActor(c, m, a, t); continue; }
    if (a.draw && t < a.draw.end) { paintPlan(c, a.draw.plan, seg(t, a.draw.start, a.draw.end)); continue; }
    paint(c, actorPrims(m, a, t));
  }
  for (const k of m.marks) {
    if (t < k.t0 || t > k.t1) continue;
    const a = m.actors.find((x) => x.id === k.who)!, [hx, hy] = headWorld(m, a, t);
    const u = easeBack(seg(t, k.t0, k.t0 + 0.35)), fade = 1 - seg(t, k.t1 - 0.3, k.t1);
    const bob = Math.sin((t - k.t0) * 5) * 3;
    paint(c, place(propPrims(k.kind, 3), hx + 46 * m.scale * (a.faces.length && a.faces[a.faces.length - 1].f < 0 ? -1 : 1), hy - 50 * m.scale + bob, m.scale * 0.9 * u), fade);
  }
  // handwritten notes beside people, with a rough arrow to them
  for (const tx of m.texts) {
    if (tx.kind !== 'note' || !tx.rv || t < tx.t0 || t > tx.t1) continue;
    const fade = 1 - seg(t, tx.t1 - 0.3, tx.t1);
    drawReveal(c, m.env!, tx.rv.R, seg(t, tx.rv.start, tx.rv.end), tx.rv.x, tx.rv.y, fade);
    if (tx.arrow && t >= tx.arrow.start) { c.save(); c.globalAlpha = fade; paintPlan(c, tx.arrow.plan, seg(t, tx.arrow.start, tx.arrow.end)); c.restore(); }
  }
  c.restore();
  for (const b of m.bubbles) {
    if (t < b.t0 || t > b.t1 + 0.2) continue;
    const a = m.actors.find((x) => x.id === b.who)!;
    const [hx, hy] = headWorld(m, a, t);
    drawBubble(c, m, b, toScreen([hx, hy - 34 * m.scale]), t);
  }
  // screen space: badge, stamps, numbers, the conclusion
  for (const bd of m.badges) if (t >= bd.t0 && t <= bd.t1) drawBadge(c, m, bd, t);
  // stamps stack under the sai/đúng badge when one is shown
  let stack = m.badges.some((bd) => t >= bd.t0 && t <= bd.t1) ? 0.9 : 0;
  for (const tx of m.texts) {
    if (t < tx.t0 || t > tx.t1) continue;
    if (tx.kind === 'note') continue;
    if (tx.kind === 'big') drawBig(c, m, tx, t, m.hand.find((h) => h.space === 'screen' && Math.abs(h.start - tx.t0) < 0.01));
    else if (tx.kind === 'label' && tx.who) { const a = m.actors.find((x) => x.id === tx.who); if (a) { const p = toScreen([actorX(a, t), 30]); drawLabel(c, m, tx, p, t); } }
    else { drawStamp(c, m, tx, t, stack); stack++; }
  }
  // the hand: draws, travels lifted between nearby tasks, leaves the paper when not needed
  if (drawHandFn) {
    const h = handAt(m, t, toScreen);
    if (h) drawHandFn(h.x, h.y, h.lift, h.rot);
  }
  c.restore();
}

function handAt(m: ActModel, t: number, toScreen: (p: Pt) => Pt) {
  const off: Pt = [m.W * 1.15, m.H * 1.1];
  const tasks = m.hand;
  if (!tasks.length) return null;
  const penOf = (k: HandTask, q: number) => { const p = k.pen(q); const s = k.space === 'world' ? toScreen([p.x, p.y]) : [p.x, p.y] as Pt; return { x: s[0], y: s[1], lift: p.lift }; };
  let i = tasks.findIndex((k) => t >= k.start && t <= k.end);
  let pos: { x: number; y: number; lift: number } | null = null;
  if (i >= 0) pos = penOf(tasks[i], seg(t, tasks[i].start, tasks[i].end));
  else {
    const next = tasks.findIndex((k) => k.start > t), prev = next < 0 ? tasks.length - 1 : next - 1;
    const p = prev >= 0 ? tasks[prev] : null, n = next >= 0 ? tasks[next] : null;
    const gap = p && n ? n.start - p.end : Infinity;
    if (p && n && gap < 1.5) { const a = penOf(p, 1), b = penOf(n, 0), u = ease(seg(t, p.end, n.start)); pos = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), lift: Math.sin(Math.PI * u) }; }
    else if (n && t > n.start - 0.5) { const b = penOf(n, 0), u = ease(seg(t, n.start - 0.5, n.start)); pos = { x: lerp(off[0], b.x, u), y: lerp(off[1], b.y, u), lift: 1 - u }; }
    else if (p && t < p.end + 0.55) { const a = penOf(p, 1), u = ease(seg(t, p.end, p.end + 0.55)); pos = { x: lerp(a.x, off[0], u), y: lerp(a.y, off[1], u), lift: u }; }
  }
  if (!pos) return null;
  const rot = Math.sin(t * 2.1) * 0.02 + ((pos.x - m.W * 0.5) / m.W) * 0.16 + ((pos.y - m.H * 0.5) / m.H) * 0.05;
  return { ...pos, rot };
}

function morphPrims(a: Prim[], b: Prim[], u: number): Prim[] {
  const n = Math.max(a.length, b.length), out: Prim[] = [];
  for (let i = 0; i < n; i++) {
    const p = a[i] || a[a.length - 1], q = b[i] || b[b.length - 1];
    const N = 24, pa = resample(p.d, N, !!p.closed), pb = resample(q.d, N, !!q.closed);
    out.push({ ...(u < 0.5 ? p : q), d: pa.map((pt, k) => [lerp(pt[0], pb[k][0], u), lerp(pt[1], pb[k][1], u)] as Pt), closed: u < 0.5 ? p.closed : q.closed, w: lerp(p.w, q.w, u), alpha: (!a[i] ? u : !b[i] ? 1 - u : 1) });
  }
  return out;
}

function wrap(c: Ctx, text: string, maxW: number) {
  const out: string[] = []; let cur = '';
  for (const w of text.split(/\s+/)) { const n = cur ? cur + ' ' + w : w; if (c.measureText(n).width > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
  if (cur) out.push(cur);
  return out;
}
function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawBubble(c: Ctx, m: ActModel, b: Bubble, [hx, hy]: Pt, t: number) {
  const u = easeBack(seg(t, b.t0, b.t0 + 0.28)), fade = 1 - seg(t, b.t1, b.t1 + 0.2);
  const size = m.portrait ? 23 : 21;
  c.save();
  c.font = `${size}px ${m.font}`;
  const lines = wrap(c, b.text, m.portrait ? 250 : 300).slice(0, 3);
  const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 36, h = lines.length * size * 1.3 + 24;
  // stays inside the safe area (the right edge holds the app's buttons)
  const left = 22, right = m.W - (m.portrait ? 70 : 30);
  const bx = Math.max(left, Math.min(right - w, hx - w / 2)), by = Math.max(m.portrait ? 120 : 24, hy - 26 - h);
  const tipX = Math.max(bx + 22, Math.min(bx + w - 22, hx));
  c.globalAlpha = fade;
  c.translate(tipX, by + h); c.scale(u, u); c.translate(-tipX, -(by + h));
  c.lineWidth = 2.6; c.strokeStyle = '#22252b'; c.fillStyle = '#ffffff';
  if (b.think) {
    rrect(c, bx, by, w, h, h / 2); c.fill(); c.stroke();
    for (const [dx, dy, r] of [[-4, 12, 7], [-10, 26, 4.5]]) { c.beginPath(); c.arc(tipX + dx, by + h + dy, r, 0, TAU); c.fill(); c.stroke(); }
  } else {
    rrect(c, bx, by, w, h, 18); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(tipX - 11, by + h - 1.5); c.lineTo(tipX - 3, by + h + 18); c.lineTo(tipX + 11, by + h - 1.5); c.fill();
    c.beginPath(); c.moveTo(tipX - 11, by + h); c.lineTo(tipX - 3, by + h + 18); c.lineTo(tipX + 11, by + h); c.stroke();
  }
  c.fillStyle = '#22252b'; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, bx + w / 2, by + 12 + size * 0.65 + i * size * 1.3));
  c.restore();
}

const STAMP = [
  { bg: '#ffd23f', fg: '#1f1d1a', rot: -0.035 },
  { bg: '#22252b', fg: '#ffffff', rot: 0.025 },
  { bg: '#5b8def', fg: '#ffffff', rot: -0.02 },
];
function drawStamp(c: Ctx, m: ActModel, tx: Txt, t: number, stack: number) {
  const st = STAMP[tx.style % STAMP.length];
  const u = easeBack(seg(t, tx.t0, tx.t0 + 0.3)), fade = 1 - seg(t, tx.t1 - 0.25, tx.t1);
  const big = tx.kind === 'number';
  const size = big ? (m.portrait ? 64 : 56) : (m.portrait ? 30 : 28);
  c.save();
  c.font = `${size}px ${m.font}`;
  const shown = big ? countUp(tx.text, seg(t, tx.t0, tx.t0 + 0.9)) : tx.text;
  const w = c.measureText(tx.text).width + 40, h = size * 1.45;
  const cx = m.portrait ? 255 : 480, cy = (m.portrait ? 168 : 82) + stack * (h + 12);
  c.globalAlpha = fade;
  c.translate(cx, cy); c.rotate(st.rot); c.scale(u, u);
  if (big) { c.fillStyle = '#e0453a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(shown, 0, 2); }
  else {
    c.fillStyle = st.bg; rrect(c, -w / 2, -h / 2, w, h, 12); c.fill();
    c.fillStyle = st.fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(shown, 0, 2);
  }
  c.restore();
}
function countUp(s: string, u: number) {
  const mm = /^(\D*)(\d+)(.*)$/.exec(s);
  if (!mm) return s;
  const n = Number(mm[2]);
  return mm[1] + Math.max(Math.min(1, n), Math.round(n * ease(u))) + mm[3];
}
function drawLabel(c: Ctx, m: ActModel, tx: Txt, [x, y]: Pt, t: number) {
  const fade = seg(t, tx.t0, tx.t0 + 0.3) * (1 - seg(t, tx.t1 - 0.25, tx.t1));
  c.save(); c.globalAlpha = fade; c.font = `${m.portrait ? 22 : 20}px ${m.hand2}`; c.fillStyle = '#4b4f58'; c.textAlign = 'center'; c.fillText(tx.text, x, y); c.restore();
}
function drawBadge(c: Ctx, m: ActModel, b: Badge, t: number) {
  const u = easeBack(seg(t, b.t0, b.t0 + 0.32)), fade = 1 - seg(t, b.t1 - 0.2, b.t1);
  const label = b.ok ? '✓ NÊN LÀM' : '✗ ĐỪNG LÀM';
  c.save();
  const size = m.portrait ? 26 : 24;
  c.font = `${size}px ${m.font}`;
  const w = c.measureText(label).width + 36, h = size * 1.6, x = m.portrait ? 30 : 40, y = m.portrait ? 112 : 30;
  c.globalAlpha = fade; c.translate(x + w / 2, y + h / 2); c.rotate(b.ok ? 0.02 : -0.03); c.scale(u, u);
  c.fillStyle = b.ok ? '#2e9e5b' : '#e0453a'; rrect(c, -w / 2, -h / 2, w, h, 10); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 2);
  c.restore();
}
function drawBig(c: Ctx, m: ActModel, tx: Txt, t: number, task?: HandTask) {
  const b = bigTextBox(m, tx.text);
  const q = task ? seg(t, task.start, task.end) : 1, fade = 1 - seg(t, tx.t1 - 0.3, tx.t1);
  const total = b.lines.reduce((s, l) => s + l.length, 0) || 1;
  c.save(); c.globalAlpha = fade;
  // a soft card so the words read over the drawing
  const h = b.lines.length * b.lh + 44;
  c.fillStyle = 'rgba(251,250,246,0.97)'; rrect(c, b.x - b.w / 2 - 18, b.y - b.size - 14, b.w + 36, h, 18); c.fill();
  c.font = `${b.size}px ${m.hand2}`; c.fillStyle = '#22252b'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (tx.rv) {
    // handwriting, then a rough underline under the last line
    drawReveal(c, m.env!, tx.rv.R, seg(t, tx.rv.start, tx.rv.end), tx.rv.x, tx.rv.y);
    const ul = seg(t, tx.rv.end, tx.rv.end + 0.4);
    if (ul > 0) {
      const y = b.y + (b.lines.length - 1) * b.lh + 12, wl = b.widths[b.widths.length - 1];
      const prims = roughLine([b.x - wl / 2, y + 2], [b.x + wl / 2, y - 2], 77).map((d, i) => ({ d, w: i ? 2.6 : 4, ink: '#e0453a', alpha: i ? 0.7 : 1 }));
      paintPlan(c, drawPlan(prims), ul);
    }
    c.restore(); return;
  }
  let done = q * total;
  b.lines.forEach((l, i) => {
    const y = b.y + i * b.lh;
    if (done <= 0) return;
    const part = Math.min(1, done / (l.length || 1)); done -= l.length;
    const wpx = c.measureText(l).width;
    c.save(); c.beginPath(); c.rect(b.x - wpx / 2 - 4, y - b.size * 1.2, (wpx + 8) * part, b.size * 1.6); c.clip(); c.fillText(l, b.x, y); c.restore();
    if (part >= 1 && i === b.lines.length - 1) {
      // a quick underline under the last line, in the accent colour
      const ul = seg(t, (task?.end ?? tx.t0) , (task?.end ?? tx.t0) + 0.35);
      if (ul > 0) { c.strokeStyle = '#e0453a'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(b.x - wpx / 2, y + 12); c.lineTo(b.x - wpx / 2 + wpx * ul, y + 10); c.stroke(); }
    }
  });
  c.restore();
}

/** Seconds between consecutive visual events (for checks): the longest stretch without one. */
export function longestStill(m: ActModel, from = 0, to = m.duration) {
  const ev: number[] = [from, to];
  for (const a of m.actors) { a.body.forEach((b) => ev.push(b.t0)); a.moves.forEach((v) => ev.push(v.t0, v.t1)); a.talks.forEach((s) => ev.push(s.t0)); a.emos.forEach((e) => ev.push(e.t)); }
  m.hand.forEach((h) => ev.push(h.start, h.end)); m.texts.forEach((x) => ev.push(x.t0)); m.marks.forEach((x) => ev.push(x.t0)); m.bubbles.forEach((x) => ev.push(x.t0)); m.cams.forEach((c) => ev.push(c.t, c.t + c.dur));
  const s = ev.filter((x) => x >= from && x <= to).sort((a, b) => a - b);
  let max = 0;
  for (let i = 1; i < s.length; i++) max = Math.max(max, s[i] - s[i - 1]);
  return max;
}
export { transform };

// ---------------------------------------------------------------- Open Peeps people
function peepNow(m: ActModel, a: Actor, t: number, face?: string) {
  const st = actorState(m, a, t), [g, pose] = poseOf(actionAt(a, t).do, a.peep!);
  return peepPicture(m.env!, a.peep!, g, pose, face || faceOf(st.emo, st.talking, t, a.seed), m.peepScale, m.dpr);
}

/** The person alive: breathing, sway, nodding, steps; a short cross-fade when the pose changes. */
function drawPeepActor(c: Ctx, m: ActModel, a: Actor, t: number) {
  const x = actorX(a, t);
  if (a.draw && t < a.draw.end && a.reveal) {
    const { R, pic, flip } = a.reveal, rx = a.reveal.x;
    c.save(); c.translate(rx, 0); c.scale(flip, 1);
    drawReveal(c, m.env!, R, seg(t, a.draw.start, a.draw.end), -pic.ax, -pic.ay);
    c.restore();
    return;
  }
  const st = actorState(m, a, t), act = actionAt(a, t);
  const pic = peepNow(m, a, t);
  if (!pic) return;
  // turning: squash through the middle instead of a flat flip
  const sx = Math.sign(st.yaw || 1) * (0.6 + 0.4 * Math.min(1, Math.abs(st.yaw) / 0.5));
  const k = (t - act.t0);
  let nod = Math.sin(t * 1.7 + a.seed) * 0.012, bob = 0, rock = Math.sin(t * Math.PI * 2 / 4.2 + a.seed) * 0.008, shift = 0;
  switch (act.do) {
    case 'walk': case 'run': { const ph = ((act.dist || 0) / (40 * m.scale)) * Math.PI; bob = -Math.abs(Math.sin(ph)) * (act.run ? 10 : 6); rock = Math.sin(ph) * 0.035; break; }
    case 'nod': case 'listen': nod = Math.max(0, Math.sin(k * Math.PI * 2 * (act.do === 'nod' ? 1.8 : 0.6))) * (act.do === 'nod' ? 0.16 : 0.07); break;
    case 'shake': nod = Math.sin(k * Math.PI * 2 * 2.4) * 0.07; shift = Math.sin(k * Math.PI * 2 * 2.4) * 3; break;
    case 'talk': case 'explain': nod = Math.sin(k * 9) * 0.035; break;
    case 'celebrate': case 'cheer': case 'clap': bob = -Math.abs(Math.sin(k * Math.PI * 2 * 1.6)) * 14; break;
    case 'laugh': nod = -0.08 + Math.sin(k * 30) * 0.03; bob = Math.sin(k * 30) * 1.5; break;
    case 'surprised': bob = -Math.sin(Math.min(1, k / 0.35) * Math.PI) * 14; nod = -0.08; break;
    case 'sad': nod = 0.14; break;
    case 'shy': case 'nervous': nod = 0.1 + Math.sin(k * 2) * 0.02; shift = Math.sin(k * 3) * 2; break;
    case 'think': nod = -0.06 + Math.sin(k * 1.3) * 0.03; break;
    case 'bow': nod = Math.sin(Math.min(1, k / (act.t1 - act.t0 || 1)) * Math.PI) * 0.3; break;
  }
  if (st.talking) nod += Math.sin(t * 11) * 0.02;
  const breathe = 1 + Math.sin(t * Math.PI * 2 / 3.3 + a.seed) * 0.01;
  const blend = seg(t, act.t0, act.t0 + 0.18);
  if (blend < 1 && act.t0 > 0) {
    const prev = peepNow(m, a, act.t0 - 0.01);
    if (prev && prev !== pic) drawPeep(c, prev, x, sx, bob, rock, nod, shift, breathe, 1 - blend);
  }
  drawPeep(c, pic, x, sx, bob, rock, nod, shift, breathe, blend < 1 && act.t0 > 0 ? blend : 1);
  // something held that the pose does not show
  if (st.hold && act.do === 'phone') {
    const hx = x + (pic.neck[0] - pic.ax + pic.w * 0.08) * sx, hy = pic.neck[1] - pic.ay + pic.h * 0.28;
    paint(c, place(propPrims(st.hold, 5), hx, hy, m.scale * 0.8));
  }
}

function drawPeep(c: Ctx, pic: PeepPicture, x: number, sx: number, bob: number, rock: number, nod: number, shift: number, breathe: number, alpha: number) {
  const ox = -pic.ax, oy = -pic.ay, [nx, ny] = [ox + pic.neck[0], oy + pic.neck[1]];
  c.save(); c.globalAlpha *= alpha;
  c.translate(x, bob); c.rotate(rock); c.scale(sx, 1);
  // body: below the neck, breathing from the feet
  c.save(); c.beginPath(); c.rect(ox - 40, ny - 4, pic.w + 80, pic.h + 40); c.clip(); c.scale(1, breathe); c.drawImage(pic.canvas, ox, oy, pic.w, pic.h); c.restore();
  // head: above the neck, turning about it, riding on the breathing shoulders
  c.save(); c.translate(shift, ny * (breathe - 1)); c.translate(nx, ny); c.rotate(nod); c.translate(-nx, -ny);
  c.beginPath(); c.rect(ox - 60, oy - 60, pic.w + 120, pic.neck[1] + 64); c.clip(); c.drawImage(pic.canvas, ox, oy, pic.w, pic.h); c.restore();
  c.restore();
}
