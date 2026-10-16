// Local API integration check. No paid AI or external messages.
import assert from 'node:assert/strict';
const base = process.env.NV_API_URL || 'http://127.0.0.1:8787';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local development only.');
let cookie = '';
async function request(path, method = 'GET', body) {
  const r = await fetch(base + path, { method, headers: { 'x-nv': '1', origin: base, ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  cookie = r.headers.get('set-cookie')?.split(';')[0] || cookie;
  const data = await r.json();
  return { status: r.status, ...data };
}
await request('/api/auth/dev', 'POST', { consent: true, email: `director-check-${Date.now()}@localhost` });
const made = await request('/api/projects/generate', 'POST', { source: 'mine-free', look: 'auto', topic: 'AI chọn thương hiệu. Khách hàng chọn bạn.\n\nĐầu tiên làm rõ dữ liệu. Tiếp theo lắng nghe khách hàng.', voiceId: 'free-female', intro: false });
assert.equal(made.status, 200, JSON.stringify(made)); assert.equal(made.spec.look, 'director');
const original = made.spec.scenes.map((s) => s.lines);
const fetched = await request('/api/projects/' + made.id);
const edited = structuredClone(fetched.spec); edited.scenes[0].direction.title = 'Tiêu đề do tôi chọn';
const saved = await request('/api/projects/' + made.id, 'PUT', { spec: edited, expectedUpdatedAt: fetched.updated_at });
assert.equal(saved.status, 200); assert.equal(saved.spec.scenes[0].direction.title, 'Tiêu đề do tôi chọn');
const stale = await request('/api/projects/' + made.id, 'PUT', { spec: fetched.spec, expectedUpdatedAt: fetched.updated_at });
assert.equal(stale.status, 409);
const recomposed = await request('/api/projects/' + made.id + '/compose', 'POST', { scene: 0 });
assert.equal(recomposed.status, 200); assert.deepEqual(recomposed.spec.scenes.map((s) => s.lines), original);
const now = await request('/api/projects/' + made.id);
const invalidReview = await request('/api/projects/' + made.id + '/review-direction', 'POST', { frames: [], updatedAt: now.updated_at - 1 });
assert.equal(invalidReview.status, 409);
const foreign = await fetch(base + '/api/projects/' + made.id + '/review-direction', { method: 'POST', headers: { 'x-nv': '1', 'content-type': 'application/json', origin: base }, body: '{}' });
assert.equal(foreign.status, 401);
console.log('PASS local API: auto selects director, graph edits persist, compose preserves narration, stale writes/reviews are rejected, anonymous review denied.');
console.log('Preview project: ' + base + '/#/p/' + made.id);
