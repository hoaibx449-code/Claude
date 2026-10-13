// Uploaded pictures (reference character, product photos), video playback with seeking,
// and the community gallery of videos people chose to share.
import type { User } from './auth.ts';
import { body, type Env, HttpError, json, sha256, useQuota } from './util.ts';
import { vis } from './settings.ts';
import type { Rc, XEnv } from './worker.ts';

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_UPLOAD = 5 * 1024 * 1024;

/** Each claim writes its own objects, so a stale worker cannot overwrite a retry. */
export function videoKey(userId: string, jobId: string, ext: 'mp4' | 'srt', lease?: string | null) {
  return /^lease-[a-f0-9]{32}$/.test(lease || '')
    ? `video/${userId}/${jobId}/${lease}.${ext}` : `video/${userId}/${jobId}.${ext}`;
}

export async function storedVideoKey(env: Env, userId: string, jobId: string, ext: 'mp4' | 'srt') {
  const job = await env.DB.prepare("SELECT runner FROM jobs WHERE id = ? AND user_id = ? AND status = 'done'").bind(jobId, userId).first<any>();
  if (!job) throw new HttpError(404, 'Video chưa sẵn sàng.');
  return videoKey(userId, jobId, ext, job.runner);
}

export async function deleteVideo(env: Env, userId: string, jobId: string) {
  await env.BUCKET.delete([videoKey(userId, jobId, 'mp4'), videoKey(userId, jobId, 'srt')]);
  let cursor: string | undefined;
  do {
    const result = await env.BUCKET.list({ prefix: `video/${userId}/${jobId}/`, cursor });
    if (result.objects.length) await env.BUCKET.delete(result.objects.map((o) => o.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
}

/** Store a picture the user picked; the same picture always gets the same key. */
export async function upload(req: Request, env: XEnv, rc: Rc, user: User) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  const ext = TYPES[type];
  if (!ext) throw new HttpError(415, 'Chỉ nhận ảnh PNG, JPG hoặc WebP.');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 100 || bytes.length > MAX_UPLOAD) throw new HttpError(413, 'Ảnh cần nhỏ hơn 5 MB.');
  // the bytes must really be that kind of picture
  const sig = (a: number[]) => a.every((b, i) => bytes[i] === b);
  const real = ext === 'png' ? sig([0x89, 0x50, 0x4e, 0x47]) : ext === 'jpg' ? sig([0xff, 0xd8, 0xff]) : sig([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57;
  if (!real) throw new HttpError(415, 'Tệp không phải ảnh hợp lệ.');
  await useQuota(env, user.id, 'upload', 60);
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const key = `up/${user.id}/${hex}.${ext}`;
  if (!(await env.BUCKET.head(key))) await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  rc.log('media.upload', { data: { key, bytes: bytes.length, type } });
  return json({ ref: 'r2:' + key, url: '/api/media/' + key });
}

const SITE_TYPES: Record<string, string> = { ...TYPES, 'video/mp4': 'mp4', 'video/webm': 'webm' };
const SITE_MAX = 60 * 1024 * 1024;
export const siteType = (ext: string) => Object.entries(SITE_TYPES).find(([, e]) => e === ext)?.[0] || 'application/octet-stream';

/** Admin upload of a home page picture or sample video. Returns the "site:" reference stored in settings. */
export async function uploadSite(req: Request, env: XEnv, rc: Rc) {
  const type = (req.headers.get('content-type') || '').split(';')[0].trim();
  const ext = SITE_TYPES[type];
  if (!ext) throw new HttpError(415, 'Chỉ nhận ảnh PNG/JPG/WebP hoặc video MP4/WebM.');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 100 || bytes.length > SITE_MAX) throw new HttpError(413, 'Tệp cần nhỏ hơn 60 MB.');
  const sig = (a: number[], at = 0) => a.every((b, i) => bytes[at + i] === b);
  const real = ext === 'png' ? sig([0x89, 0x50, 0x4e, 0x47]) : ext === 'jpg' ? sig([0xff, 0xd8, 0xff]) : ext === 'webp' ? sig([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57
    : ext === 'mp4' ? sig([0x66, 0x74, 0x79, 0x70], 4) : sig([0x1a, 0x45, 0xdf, 0xa3]);
  if (!real) throw new HttpError(415, 'Nội dung tệp không khớp định dạng.');
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const key = `site/${hex}.${ext}`;
  if (!(await env.BUCKET.head(key))) await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  rc.log('admin.site.upload', { data: { key, bytes: bytes.length, type } });
  return json({ ref: `site:${hex}.${ext}`, url: `/api/site/${hex}.${ext}` });
}

/** An R2 object with HTTP range support (videos can be scrubbed and start playing at once). */
export async function serveObject(env: Env, req: Request, key: string, type: string, headers: Record<string, string> = {}) {
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const head = await env.BUCKET.head(key);
    if (!head) throw new HttpError(404, 'Không tìm thấy tệp.');
    const size = head.size;
    let start = range[1] ? Number(range[1]) : size - Number(range[2] || 0), end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1]) end = size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const obj = await env.BUCKET.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) throw new HttpError(404, 'Không tìm thấy tệp.');
    return new Response(obj.body, { status: 206, headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1), ...headers } });
  }
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new HttpError(404, 'Không tìm thấy tệp.');
  return new Response(obj.body, { headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(obj.size), ...headers } });
}

