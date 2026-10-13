import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderProject } from '../src/node/pipeline.ts';
const project: any = { title: 'Demo', channel: '', ratio: '9:16', style: 'whiteboard', scenes: [{ lines: ['Bắt đầu.'], panels: [], diagram: { kind: 'statement', text: 'Bắt đầu' } }] };
test('server pipeline renders odd requested sizes to playable even H.264 dimensions and cleans scratch audio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-'));
  try {
    const out = join(dir, 'video.MP4');
    const result = await renderProject({ project, projDir: process.cwd(), out, tts: 'mock', size: 240, fps: 5 });
    assert.equal(result.width, 240); assert.equal(result.height, 426);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', out], { encoding: 'utf8' }));
    assert.ok(probe.streams.some((s: any) => s.codec_name === 'h264' && s.width === 240 && s.height === 426));
    assert.ok(probe.streams.some((s: any) => s.codec_name === 'aac'));
    assert.match(readFileSync(result.srt, 'utf8'), /Bắt đầu\./);
    assert.deepEqual(readdirSync(join(dir, '.work')), []);
    await assert.rejects(renderProject({ project, projDir: '.', out, fps: NaN }), /FPS/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('an encoder failure returns a controlled error instead of an unhandled EPIPE or hang', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'encoder-'));
  const originalPath = process.env.PATH;
  try {
    // Mock audio creation succeeds; only the video encoder intentionally fails.
    const realFFmpeg = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
    writeFileSync(join(dir, 'ffmpeg'), `#!/bin/sh\ncase "$*" in *rawvideo*) exit 7;; esac\nexec '${realFFmpeg}' "$@"\n`, { mode: 0o755 });
    process.env.PATH = dir + ':' + originalPath;
    await assert.rejects(renderProject({ project, projDir: process.cwd(), out: join(dir, 'bad.mp4'), tts: 'mock', size: 240, fps: 5 }));
    assert.deepEqual(readdirSync(join(dir, '.work')), []);
  } finally { process.env.PATH = originalPath; rmSync(dir, { recursive: true, force: true }); }
});
