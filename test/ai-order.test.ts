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
