"""The render machine for the website: takes queued Ink jobs from the site, makes them, sends the results back.

  NV_API_URL=https://faciup.id.vn RUNNER_TOKEN=... python -m ink.site [--once]

A job is either 'plan' (script, storyboard, cover; then the video too unless the user wants to review the
storyboard first) or 'render' (an approved or re-paced storyboard to video, no AI call). The site hands
the AI order, models, voice and keys with each job (admin settings), so nothing is configured here."""
import json, os, socket, subprocess, sys, tempfile, threading, time, traceback, urllib.request, urllib.error
from . import ai
from .cli import make_plan, make_video, save_plan

API = os.environ.get('NV_API_URL', '').rstrip('/')
TOKEN = os.environ.get('RUNNER_TOKEN', '')
BASE = '/api/ink-runner/'


class Lost(Exception):
    """the site gave the job to someone else (the lease ran out)"""


def call(path, data=None, method=None, body=None, ctype=None, lease='', timeout=60, raw=False):
    # Cloudflare turns away the default Python-urllib signature (error 1010)
    headers = {'authorization': 'Bearer ' + TOKEN, 'user-agent': 'faciup-ink-runner/1.0 (+github-actions)', 'accept': 'application/json'}
    if lease: headers['x-nv-lease'] = lease
    if data is not None: body = json.dumps(data).encode(); ctype = 'application/json'
    if ctype: headers['content-type'] = ctype
    req = urllib.request.Request(API + BASE + path, body, headers, method=method or ('POST' if body is not None else 'GET'))
    for k in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read(); return b if raw else json.loads(b or b'{}')
        except urllib.error.HTTPError as e:
            if e.code == 409: raise Lost(e.read()[:200].decode('utf-8', 'replace'))
            if e.code < 500 or path == 'claim': raise RuntimeError(f'{path}: HTTP {e.code} {e.read()[:200].decode("utf-8", "replace")}')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if path == 'claim': raise RuntimeError(f'{path}: {e}')
        time.sleep(2 * 2 ** k)
    raise RuntimeError(f'{path}: trang web không phản hồi')


def run(job):
    jid, lease = job['id'], job['lease']; inp = job.get('input') or {}
    cfg = {k: str(v) for k, v in (job.get('config') or {}).get('env', {}).items() if v not in (None, '')}
    if os.environ.get('GITHUB_ACTIONS'):  # keys from the site never show in the public run log
        for k, v in cfg.items():
            if k.endswith('_API_KEY'): print('::add-mask::' + v, flush=True)
    os.environ.update(cfg)
    state = {'progress': 2, 'message': 'Chuẩn bị'}; stop = threading.Event()
    def report():
        try: call(f'jobs/{jid}/progress', state, lease=lease, timeout=20)
        except Lost: stop.set()
        except Exception as e: print('progress:', e, flush=True)  # noqa: BLE001
    def beat():
        while not stop.wait(45): report()
    threading.Thread(target=beat, daemon=True).start()
    steps = {'1/4': 8, '2/4': 14, '3/4': 24, '4/4': 30, 'Phân cảnh': 36, 'Giọng': 45, 'Dựng video': 52}
    scene = [0]
    def log(m):
        print(m, flush=True)
        for k, v in steps.items():
            if m.strip().startswith(k): state.update(progress=v, message=m.strip()[:120]); report(); return
        if m.startswith('cảnh '):
            try: a, b = m.split()[1].split('/'); state.update(progress=52 + int(43 * int(a) / int(b)), message=f'Đang vẽ cảnh {a}/{b}')
            except ValueError: return
            scene[0] += 1
            if scene[0] % 4 == 0: report()
    out = tempfile.mkdtemp(prefix='ink-' + jid + '-'); t0 = time.time()
    try:
        if job['stage'] == 'plan':
            sb = make_plan(out, inp.get('topic') if inp.get('mode') != 'script' else None, inp.get('script') if inp.get('mode') == 'script' else None,
                           int(inp.get('seconds') or 60), inp.get('audience', ''), tone=inp.get('tone') or 'tự nhiên, hợp với chủ đề và người xem',
                           notes=inp.get('notes', ''), pace=inp.get('pace', 'normal'), log=log)
            for name in ('overview.png', 'cover.jpg'): put(jid, lease, out, name)
            nxt = call(f'jobs/{jid}/planned', {'storyboard': sb, 'ai': [f'{p}/{m}' for p, m in ai.used]}, lease=lease)
            if not nxt.get('render'): return True
        else:
            sb = job['storyboard']; save_plan(sb, out)
            put(jid, lease, out, 'cover.jpg')
        music = None
        if inp.get('music'):
            music = os.path.join(out, 'music.' + (inp.get('musicExt') or 'mp3'))
            try: open(music, 'wb').write(call(f'jobs/{jid}/music', lease=lease, raw=True, timeout=120))
            except Exception as e: log(f'  bỏ nhạc riêng ({e}), dùng nhạc tự tạo'); music = None  # noqa: BLE001
        browser = bool(inp.get('browser'))
        total, provider = make_video(sb, out, inp.get('pace', 'normal'), music, inp.get('mood') or 'auto', float(inp.get('musicVolume') or 0.2),
                                     inp.get('captions', True) is not False, log, browser=browser,
                                     seconds=0 if inp.get('mode') == 'script' else int(inp.get('seconds') or 0))
        if browser:
            # the user's own device draws the frames: hand over the drawing plan and the sound
            state.update(progress=60, message='Gửi bản vẽ cho trình duyệt'); report()
            put(jid, lease, out, 'draw.json', timeout=300); put(jid, lease, out, 'audio.aac', timeout=300)
            call(f'jobs/{jid}/exported', {'duration': round(total, 1), 'voice': provider, 'ai': [f'{p}/{m}' for p, m in ai.used]}, lease=lease)
            print(f'Xong phần máy dựng của {jid}: chờ trình duyệt vẽ ({total:.1f} giây video)', flush=True)
            return True
        state.update(progress=96, message='Lưu video'); report()
        video = os.path.join(out, 'video.mp4'); thumb = os.path.join(out, 'thumb.jpg')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, 'cover.jpg'), '-vf', 'scale=360:-2', thumb], check=False)
        put(jid, lease, out, 'video.mp4', timeout=600)
        if os.path.exists(thumb): put(jid, lease, out, 'thumb.jpg')
        call(f'jobs/{jid}/done', {'duration': round(total, 1), 'seconds': round(time.time() - t0), 'voice': provider, 'ai': [f'{p}/{m}' for p, m in ai.used]}, lease=lease)
        print(f'Xong {jid}: {total:.1f} giây video trong {time.time() - t0:.0f} giây', flush=True)
        return True
    except Lost as e:
        print(f'Mất lượt dựng {jid}: {e}', flush=True); return False
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        try: call(f'jobs/{jid}/fail', {'error': str(e)[:300]}, lease=lease)
        except Exception: pass  # noqa: BLE001
        return False
    finally:
        stop.set(); ai.used.clear()
        subprocess.run(['rm', '-rf', out], check=False)


