// Render a project to MP4 without a browser.
//   node src/cli/render.ts examples/luong-11-trieu/project.json --out out/video.mp4
// Options: --tts mock|everai|elevenlabs|google   --images openai|gemini   --size 1080   --fps 30
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ProjectSpec } from '../engine/types.ts';
import { renderProject } from '../node/pipeline.ts';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' }, tts: { type: 'string' }, images: { type: 'string' },
      size: { type: 'string', default: '1080' }, fps: { type: 'string', default: '30' },
    },
  });
  const projectFile = positionals[0];
  if (!projectFile) throw new Error('Cần đường dẫn project.json');
  const projDir = dirname(resolve(projectFile));
  const project: ProjectSpec = JSON.parse(readFileSync(projectFile, 'utf8'));
  const r = await renderProject({
    project, projDir, out: values.out ?? join(projDir, 'out', 'video.mp4'),
    tts: values.tts, images: values.images, size: Number(values.size), fps: Number(values.fps),
    onProgress: (f) => process.stderr.write(`\r${Math.round(f * 100)}%`),
  });
  console.log(`\nXong: ${r.out}\n${r.duration.toFixed(1)}s video, ${r.frames} khung, ${r.width}x${r.height}, dựng trong ${r.seconds.toFixed(1)}s (${(r.seconds / r.duration).toFixed(2)}s mỗi giây video). Giọng: ${r.voice}.`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
