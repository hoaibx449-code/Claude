// End-to-end test of "Dựng trên máy này": a local copy of the website (wrangler dev), real Chrome, real AI and voice.
// Creates a video in browser mode, lets the page do everything (Pyodide engine, voice, drawing, encoding, upload)
// and saves what came out to OUT. Run by .github/workflows/ink-browser-test.yml.
const { chromium } = require('playwright'); const fs = require('fs');
const B = process.env.SITE || 'http://localhost:8799', OUT = process.env.OUT || 'out', TOPIC = process.env.TOPIC || 'Vì sao hoàng hôn lại đỏ?';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: process.env.CHANNEL || 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: process.env.UA || undefined });
  const pg = await ctx.newPage(); const log = []; const t0 = Date.now();
  pg.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`)); pg.on('pageerror', (e) => log.push('[pageerror] ' + e.message));
  const call = (path, body, method) => pg.evaluate(async ([p, b, m]) => { const r = await fetch(p, { method: m || (b ? 'POST' : 'GET'), headers: { 'x-nv': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, j: await r.json().catch(() => null) }; }, [path, body, method]);
  await pg.goto(B + '/');
  console.log('login', (await call('/api/auth/dev', { email: 'tester@localhost', consent: true })).status);
  const st = (await call('/api/admin/ink')).j.settings; st.machines.on.browser = true; st.voice.fallback = true;
  console.log('settings', (await call('/api/admin/ink', { settings: st }, 'PUT')).status);
  const caps = await pg.evaluate(async () => ({ avc: (await VideoEncoder.isConfigSupported({ codec: 'avc1.42e028', width: 720, height: 1280, bitrate: 3e6, framerate: 30 })).supported,
    aac: (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 160000 })).supported,
    opus: (await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 })).supported }));
  console.log('device', JSON.stringify(caps));
  const made = await call('/api/ink/jobs', { mode: 'topic', topic: TOPIC, seconds: 45, pace: 'normal', browser: true });
  console.log('create', made.status, JSON.stringify(made.j)); const id = made.j.id;
  await pg.goto(B + '/ink/' + id);
  const go = await pg.waitForSelector('button:has-text("Bắt đầu dựng trên máy này")', { timeout: 60000 });
  await pg.screenshot({ path: OUT + '/start.png' });
  await go.click();
  let last = '';
  for (;;) {
    await pg.waitForTimeout(5000);
    const s = await pg.evaluate(() => (document.querySelector('.ink-progress p.muted') || {}).textContent || '');
    if (s !== last) { console.log(Math.round((Date.now() - t0) / 1000) + 's', s); last = s; }
    if (await pg.$('video.ink-player')) break;
    if (/Đã dừng/.test(s) || Date.now() - t0 > 25 * 60000) { await pg.screenshot({ path: OUT + '/stopped.png' }); throw new Error('stopped: ' + s); }
  }
  console.log('done in', Math.round((Date.now() - t0) / 1000), 's');
  await pg.screenshot({ path: OUT + '/done.png' });
  const job = (await call('/api/ink/jobs/' + id)).j.job; fs.writeFileSync(OUT + '/job.json', JSON.stringify(job, null, 1));
  const sb = (await call(`/api/ink/jobs/${id}/storyboard?full=1`)).j.storyboard; fs.writeFileSync(OUT + '/storyboard.json', JSON.stringify(sb, null, 1));
  for (const f of ['video.mp4', 'cover.jpg']) {
    const b64 = await pg.evaluate(async (u) => { const a = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 32768) s += String.fromCharCode(...a.subarray(i, i + 32768)); return btoa(s); }, `/api/ink/jobs/${id}/file/${f}`);
    fs.writeFileSync(OUT + '/' + f, Buffer.from(b64, 'base64'));
  }
  fs.writeFileSync(OUT + '/console.log', log.join('\n')); await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
