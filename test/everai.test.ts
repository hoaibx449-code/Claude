import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { everAITTS } from '../src/node/everai.ts';

// Fake EverAI: POST returns a request id, GET reports "processing" once, then the audio link.
test('EverAI: polls each line and joins clips with exact line timing', async () => {
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
  process.env.EVERAI_API_KEY = 'test-key';
  process.env.EVERAI_API_URL = `http://127.0.0.1:${port}/tts`;
  try {
    const v = await everAITTS({ voiceCode: 'vi-north-female', pollMs: 10 }).synth(['Câu một.', 'Câu hai dài hơn.'], join(dir, 'scene0'));
    assert.equal(seen.length, 2);
    assert.equal(seen[0].voice_code, 'vi-north-female');
    assert.equal(seen[1].input_text, 'Câu hai dài hơn.');
    assert.ok(Math.abs(v.lines[0].end - v.lines[0].start - 1) < 0.1);
    assert.ok(Math.abs(v.lines[1].end - v.lines[1].start - 2) < 0.1);
    assert.ok(v.lines[1].start >= v.lines[0].end);
    assert.ok(Math.abs(v.duration - 3.5) < 0.2);
  } finally { srv.close(); }
});
