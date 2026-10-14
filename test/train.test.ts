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

test('Gemini 3 thinks "low"; a model that refuses the setting is asked again without it', async () => {
  const orig = globalThis.fetch, bodies: any[] = [];
  globalThis.fetch = (async (_u: string, o: any) => { const b = JSON.parse(o.body); bodies.push(b);
    if (b.generationConfig.thinkingConfig) return new Response(JSON.stringify({ error: { message: 'Unknown name "thinkingLevel" at generation_config.thinking_config' } }), { status: 400 });
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(proposal) }] } }] })); }) as any;
  try {
    const r = await analyzeSample({ GEMINI_API_KEY: 'g', GEMINI_TEXT_MODEL: 'gemini-3.8-flash' } as any, [], 'mẫu');
    assert.equal(r.base, 'act');
    assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
  } finally { globalThis.fetch = orig; }
});

test('retired Gemini models saved in settings move to the current ones', async () => {
  const { cleanConfig, defaultConfig } = await import('../web/src/settings.ts');
  const base = defaultConfig({} as any);
  const c = cleanConfig({ models: { geminiText: 'gemini-2.5-flash', geminiFallback: 'gemini-2.5-flash-lite,gemini-2.0-flash,gemini-3.5-flash' } }, base);
  assert.equal(c.models.geminiText, 'gemini-3.5-flash');
  assert.equal(c.models.geminiFallback, 'gemini-3.5-flash');
});

test('the AI the admin chose is asked first; the other one only when it fails', async () => {
  const { textPlan } = await import('../web/src/ai.ts');
  const env: any = { GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_TEXT_FALLBACK: 'gemini-flash-latest', OPENAI_TEXT_MODEL: 'gpt-4o-mini', OPENAI_TEXT_FALLBACK: 'gpt-4.1-mini' };
  assert.deepEqual(textPlan(env, 'openai').map(([p, m]) => p + ':' + m), ['openai:gpt-4o-mini', 'openai:gpt-4.1-mini', 'gemini:gemini-3.5-flash', 'gemini:gemini-flash-latest']);
  assert.deepEqual(textPlan(env, 'gemini')[0], ['gemini', 'gemini-3.5-flash']);
  assert.deepEqual(textPlan({ ...env, OPENAI_API_KEY: '' }, 'openai').map(([p]) => p), ['gemini', 'gemini']);
  const orig = globalThis.fetch, hosts: string[] = [];
  globalThis.fetch = (async (url: string) => { hosts.push(new URL(url).host);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(proposal) } }] })); }) as any;
  try { await analyzeSample(env, [], 'mẫu', 'openai'); assert.equal(hosts[0], 'api.openai.com'); } finally { globalThis.fetch = orig; }
});