// ---------------------------------------------------------------- community
const name = (u: { name: string | null; email: string }) => (u.name || u.email.split('@')[0]).slice(0, 40);

export async function communityPublic(req: Request, env: XEnv, rc: Rc, path: string, user: User | null): Promise<Response | null> {
  if (!path.startsWith('/api/community')) return null;
  if (vis(env.config, 'feature:community') !== 'on') throw new HttpError(404, 'Cộng đồng đang tắt.');
  const url = new URL(req.url);
  if (path === '/api/community' && req.method === 'GET') {
    rc.quiet = true;
    const sort = url.searchParams.get('sort') === 'top' ? 'likes DESC, created_at DESC' : 'created_at DESC';
    const before = Number(url.searchParams.get('before')) || Date.now() + 1;
    const rows = (await env.DB.prepare(`SELECT job_id, title, author, style, mode, ratio, created_at, likes, views FROM community WHERE hidden = 0 AND created_at < ? ORDER BY ${sort} LIMIT 24`).bind(before).all<any>()).results;
    let liked: string[] = [];
    if (user && rows.length) liked = (await env.DB.prepare(`SELECT job_id FROM community_likes WHERE user_id = ? AND job_id IN (${rows.map(() => '?').join(',')})`).bind(user.id, ...rows.map((r) => r.job_id)).all<any>()).results.map((r) => r.job_id);
    return json({ videos: rows.map((r) => ({ ...r, liked: liked.includes(r.job_id) })) });
  }
  const m = path.match(/^\/api\/community\/([a-f0-9]{24})\/(video|like|view)$/);
  if (!m) throw new HttpError(404, 'Không tìm thấy.');
  const row = await env.DB.prepare('SELECT user_id FROM community WHERE job_id = ? AND hidden = 0').bind(m[1]).first<any>();
  if (!row) throw new HttpError(404, 'Video không còn trong cộng đồng.');
  if (m[2] === 'video' && req.method === 'GET') {
    rc.quiet = true;
    return serveObject(env, req, await storedVideoKey(env, row.user_id, m[1], 'mp4'), 'video/mp4', { 'cache-control': 'public, max-age=3600' });
  }
  if (m[2] === 'view' && req.method === 'POST') {
    rc.quiet = true;
    await env.DB.prepare('UPDATE community SET views = views + 1 WHERE job_id = ?').bind(m[1]).run();
    return json({ ok: true });
  }
  if (m[2] === 'like' && req.method === 'POST') {
    if (!user) throw new HttpError(401, 'Đăng nhập để thả tim.');
    await useQuota(env, user.id, 'like', 300);
    const on = (await body<any>(req, 200)).on !== false;
    const r = on
      ? await env.DB.prepare('INSERT OR IGNORE INTO community_likes (job_id, user_id) VALUES (?, ?)').bind(m[1], user.id).run()
      : await env.DB.prepare('DELETE FROM community_likes WHERE job_id = ? AND user_id = ?').bind(m[1], user.id).run();
    if (r.meta.changes) await env.DB.prepare(`UPDATE community SET likes = MAX(0, likes ${on ? '+' : '-'} 1) WHERE job_id = ?`).bind(m[1]).run();
    rc.log('community.like', { data: { job: m[1], on } });
    const n = await env.DB.prepare('SELECT likes FROM community WHERE job_id = ?').bind(m[1]).first<any>();
    return json({ likes: n?.likes || 0, liked: on });
  }
  throw new HttpError(405, 'Không hỗ trợ.');
}

