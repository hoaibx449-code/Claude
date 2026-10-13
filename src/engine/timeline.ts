import type { SceneSpec, SceneTiming, Span, Timeline } from './types.ts';

export const SCENE_GAP = 0.35; // pause between scenes
export const LEAD_IN = 0.3; // hand moves in before the first line

/**
 * Lay scenes end to end. `voice[i]` holds line spans relative to the start of
 * scene i's audio, plus that audio's duration.
 */
export const INTRO = 1.8; // opening title card (thumbnail), seconds

/**
 * `continuous`: the narration is one recording (uploaded voice), so scenes follow it with no
 * extra lead-in or pause between them, or picture and voice would drift apart.
 */
export function buildTimeline(scenes: SceneSpec[], voice: { lines: Span[]; duration: number }[], opts: { intro?: boolean; continuous?: boolean } = {}): Timeline {
  const out: SceneTiming[] = [];
  let t = opts.intro ? INTRO : 0;
  scenes.forEach((sc, i) => {
    const v = voice[i];
    const cont = !!opts.continuous;
    const audioStart = t + (cont && i > 0 ? 0 : LEAD_IN);
    const lines = v.lines.map((l) => ({ start: audioStart + l.start, end: audioStart + l.end }));
    const end = audioStart + v.duration + (cont ? 0 : SCENE_GAP + Math.max(0, Math.min(6, sc.pause || 0)));
    const panels = sc.panels.map((p, k) => {
      const li = Math.min(p.line ?? k, lines.length - 1);
      const line = lines[li];
      const start = line.start + 0.05;
      // drawn stroke by stroke while the narration is about it: until the next picture's line
      // starts (or the scene's last words), never shorter than 1.2s nor longer than 7s
      const nextLine = k + 1 < sc.panels.length ? Math.min(sc.panels[k + 1].line ?? k + 1, lines.length - 1) : lines.length;
      const until = nextLine > li && nextLine < lines.length ? lines[nextLine].start - 0.3 : lines[lines.length - 1].end - 0.1;
      const dur = Math.max(1.2, Math.min(7, until - start));
      return { start, end: Math.min(start + dur, end - 0.15) };
    });
    // panels tied to the same line are drawn one after the other
    for (let k = 1; k < panels.length; k++) {
      if (panels[k].start < panels[k - 1].end + 0.25) {
        const len = panels[k].end - panels[k].start;
        panels[k].start = panels[k - 1].end + 0.25;
        panels[k].end = panels[k].start + len;
      }
    }
    const sceneEnd = cont ? end : Math.max(end, ...panels.map((p) => p.end + 0.4));
    out.push({ start: t, end: sceneEnd, lines, panels });
    t = sceneEnd;
  });
  return { scenes: out, duration: t + 0.6, intro: opts.intro ? INTRO : 0 };
}

/** Rough narration timing when no TTS timestamps exist (≈14 chars/s for Vietnamese). */
export function estimateVoice(lines: string[], charsPerSec = 14): { lines: Span[]; duration: number } {
  let t = 0;
  const spans = lines.map((l) => {
    const d = Math.max(1.4, l.length / charsPerSec);
    const s = { start: t, end: t + d };
    t += d + 0.25;
    return s;
  });
  return { lines: spans, duration: t };
}
