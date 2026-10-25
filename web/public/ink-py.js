// Ink Studio's Python engine inside the browser (a Web Worker running Pyodide): script, storyboard, drawing plan,
// music and sound effects, exactly as the render machines make them. AI questions go to the website with a
// synchronous request (allowed in workers), so the Python code stays the same as on the machines.
/* global loadPyodide */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
let py = null, ready = null, job = '';

async function boot(version) {
  importScripts(PYODIDE + 'pyodide.js');
  py = await loadPyodide({ indexURL: PYODIDE });
  post('log', 'Đang tải thư viện vẽ…');
  await py.loadPackage(['numpy', 'pillow']);
  const res = await fetch('/api/ink/browser/bundle?v=' + encodeURIComponent(version || ''), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Không tải được bộ máy dựng (' + res.status + ')');
  py.unpackArchive(await res.arrayBuffer(), 'gztar', { extractDir: '/home/pyodide/ink' });
  py.runPython(`
import sys, json
sys.path.insert(0, '/home/pyodide/ink')
from js import XMLHttpRequest
from ink import browser as B

def _ask(system, user, temperature, attempt):
    x = XMLHttpRequest.new()
    x.open('POST', '/api/ink/jobs/' + JOB + '/browser/ai', False)
    x.setRequestHeader('content-type', 'application/json'); x.setRequestHeader('x-nv', '1')
    x.send(json.dumps({'system': system, 'user': user, 'temperature': temperature, 'attempt': attempt}, ensure_ascii=False))
    if x.status != 200:
        try: msg = json.loads(x.responseText).get('error', '')
        except Exception: msg = x.responseText[:200]
        raise RuntimeError(msg or ('AI lỗi ' + str(x.status)))
    j = json.loads(x.responseText)
    return j['text'], j['provider'], j['model']

B.use_site(_ask)
`);
}
const post = (type, data) => self.postMessage({ type, data });

self.onmessage = async (e) => {
  const { id, cmd, args } = e.data;
  try {
    if (!ready) ready = boot(args?.version);
    await ready;
    if (args?.job) { job = args.job; py.globals.set('JOB', job); }
    const log = (m) => post('log', String(m));
    py.globals.set('_log', log);
    let out;
    if (cmd === 'init') out = true;
    else if (cmd === 'plan') out = py.runPython('B.plan(_a, log=_log)', { globals: withArgs({ _a: args.input }) });
    else if (cmd === 'timing') out = py.runPython('B.timing(_l, _h, _t)', { globals: withArgs({ _l: args.lines, _h: args.heard, _t: args.total }) });
    else if (cmd === 'drawing') out = py.runPython('B.drawing(_s, _t, _p, _c)', { globals: withArgs({ _s: args.storyboard, _t: args.timing, _p: args.pace, _c: args.captions }) });
    else if (cmd === 'music') { const b = py.runPython('B.music(_s, _m)', { globals: withArgs({ _s: args.seconds, _m: args.mood }) }); out = new Float32Array(b.toJs().buffer); b.destroy?.(); }
    else if (cmd === 'effects') { const b = py.runPython('B.effects(_s, _e)', { globals: withArgs({ _s: args.seconds, _e: args.events }) }); out = new Float32Array(b.toJs().buffer); b.destroy?.(); }
    else throw new Error('Lệnh không hợp lệ: ' + cmd);
    self.postMessage({ id, ok: true, out }, out instanceof Float32Array ? [out.buffer] : []);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err).split('\n').filter(Boolean).slice(-1)[0] || 'Lỗi không rõ' });
  }
};

function withArgs(vals) {
  const g = py.globals.copy ? py.globals.copy() : py.globals;
  for (const [k, v] of Object.entries(vals)) g.set(k, v);
  return g;
}
