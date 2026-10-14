import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSample } from '../web/src/ai.ts';

const env: any = { GEMINI_API_KEY: 'g', GEMINI_TEXT_MODEL: 'gemini-2.5-flash', GEMINI_TEXT_FALLBACK: 'gemini-2.0-flash' };
const frame = 'data:image/jpeg;base64,' + Buffer.from('x').toString('base64');
const proposal = { name: 'Kể chuyện nhanh', summary: 's', base: 'act', structure: ['a'], pacing: 'p', visuals: 'v', audio: 'a', brief: 'b', stages: ['x'] };

test('sample analysis turns off Gemini 2.5 Flash thinking so pictures cannot eat the whole answer', async () => {
  const orig = globalThis.fetch, sent: any[] = [];
  globalThis.fetch = (async (url: string, o: any) => { sent.push({ url, body: JSON.parse(o.body) });
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal) }] } }] })); }) as any;
  try {
    const r = await analyzeSample(env, [frame], 'mẫu');
    assert.equal(r.name, 'Kể chuyện nhanh');
    assert.equal(sent[0].body.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.equal(sent[0].body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
  } finally { globalThis.fetch = orig; }
});

test('a cut answer moves to the next model, and a final failure says why', async () => {
  const orig = globalThis.fetch, models: string[] = [];
  globalThis.fetch = (async (url: string) => { models.push(String(url).match(/models\/([^:]+)/)![1]);
    if (models.length === 1) return new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"name":"Kể' }] } }] }));
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal) }] } }] })); }) as any;
  try {
    assert.equal((await analyzeSample(env, [frame], '')).base, 'act');
    assert.deepEqual(models, ['gemini-2.5-flash', 'gemini-2.0-flash']);
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })) as any;
    await assert.rejects(analyzeSample(env, [frame], ''), /API key not valid/);
  } finally { globalThis.fetch = orig; }
});
