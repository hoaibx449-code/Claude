#!/usr/bin/env node
// Render scene.html (three.js) thành film.mp4 16:9 theo từng khung, tất định.
//   node render_scene.js --dir work/ [--out work/film.mp4] [--w 1280 --h 720 --fps 30] [--from 0 --to 10] [--still 3.2,8,15]
// work/ cần: scene.html, world.json, timeline.json, storyboard.json. kit.js + three được phục vụ từ thư mục engine.
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const DIR = path.resolve(args.dir || '.'), ENG = __dirname;
const W = +(args.w || 1280), H = +(args.h || 720), FPS = +(args.fps || 30);
const OUT = path.resolve(args.out || path.join(DIR, 'film.mp4'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const cands = [path.join(DIR, u), path.join(ENG, u)];
      if (u.startsWith('/node_modules/')) cands.push(path.join(ENG, u), path.join(process.cwd(), u));
      const f = cands.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!f) { rsp.writeHead(404); return rsp.end('404 ' + u); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/scene.html`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }); }
  catch (e) { console.error('Cảnh không sẵn sàng. Lỗi trang:\n' + errs.join('\n')); process.exit(1); }
  const dur = await page.evaluate(() => window.__duration);

  if (args.still) { // chụp vài khung để soát nhanh
    for (const t of args.still.split(',').map(Number)) {
      await page.evaluate(t => window.__seek(t), t);
      const p = path.join(DIR, `still_${t}.jpg`); await page.screenshot({ path: p, type: 'jpeg', quality: 85 }); console.log(p);
    }
    await browser.close(); srv.close(); return;
  }
  const t0 = +(args.from || 0), t1 = Math.min(+(args.to || dur), dur);
  const n = Math.round((t1 - t0) * FPS);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.__seek(t), t0 + i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % (FPS * 5) === 0) process.stdout.write(`\r${i}/${n} khung · ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  if (errs.length) console.error('\nCảnh báo lỗi trang:\n' + errs.slice(0, 5).join('\n'));
  console.log(`\nXong ${OUT} — ${n} khung, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  await browser.close(); srv.close();
})();
