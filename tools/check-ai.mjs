// Calls each configured AI service once with a tiny request and prints only status + error text.
const out = [];
async function check(name, fn) {
  try { const r = await fn(); out.push(`${name}: HTTP ${r.status} ${r.ok ? 'OK' : ((await r.text()).match(/"message":\s*"([^"]{0,300})/)?.[1] || '')}`); }
  catch (e) { out.push(`${name}: lỗi kết nối ${e.message}`); }
}
const oa = process.env.OPENAI_API_KEY;
if (oa) {
  const h = { authorization: `Bearer ${oa}`, 'content-type': 'application/json' };
  await check('OpenAI viết kịch bản (gpt-4o-mini)', () => fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: h, body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }) }));
  await check('OpenAI vẽ ảnh (gpt-image-1)', () => fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: h, body: JSON.stringify({ model: 'gpt-image-1', prompt: 'a simple black line drawing of a cup', size: '1024x1024', quality: 'low', n: 1 }) }));
  await check('OpenAI vẽ ảnh (dall-e-3)', () => fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: h, body: JSON.stringify({ model: 'dall-e-3', prompt: 'a simple black line drawing of a cup', size: '1024x1024', quality: 'standard', n: 1, response_format: 'b64_json' }) }));
} else out.push('OpenAI: chưa có khoá');
const gm = process.env.GEMINI_API_KEY;
if (gm) await check('Gemini vẽ ảnh', () => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent', { method: 'POST', headers: { 'x-goog-api-key': gm, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'a simple black line drawing of a cup' }] }], generationConfig: { responseModalities: ['IMAGE'] } }) }));
else out.push('Gemini: chưa có khoá');
console.log(out.join('\n'));