/** The owner shares a finished video with the community, or takes it back. */
export async function shareToCommunity(req: Request, env: XEnv, rc: Rc, user: User, jobId: string) {
  if (vis(env.config, 'feature:community') !== 'on') throw new HttpError(403, 'Cộng đồng đang tắt.');
  const job = await env.DB.prepare("SELECT id, project_id, spec FROM jobs WHERE id = ? AND user_id = ? AND status = 'done'").bind(jobId, user.id).first<any>();
  if (!job) throw new HttpError(404, 'Video chưa sẵn sàng.');
  const on = (await body<any>(req, 200)).on !== false;
  if (on) {
    const spec = JSON.parse(job.spec);
    await env.DB.prepare(`INSERT INTO community (job_id, user_id, project_id, title, author, style, mode, ratio, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (job_id) DO UPDATE SET title = excluded.title`).bind(job.id, user.id, job.project_id, String(spec.title || 'Video').slice(0, 100), name(user), spec.style || null, spec.mode || 'hand', spec.ratio || '9:16', Date.now()).run();
  } else await env.DB.batch([env.DB.prepare('DELETE FROM community WHERE job_id = ? AND user_id = ?').bind(job.id, user.id), env.DB.prepare('DELETE FROM community_likes WHERE job_id = ?').bind(job.id)]);
  rc.log('community.share', { projectId: job.project_id, data: { job: job.id, on } });
  return json({ shared: on });
}

export async function communityAdmin(req: Request, env: XEnv, sub: string, method: string, rc: Rc): Promise<Response | null> {
  if (sub === 'community' && method === 'GET') {
    const rows = (await env.DB.prepare('SELECT c.*, u.email FROM community c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT 300').all<any>()).results;
    return json({ videos: rows });
  }
  const m = sub.match(/^community\/([a-f0-9]{24})\/(hide|show|delete)$/);
  if (m && method === 'POST') {
    if (m[2] === 'delete') await env.DB.batch([env.DB.prepare('DELETE FROM community WHERE job_id = ?').bind(m[1]), env.DB.prepare('DELETE FROM community_likes WHERE job_id = ?').bind(m[1])]);
    else await env.DB.prepare('UPDATE community SET hidden = ? WHERE job_id = ?').bind(m[2] === 'hide' ? 1 : 0, m[1]).run();
    rc.log('admin.community', { data: { job: m[1], action: m[2] } });
    return json({ ok: true });
  }
  if (sub === 'community/video' && method === 'GET') {
    const id = new URL(req.url).searchParams.get('job') || '';
    const row = await env.DB.prepare('SELECT user_id FROM community WHERE job_id = ?').bind(id).first<any>();
    if (!row) throw new HttpError(404, 'Không tìm thấy.');
    return serveObject(env, req, await storedVideoKey(env, row.user_id, id, 'mp4'), 'video/mp4', { 'cache-control': 'private, max-age=600' });
  }
  return null;
}

// ---------------------------------------------------------------- what a new project gets
const BADGE: Record<string, string> = { listicle: 'TOP', howto: 'MẸO HAY', story: 'CÂU CHUYỆN', compare: 'SO SÁNH', data: 'SỐ LIỆU', sales: 'HOT', motivation: 'ĐỘNG LỰC', qa: 'HỎI ĐÁP', news: 'TIN NÓNG', explainer: 'GIẢI THÍCH' };

/** Opening title card (also the thumbnail): the title, a badge for the kind of video, the first icon of the script. */
export function introFor(spec: any) {
  const icon = spec.scenes.flatMap((sc: any) => sc.diagram?.items || []).find((it: any) => it.t === 'icon')?.name;
  const hook = String(spec.scenes[0]?.lines?.[0] || '');
  return { title: String(spec.title || hook).slice(0, 90), badge: BADGE[spec.format] || 'MỚI', icon, sub: hook && hook !== spec.title && hook.length <= 70 ? hook : undefined };
}

/** Last scene of an affiliate video: product picture, price, QR code of the link and a call to buy. */
export function affiliateScene(a: { link: string; product?: string; price?: string; image?: string }, portrait: boolean) {
  const product = a.product || 'sản phẩm này';
  const items: any[] = [
    { t: 'text', text: a.price ? `Chỉ ${a.price}` : 'Ưu đãi hôm nay', x: 50, y: portrait ? 8 : 10, size: 'xl', color: 'accent', line: 0 },
  ];
  if (a.image) items.push({ t: 'image', src: a.image, x: portrait ? 50 : 30, y: portrait ? 36 : 52, w: portrait ? 62 : 34, shape: 'rounded', label: a.product, line: 0, id: 'sp' });
  items.push({ t: 'qr', text: a.link, x: portrait ? 50 : 74, y: portrait ? (a.image ? 78 : 50) : 50, w: portrait ? 34 : 24, label: 'Quét để mua', line: 1, id: 'qr' });
  if (a.image) items.push({ t: 'arrow', from: 'sp', to: 'qr', line: 1, color: 'accent2' });
  return { lines: [`${product[0].toUpperCase()}${product.slice(1)}${a.price ? ` đang có giá ${a.price}` : ''}.`, 'Quét mã hoặc bấm link trong phần mô tả để mua ngay nhé!'], diagram: { kind: 'sketch', items } };
}
