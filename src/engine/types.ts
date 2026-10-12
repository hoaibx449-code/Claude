// Shared types. The engine only uses the Canvas 2D API, so the same code draws
// the browser preview and the server-side MP4.

export type Ratio = '9:16' | '16:9';
export type ToolKind = 'marker' | 'chalk' | 'fountain' | 'colormarker' | 'pencil' | 'technical' | 'brush';
export type StyleKey = 'notebook' | 'whiteboard' | 'chalkboard' | 'kraft' | 'oly' | 'pencil' | 'blueprint' | 'ricepaper';

export interface PanelSpec {
  /** Local image file (SVG/PNG/WebP). Used as is when present. */
  image?: string;
  /** Scene description sent to the image provider when `image` is missing. */
  prompt?: string;
  /** Index of the narration line this panel is drawn with (default: panel index). */
  line?: number;
}

export interface DiagramSpec {
  kind: 'bars' | 'compare' | 'steps' | 'flow' | 'number' | 'statement';
  /** Handwritten heading above the diagram. */
  title?: string;
  values?: number[]; labels?: string[]; unit?: string; // bars
  start?: string; // bars: starting amount in a circle with an arrow, e.g. "10tr"
  trend?: boolean; // bars: rising curve + circle on the largest value (default on)
  left?: string; right?: string; leftNote?: string; rightNote?: string; // compare (✗ left, ✓ right)
  items?: string[]; // steps, flow (cause → effect)
  number?: string; caption?: string; // number
  text?: string; // statement
}

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
