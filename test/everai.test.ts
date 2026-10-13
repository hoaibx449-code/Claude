import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { everAITTS, narrationChunks } from '../src/node/everai.ts';

// Fake EverAI: POST returns a request id, GET reports "processing" once, then the audio link.
test('EverAI: reads a paragraph in one paid request and fits estimated cues to audio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'everai-'));
  const clip = (s: number) => {
    const f = join(dir, `tone${s}.mp3`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${s}`, f]);
    return readFileSync(f);
  };
  const audio = [clip(1), clip(2)];
  const seen: any[] = []; const polls = new Map<string, number>();
  const srv = createServer((req, res) => {
    const a = req.url!.match(/\/audio\/r(\d)\.mp3$/);
    // audio links are plain downloads: the API key must not be sent there
    if (a) { assert.equal(req.headers.authorization, undefined); res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(audio[Number(a[1])]); return; }
    if (req.headers.authorization !== 'Bearer test-key') { res.writeHead(401).end('{}'); return; }
    if (req.method === 'POST') {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        const body = JSON.parse(b); seen.push(body);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 1, result: { request_id: `r${seen.length - 1}` } }));
      });
      return;
    }
    const m = req.url!.match(/\/tts\/(r\d)$/);
    if (m) {
      const n = (polls.get(m[1]) ?? 0) + 1; polls.set(m[1], n);
      const done = n > 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ result: { status: done ? 'SUCCESS' : 'IN_PROGRESS', audio_link: done ? `http://127.0.0.1:${(srv.address() as any).port}/audio/${m[1]}.mp3` : null } }));
      return;
    }
    res.writeHead(404).end('{}');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as any).port;
  const oldKey = process.env.EVERAI_API_KEY, oldUrl = process.env.EVERAI_API_URL;
  process.env.EVERAI_API_KEY = 'test-key';
  process.env.EVERAI_API_URL = `http://127.0.0.1:${port}/tts`;
  const cacheDir = join(dir, 'cache');
  try {
    const tts = everAITTS({ voiceCode: 'vi_female_thuytrang_mb', pollMs: 10, cacheDir });
    const v = await tts.synth(['Câu một.', 'Câu hai dài hơn.'], join(dir, 'scene0'));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].voice_code, 'vi_female_thuytrang_mb');
    assert.equal(seen[0].model_id, 'everai-v1.6');
    assert.equal(seen[0].response_type, 'indirect');
    assert.equal(seen[0].input_text, 'Câu một. Câu hai dài hơn.');
    assert.equal(v.lines[0].start, 0);
    assert.equal(v.lines[1].end, v.duration);
    assert.ok(v.lines[1].start >= v.lines[0].end);
    assert.ok(Math.abs(v.duration - 1) < 0.1);
    // re-render: same sentences come from the cache, no new paid request
    await tts.synth(['Câu một.', 'Câu hai dài hơn.'], join(dir, 'scene0b'));
    assert.equal(seen.length, 1);
  } finally { srv.close();
    if (oldKey === undefined) delete process.env.EVERAI_API_KEY; else process.env.EVERAI_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.EVERAI_API_URL; else process.env.EVERAI_API_URL = oldUrl;
  }
});

test('EverAI chunks paragraphs at sentence boundaries within the provider limit', () => {
  const chunks = narrationChunks(['a'.repeat(3000), 'b'.repeat(2000), 'last.']);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((c) => c.join(' ').length <= 5000));
  assert.throws(() => narrationChunks(['x'.repeat(5001)]));
  assert.throws(() => narrationChunks([]));
});