def put(jid, lease, out, name, timeout=120):
    types = {'mp4': 'video/mp4', 'jpg': 'image/jpeg', 'png': 'image/png', 'json': 'application/json', 'aac': 'audio/aac'}
    with open(os.path.join(out, name), 'rb') as f:
        call(f'jobs/{jid}/file/{name}', method='PUT', body=f.read(), ctype=types[name.rsplit('.', 1)[1]], lease=lease, timeout=timeout)


def where():
    """which kind of machine this is: GitHub Actions, a Cloud Run job, or an always-on server"""
    if os.environ.get('GITHUB_ACTIONS'): return 'github'
    if os.environ.get('CLOUD_RUN_JOB'): return 'cloudrun'
    return 'server'


def main():
    """--loop: an always-on server (polls the site every few seconds, restarts itself when the site has newer code);
    otherwise take every queued job and stop (GitHub Actions, Cloud Run jobs)."""
    if not API or not TOKEN: sys.exit('Cần NV_API_URL và RUNNER_TOKEN')
    once, loop = '--once' in sys.argv, '--loop' in sys.argv
    kind = where(); host = socket.gethostname()[:40]
    name = os.environ.get('INK_RUNNER_NAME') or f'{kind}-{host}'
    mine = os.environ.get('INK_VERSION', '')  # set by the server's update script
    ok = True; started = idle = time.time(); fails = 0
    while loop or time.time() - started < 5.5 * 3600:  # GitHub stops a job at 6 hours
        try: got = call('claim', {'runner': name, 'kind': kind, 'host': host, 'version': mine}); fails = 0
        except Exception as e:  # noqa: BLE001
            if not loop: raise
            fails += 1; print('Chưa kết nối được trang:', e, flush=True); time.sleep(min(300, 10 * fails)); continue
        job = got.get('job')
        if not job:
            if loop:
                # newer code on the site: exit so the service restarts and updates (only when idle)
                if mine and got.get('version') and got['version'] != mine: print('Có bản máy dựng mới, khởi động lại để cập nhật.', flush=True); sys.exit(0)
                time.sleep(8); continue
            # someone is reviewing a storyboard: wait (up to 20 minutes) so the video starts the moment they approve
            if got.get('review') and time.time() - idle < 20 * 60: time.sleep(15); continue
            break
        idle = time.time()
        ok = run(job) and ok
        if once: break
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
