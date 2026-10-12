// Shared types. The engine only uses the Canvas 2D API, so the same code draws
// the browser preview and the server-side MP4.

export type Ratio = '9:16' | '16:9';
export type ToolKind = 'marker' | 'chalk' | 'fountain' | 'colormarker' | 'pencil' | 'technical' | 'brush';
export type StyleKey = 'notebook' | 'whiteboard' | 'chalkboard' | 'kraft' | 'oly' | 'pencil' | 'blueprint' | 'ricepaper' | 'neon' | 'pastel' | 'newspaper' | 'comic' | 'darkboard' | 'sunset';

export interface PanelSpec {
  /** Local image file (SVG/PNG/WebP). Used as is when present. */
  image?: string;
  /** Scene description sent to the image provider when `image` is missing. */
  prompt?: string;
  /** Index of the narration line this panel is drawn with (default: panel index). */
  line?: number;
}

export interface DiagramSpec {
  kind: 'bars' | 'compare' | 'steps' | 'flow' | 'number' | 'statement' | 'stick' | 'sketch';
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

export type InkColor = 'ink' | 'accent' | 'accent2' | 'good';
/** Positions are percentages of the drawing area; x,y is the item's centre. `line` = narration line it is drawn with. */
export type SketchItem = { id?: string; line?: number; /** words of the line: drawn when they are spoken */ cue?: string } & (
  | { t: 'text'; text: string; x: number; y: number; size?: 's' | 'm' | 'l' | 'xl' | 'xxl'; color?: InkColor; w?: number; align?: 'center' | 'left' }
  | { t: 'icon'; name: string; x: number; y: number; w?: number; color?: InkColor; label?: string }
  | { t: 'person'; action?: string; x: number; y: number; h?: number; facing?: 1 | -1; label?: string; bubble?: string }
  | { t: 'chart'; x: number; y: number; w?: number; h?: number; kind: 'bars' | 'flow' | 'compare' | 'steps' | 'number'; [k: string]: any }
  | { t: 'arrow'; from: string | [number, number]; to: string | [number, number]; curve?: number; color?: InkColor; label?: string }
  | { t: 'circle' | 'underline' | 'box' | 'cross' | 'check'; on: string; color?: InkColor }
);

export interface SceneSpec {
  /** Narration, one subtitle line each. */
  lines: string[];
  /** Line-art images revealed by the pen. Empty when the scene is a diagram. */
  panels: PanelSpec[];
  /** Drawn stroke by stroke instead of images. */
  diagram?: DiagramSpec;
}

export interface ProjectSpec {
  title: string;
  channel: string;
  episode?: string;
  ratio: Ratio;
  style: StyleKey;
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
  scenes: SceneSpec[];
}

export interface Span { start: number; end: number }

export interface SceneTiming extends Span {
  lines: Span[];
  /** When each panel is drawn, absolute seconds. */
  panels: Span[];
}

export interface Timeline { scenes: SceneTiming[]; duration: number }

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
