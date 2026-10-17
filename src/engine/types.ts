import type { Direction } from './director.ts';
import type { ActCast, ActScene } from './act/spec.ts';

// Shared types. The engine only uses the Canvas 2D API, so the same code draws
// the browser preview and the server-side MP4.

export type Ratio = '9:16' | '16:9';
export type ToolKind = 'marker' | 'chalk' | 'fountain' | 'colormarker' | 'pencil' | 'technical' | 'brush';
export type StyleKey = 'notebook' | 'whiteboard' | 'chalkboard' | 'kraft' | 'oly' | 'pencil' | 'blueprint' | 'ricepaper' | 'neon' | 'pastel' | 'newspaper' | 'comic' | 'darkboard' | 'sunset' | 'cosmos' | 'manim' | 'bold';
/** How the board comes alive: a hand drawing, motion graphics, maths animation, kinetic typography. */
export type Mode = 'hand' | 'motion' | 'math' | 'kinetic';
/** Video formats (each its own storytelling grammar, pacing and sound); replaces style × mode for new videos. */
export type Look = 'director' | 'act' | 'kinetic' | 'split' | 'chat' | 'story' | 'data' | 'quiz' | 'doc';
export const LOOKS: Look[] = ['director', 'act', 'kinetic', 'split', 'chat', 'story', 'data', 'quiz', 'doc'];

/** Per-scene data a format uses (all optional: missing parts are derived from the lines). */
export interface LookData {
  /** main icon of the scene (Tabler name) */
  icon?: string;
  /** words to emphasise (kinetic, captions) */
  keys?: string[];
  /** split: what side A / side B does in this scene, their icons, optional figures ("0đ", "36 triệu") */
  a?: string; b?: string; aIcon?: string; bIcon?: string; aValue?: string; bValue?: string; aAction?: string; bAction?: string;
  /** chat: bubbles of this scene (default: one per line); a = the other person (left), b = me (right) */
  chat?: { who: 'a' | 'b'; text: string }[];
  /** chat: a lesson card shown over the thread */
  card?: string;
  /** story: where the scene happens, what the character does and says */
  place?: { icon: string; label: string }; action?: string; say?: string; icons?: string[]; money?: boolean;
  /** data: the headline figure and its breakdown */
  stat?: { value: number; unit?: string; label?: string; parts?: { label: string; value: number }[] };
  /** quiz: question, options, index of the right one; reveal = the answer scene */
  quiz?: { q: string; options: string[]; answer: number; reveal?: boolean };
}

export interface PanelSpec {
  /** Local image file (SVG/PNG/WebP). Used as is when present. */
  image?: string;
  /** Scene description sent to the image provider when `image` is missing. */
  prompt?: string;
  /** Index of the narration line this panel is drawn with (default: panel index). */
  line?: number;
}

export interface DiagramSpec {
  kind: 'bars' | 'compare' | 'steps' | 'flow' | 'number' | 'statement' | 'stick' | 'sketch' | 'plot' | 'pie';
  /** plot: the shape of the curve (or explicit values), axis names */
  fn?: 'linear' | 'exp' | 'log' | 'sin' | 'square' | 'sqrt' | 'down' | 'wave'; xLabel?: string; yLabel?: string;
  /** Handwritten heading above the diagram. */
  title?: string;
  values?: number[]; labels?: string[]; unit?: string; // bars
  start?: string; // bars: starting amount in a circle with an arrow, e.g. "10tr"
  trend?: boolean; // bars: rising curve + circle on the largest value (default on)
  left?: string; right?: string; leftNote?: string; rightNote?: string; // compare (✗ left, ✓ right)
  /** steps, flow (cause → effect): strings · sketch: a free composition (SketchItem[]) designed for this scene */
  items?: any[];
  number?: string; caption?: string; // number
  text?: string; // statement
  /** stick: 1-2 animated stick figures, a speech bubble for the first one, caption under the ground. */
  actors?: { action: string; label?: string }[];
  bubble?: string;
}

