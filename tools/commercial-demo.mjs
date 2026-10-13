// Reproducible real MP4s: no browser rendering, API keys or generated AI pictures.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { renderProject } from '../src/node/pipeline.ts';
import { cleanSpec } from '../web/src/spec.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'out/commercial-demo');
mkdirSync(output, { recursive: true });
const scenes = [
  { lines: ['Bạn có đang chờ có thời gian mới bắt đầu?', 'Thử đổi cách: chỉ dành hai phút cho bước đầu tiên.'], diagram: { kind: 'sketch', items: [
    { t: 'text', text: 'Chờ thời gian?', x: 50, y: 15, size: 'xl', line: 0 },
    { t: 'icon', name: 'clock', x: 32, y: 48, w: 25, line: 0 },
    { t: 'person', action: 'think', x: 70, y: 55, h: 40, line: 0 },
    { t: 'text', text: 'Bắt đầu: 2 phút', x: 50, y: 85, size: 'l', color: 'accent', line: 1 },
  ] } },
  { lines: ['Mở sách, đọc một trang; mang giày, bước ra cửa.', 'Việc nhỏ đủ dễ để bạn bắt đầu ngay hôm nay.'], diagram: { kind: 'sketch', items: [
    { t: 'text', text: 'Nhỏ, dễ, làm ngay', x: 50, y: 18, size: 'l', line: 0 },
    { t: 'icon', name: 'book', x: 25, y: 50, w: 27, line: 0 },
    { t: 'person', action: 'walk', x: 72, y: 55, h: 42, line: 0 },
    { t: 'text', text: 'Bắt đầu hôm nay', x: 50, y: 87, size: 'l', color: 'good', line: 1 },
  ] } },
];
for (const [mode, style] of [['hand', 'whiteboard'], ['motion', 'cosmos'], ['math', 'manim'], ['kinetic', 'bold']]) {
  const rawScenes = mode === 'math' ? [
    { lines: scenes[0].lines, diagram: { kind: 'plot', title: 'Bắt đầu từ một bước nhỏ', fn: 'linear', xLabel: 'Thời gian', yLabel: 'Tiến bộ' } },
    { lines: scenes[1].lines, diagram: { kind: 'steps', title: 'Hai phút đầu tiên', items: ['Mở sách', 'Đọc một trang', 'Lặp lại ngày mai'] } },
  ] : scenes;
  const spec = cleanSpec({ title: 'Hai phút để bắt đầu', channel: 'Nét Vẽ', ratio: '9:16', visual: 'sketch', mode, style, subtitles: true, intro: null, voice: { provider: 'mock' }, scenes: rawScenes }, 'demo');
  writeFileSync(join(output, mode + '.json'), JSON.stringify(spec, null, 2));
  const result = await renderProject({ project: spec, projDir: root, out: join(output, mode + '.mp4'), tts: 'mock', size: 360, fps: 15 });
  console.log(`${mode}: ${result.width}x${result.height}, ${result.duration.toFixed(1)}s, ${result.frames} frames`);
}
console.log('Open docs/commercial-demo.html to compare the generated MP4 files. Audio is deliberately silent mock narration.');
