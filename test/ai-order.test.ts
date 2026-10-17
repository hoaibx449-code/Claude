import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistantAnswer, textPlan } from '../web/src/ai.ts';
import { aiOrder } from '../web/src/settings.ts';
import { faqAnswer } from '../web/src/help.ts';

const base: any = { GEMINI_API_KEY: 'g', GEMINI_TEXT_MODEL: 'gemini-a', OPENAI_API_KEY: 'o', OPENAI_TEXT_MODEL: 'gpt-a', OLLAMA_URL: 'https://ollama.test', OLLAMA_TEXT_MODEL: 'qwen3:8b', OLLAMA_TEXT_FALLBACK: 'llama3.2' };

test('AI order: the admin order decides who writes and who takes over', () => {
  assert.deepEqual(aiOrder(['ollama', 'gemini']), ['ollama', 'gemini', 'openai']);
  assert.deepEqual(aiOrder(undefined, 'openai'), ['openai', 'gemini', 'ollama']);
  assert.deepEqual(aiOrder(['bogus']), ['gemini', 'openai', 'ollama']);
  const plan = textPlan({ ...base, AI_ORDER: 'ollama,openai,gemini' }, 'ollama');
  assert.deepEqual(plan.map(([p]) => p), ['ollama', 'ollama', 'openai', 'gemini']);
  assert.deepEqual(plan.slice(0, 2).map(([, m]) => m), ['qwen3:8b', 'llama3.2']);
  // no address: Ollama is skipped
  assert.ok(!textPlan({ ...base, OLLAMA_URL: '', AI_ORDER: 'ollama,gemini,openai' }, 'ollama').some(([p]) => p === 'ollama'));
});

test('Ollama answers, and a failing Ollama hands over to the next AI', async () => {
  const orig = globalThis.fetch, calls: string[] = [];
  try {
    globalThis.fetch = (async (url: any, o: any) => {
      const u = String(url); calls.push(u);
      if (u.startsWith('https://ollama.test/api/chat')) {
        const b = JSON.parse(o.body);
        if (b.model === 'qwen3:8b') return new Response('model not found', { status: 404 });
        assert.equal(b.format, 'json'); assert.equal(b.stream, false);
        return new Response(JSON.stringify({ message: { content: '{"reply":"Chào bạn","intent":"chat"}' }, prompt_eval_count: 10, eval_count: 5 }));
      }
      throw new Error('unexpected ' + u);
    }) as any;
    const a = await assistantAnswer({ ...base, AI_ORDER: 'ollama,gemini,openai' }, 'sys', [], 'hi', 'ollama');
    assert.equal(a.reply, 'Chào bạn'); assert.equal(a.usage.provider, 'ollama'); assert.equal(a.usage.model, 'llama3.2');
    assert.ok(calls.every((u) => u.startsWith('https://ollama.test')));
  } finally { globalThis.fetch = orig; }
});

test('help chat falls back to the FAQ', () => {
  assert.match(faqAnswer('Làm sao đổi giọng đọc?'), /Đổi/);
  assert.match(faqAnswer('tải video về ở đâu'), /Video của tôi/);
  assert.match(faqAnswer('xyz'), /chưa chắc/);
});

test('Gemini out of quota hands over to Ollama at once (no waiting on every Gemini model)', async () => {
  const { clearDown } = await import('../web/src/ai.ts');
  const { ollamaAddress } = await import('../web/src/settings.ts');
  assert.equal(ollamaAddress('ollama.com/'), 'https://ollama.com');
  assert.equal(ollamaAddress('https://x.vn/api/'), 'https://x.vn');
  assert.equal(ollamaAddress('not a url'), '');
  const orig = globalThis.fetch, calls: string[] = [];
  clearDown();
  try {
    globalThis.fetch = (async (url: any) => {
      const u = String(url); calls.push(u);
      if (u.includes('generativelanguage')) return new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan and billing details.' } }), { status: 429 });
      if (u === 'https://ollama.com/api/chat') return new Response(JSON.stringify({ message: { content: '{"reply":"Ollama đây","intent":"chat"}' } }));
      throw new Error('unexpected ' + u);
    }) as any;
    const env = { ...base, OPENAI_API_KEY: '', GEMINI_TEXT_FALLBACK: 'gemini-flash-latest,gemini-3.8-flash', OLLAMA_URL: 'https://ollama.com', OLLAMA_API_KEY: 'k', AI_ORDER: 'gemini,openai,ollama' };
    const a = await assistantAnswer(env, 'sys', [], 'hi', 'gemini');
    assert.equal(a.usage.provider, 'ollama');
    assert.equal(calls.filter((u) => u.includes('generativelanguage')).length, 1);
  } finally { globalThis.fetch = orig; clearDown(); }
});

test('a script far shorter than asked gets one pass to reach the length', async () => {
  const { writeScript } = await import('../web/src/ai.ts');
  const orig = globalThis.fetch; let calls = 0;
  const scene = (n: number) => ({ lines: [Array.from({ length: n }, (_, i) => 'chữ' + i).join(' ') + '.'], diagram: { kind: 'sketch', items: [{ t: 'text', text: 'Ý', x: 50, y: 50 }] } });
  try {
    globalThis.fetch = (async () => {
      calls++;
      const scenes = calls === 1 ? [scene(10), scene(10)] : Array.from({ length: 8 }, () => scene(20));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ title: 'T', scenes }) } }] });
    }) as any;
    const out = await writeScript({ OPENAI_API_KEY: 'k', OPENAI_TEXT_MODEL: 'm' } as any, 'openai', { topic: 'Tiết kiệm', seconds: 60, tone: '', ratio: '9:16', visual: 'sketch', look: 'director' as any });
    assert.ok(calls >= 2);
    assert.ok(out.scenes.length >= 8);
  } finally { globalThis.fetch = orig; }
});