export type InkColor = `#${string}` | 'ink' | 'accent' | 'accent2' | 'good';
/** Positions are percentages of the drawing area; x,y is the item's centre. `line` = narration line it is drawn with. */
export type SketchItem = { motion?: {dx:number;dy:number;rotate:number;scale:number}; id?: string; line?: number; /** words of the line: drawn when they are spoken */ cue?: string } & (
  | { t: 'text'; text: string; x: number; y: number; size?: 's' | 'm' | 'l' | 'xl' | 'xxl'; color?: InkColor; w?: number; align?: 'center' | 'left' }
  | { t: 'vector'; paths: number[][][]; x: number; y: number; w: number; h: number; color?: InkColor; fill?: boolean; stroke?: number }
  | { t: 'icon'; name: string; x: number; y: number; w?: number; color?: InkColor; label?: string }
  | { t: 'person'; action?: string; x: number; y: number; h?: number; facing?: 1 | -1; label?: string; bubble?: string }
  | { t: 'chart'; x: number; y: number; w?: number; h?: number; kind: 'bars' | 'flow' | 'compare' | 'steps' | 'number' | 'plot' | 'pie'; [k: string]: any }
  | { t: 'arrow'; from: string | [number, number]; to: string | [number, number]; curve?: number; color?: InkColor; label?: string }
  | { t: 'circle' | 'underline' | 'box' | 'cross' | 'check'; on: string; color?: InkColor }
  /** a real picture (reference character, product photo); `src` is a key of ProjectSpec.media */
  | { t: 'image'; src: string; x: number; y: number; w?: number; h?: number; shape?: 'rounded' | 'circle'; label?: string }
  /** QR code of a link (affiliate) */
  | { t: 'qr'; text: string; x: number; y: number; w?: number; label?: string }
);

export interface SceneSpec {
  direction?: Direction;
  /** Narration, one subtitle line each. */
  lines: string[];
  /** Line-art images revealed by the pen. Empty when the scene is a diagram. */
  panels: PanelSpec[];
  /** Drawn stroke by stroke instead of images. */
  diagram?: DiagramSpec;
  /** format data (see LookData) */
  x?: LookData;
  /** silence after the narration, seconds (quiz countdown) */
  pause?: number;
  /** story animation: what happens in this scene, as timed animation events */
  act?: ActScene;
}

export interface ProjectSpec {
  creative?: {wish:string;direction?:string;approach?:string;limitations?:string[];feedback?:string[]};
  title: string;
  channel: string;
  episode?: string;
  ratio: Ratio;
  style: StyleKey;
  palette?: {background:string;ink:string;accent:string;accent2:string};
  /** Overrides the style's default tool. */
  tool?: ToolKind;
  /** Hand asset folder (hand.webp, fingers.webp, hand.json). */
  hand?: string;
  voice?: { provider?: string; voiceId?: string; languageCode?: string; model?: string; speed?: number; pitch?: number; volume?: number };
  images?: { provider?: string };
  /** Narration also written at the bottom of the picture (off by default: the board shows the key words). */
  subtitles?: boolean;
  /** How one board gives way to the next; auto = varied. */
  transition?: 'auto' | 'fade' | 'slide' | 'wipe' | 'zoom';
  /** hand (default) · motion graphics · maths animation · kinetic typography */
  mode?: Mode;
  /** video format; when set, style/mode/tool are ignored */
  look?: Look;
  /** colour set of the format */
  skin?: string;
  /** split: names of the two sides */
  sides?: { a: string; b: string };
  /** chat: name shown at the top of the conversation */
  chatName?: string;
  /** background music: file path (server) or stored reference (web); ducked under the voice */
  music?: string;
  /** sound effects of the format (default on) */
  sfx?: boolean;
  /** Opening title card, made to work as the video's thumbnail. */
  intro?: { title: string; sub?: string; badge?: string; icon?: string } | null;
  /** Pictures used by image items: key → URL (browser) or file path (server). */
  media?: Record<string, string>;
  /** media key of a reference character: it plays the people of every scene */
  character?: string;
  /** affiliate product shown at the end (the editor builds that scene from it) */
  affiliate?: { link: string; product?: string; price?: string; image?: string };
  /** story animation: the people of the story (same look in every scene) */
  cast?: ActCast[];
  /** how the people are drawn: Open Peeps artwork (hand-drawn style) or the vector rig */
  figures?: 'peeps' | 'rig';
  /** sound layers, kept separate: narration source, levels of each layer */
  audio?: { voice?: 'tts' | 'upload' | 'none'; voiceFile?: string; voiceVolume?: number; musicVolume?: number; sfxVolume?: number; mood?: 'warm' | 'curious' | 'calm' | 'upbeat' | 'none' };
  scenes: SceneSpec[];
}

export interface Span { start: number; end: number }

export interface SceneTiming extends Span {
  lines: Span[];
  /** When each panel is drawn, absolute seconds. */
  panels: Span[];
}

export interface Timeline { scenes: SceneTiming[]; duration: number; /** length of the opening title card */ intro?: number }

export interface HandMeta {
  width: number;
  height: number;
  tip: [number, number];
  angle: number;
  penWidth: number;
}

// Anything with the Canvas 2D drawing API (browser canvas or @napi-rs/canvas).
// Kept loose on purpose so both implementations satisfy it.
export type Ctx = any;
export type Img = any;

export interface Env {
  createCanvas(w: number, h: number): { width: number; height: number; getContext(t: '2d'): Ctx };
}
