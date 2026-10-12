// One-click deployment to Cloudflare (run by the "Triển khai web" GitHub workflow).
// Creates the D1 database and R2 bucket if missing, applies the schema, builds,
// deploys the Worker and uploads its secrets. Safe to run again.
// Needs: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID. Optional secrets:
// GOOGLE_CLIENT_ID, RUNNER_TOKEN, OPENAI_API_KEY, GEMINI_API_KEY.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(fileURLToPath(import.meta.url));
const NAME = 'net-ve-studio';
const wrangler = (args, opts = {}) =>
  execFileSync('npx', ['wrangler', ...args], { cwd: web, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...opts });

for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[k]) { console.error(`Thiếu secret ${k} (xem hướng dẫn triển khai).`); process.exit(1); }
}

// 1. database
const findDb = () => JSON.parse(wrangler(['d1', 'list', '--json'])).find((d) => d.name === NAME);
let db = findDb();
if (!db) { console.log('Tạo cơ sở dữ liệu D1…'); wrangler(['d1', 'create', NAME]); db = findDb(); }
if (!db?.uuid) throw new Error('Không tạo được cơ sở dữ liệu D1.');

// 2. storage
if (!wrangler(['r2', 'bucket', 'list']).includes(NAME)) { console.log('Tạo kho lưu trữ R2…'); wrangler(['r2', 'bucket', 'create', NAME]); }

// 3. config with the real database id (kept out of git)
const base = readFileSync(join(web, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const cfg = JSON.parse(base);
cfg.d1_databases[0].database_id = db.uuid;
const cfgFile = join(web, 'wrangler.deploy.json');
writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

// 4. free workers.dev address: register one if the account has none yet
const cf = async (path, init = {}) => {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    ...init, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
};
let sub = (await cf('/workers/subdomain')).data?.result?.subdomain;
if (!sub) {
  for (const name of [process.env.WORKERS_SUBDOMAIN, 'netve-' + Math.random().toString(36).slice(2, 8)].filter(Boolean)) {
    const r = await cf('/workers/subdomain', { method: 'PUT', body: JSON.stringify({ subdomain: name }) });
    if (r.ok) { sub = r.data.result.subdomain; console.log(`Đã đăng ký tên miền ${sub}.workers.dev`); break; }
    console.log(`Không đăng ký được "${name}": ${JSON.stringify(r.data.errors || []).slice(0, 200)}`);
  }
}
if (!sub) throw new Error('Chưa có tên miền workers.dev. Mở Cloudflare → Workers & Pages để tạo một tên miền, rồi chạy lại.');

// 5. schema (idempotent), build, deploy
wrangler(['d1', 'execute', NAME, '--remote', '--file', 'schema.sql', '-c', cfgFile, '-y']);
execFileSync('node', [join(web, 'build.mjs')], { stdio: 'inherit' });
console.log(wrangler(['deploy', '-c', cfgFile]));

// 6. secrets (only the ones provided)
const secrets = Object.fromEntries(['GOOGLE_CLIENT_ID', 'RUNNER_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY']
  .filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
if (secrets.RUNNER_TOKEN && secrets.RUNNER_TOKEN.length < 32) throw new Error('RUNNER_TOKEN cần ít nhất 32 ký tự.');
if (Object.keys(secrets).length) {
  const f = join(web, '.secrets.tmp.json');
  writeFileSync(f, JSON.stringify(secrets), { mode: 0o600 });
  try { wrangler(['secret', 'bulk', f, '-c', cfgFile]); } finally { rmSync(f, { force: true }); }
  console.log('Đã cài khoá bí mật: ' + Object.keys(secrets).join(', '));
}
console.log(`\nTriển khai xong. Địa chỉ trang web: https://${NAME}.${sub}.workers.dev\n`);
