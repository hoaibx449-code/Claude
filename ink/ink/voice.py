"""EverAI text-to-speech, one clip per scene (everai.vn: create a request, poll it, download the mp3).

Environment: EVERAI_API_KEY, EVERAI_VOICE_CODE (e.g. vi_female_thuytrang_mb), EVERAI_MODEL (default everai-v1.6),
EVERAI_API_URL. Clips are cached by text and settings, so a re-render never pays twice. Without a key (local
tests) a silent clip of the expected length stands in."""
import hashlib, json, os, re, subprocess, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

URL = 'https://www.everai.vn/api/v1/tts'
FAILED = re.compile(r'^(FAILURE|FAILED|ERROR|CANCELED|CANCELLED)$', re.I)


def _find(o, key):
    if isinstance(o, dict):
        if o.get(key) not in (None, ''): return o[key]
        for v in o.values():
            r = _find(v, key)
            if r is not None: return r
    if isinstance(o, list):
        for v in o:
            r = _find(v, key)
            if r is not None: return r
    return None


def _json(req, timeout=30):
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read() or b'{}')


def everai(text, out, voice=None, speed=1.0, timeout=240):
    key = os.environ['EVERAI_API_KEY']; url = os.environ.get('EVERAI_API_URL', URL).rstrip('/')
    headers = {'authorization': 'Bearer ' + key, 'content-type': 'application/json'}
    body = {'response_type': 'indirect', 'input_text': text, 'voice_code': voice or os.environ.get('EVERAI_VOICE_CODE') or 'vi_female_thuytrang_mb',
            'model_id': os.environ.get('EVERAI_MODEL', 'everai-v1.6'), 'audio_type': 'mp3', 'bitrate': 128,
            'speed_rate': round(max(0.5, min(2.0, speed)), 1), 'pitch_rate': 1.0, 'volume': 100}
    cache = os.path.join(os.environ.get('INK_CACHE', '.cache/voice'), hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:24] + '.mp3')
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if not os.path.exists(cache):
        # creating a request is not retried: a lost answer could mean a paid duplicate
        try: j = _json(urllib.request.Request(url, json.dumps(body).encode(), headers))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'EverAI từ chối (HTTP {e.code}): {e.read()[:200].decode("utf-8", "ignore")}')
        if j.get('status') != 1: raise RuntimeError(f'EverAI từ chối: {j.get("error_message") or j.get("message") or j}')
        rid = _find(j.get('result'), 'request_id')
        if not rid: raise RuntimeError('EverAI không trả về request_id')
        t0 = time.time()
        while True:
            if time.time() - t0 > timeout: raise RuntimeError(f'EverAI quá thời gian chờ ({rid})')
            time.sleep(2)
            try: s = _json(urllib.request.Request(f'{url}/{rid}', headers=headers))
            except (urllib.error.URLError, TimeoutError): continue
            if FAILED.match(str(_find(s.get('result', s), 'status') or '')): raise RuntimeError(f'EverAI báo thất bại ({rid}): {_find(s, "error_message")}')
            link = _find(s, 'audio_link')
            if link:
                with urllib.request.urlopen(link, timeout=60) as r: data = r.read()
                open(cache, 'wb').write(data); break
    with open(cache, 'rb') as a, open(out, 'wb') as b: b.write(a.read())
    return out


def silent(text, out, wps=2.8):
    secs = max(1.2, len(re.findall(r'\w+', text)) / wps)
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=mono', '-t', f'{secs:.2f}', '-q:a', '6', out])
    return out


def synth_all(texts, folder, voice=None, speed=1.0, log=print):
    os.makedirs(folder, exist_ok=True)
    use = bool(os.environ.get('EVERAI_API_KEY'))
    if not use: log('  (chưa có EVERAI_API_KEY: dùng âm thanh im lặng để thử hình)')
    def one(i):
        out = os.path.join(folder, f's{i:03d}.mp3')
        return everai(texts[i], out, voice, speed) if use else silent(texts[i], out)
    with ThreadPoolExecutor(4) as ex: outs = list(ex.map(one, range(len(texts))))
    log(f'  giọng đọc: {len(outs)} đoạn')
    return outs
