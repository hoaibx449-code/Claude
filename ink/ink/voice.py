"""Narration read in one go (no gaps between lines, so the video flows), then timed word by word.

Providers (INK_VOICE_PROVIDER):
  everai     EverAI (everai.vn): EVERAI_API_KEY, EVERAI_VOICE_CODE, EVERAI_MODEL, EVERAI_API_URL
  microsoft  the free Microsoft neural voices (edge-tts): INK_MS_VOICE (vi-VN-HoaiMyNeural | vi-VN-NamMinhNeural)
INK_VOICE_FALLBACK=1 (default) switches to the other provider when the first fails. INK_VOICE_RATE e.g. +8%.

Timing: Microsoft reports when each word is spoken. For EverAI the text is aligned to the audio with
faster-whisper (word timestamps) when it is installed, otherwise the line breaks are snapped to the pauses
ffmpeg hears. Either way every line gets a start and end, and every word a time for captions."""
import asyncio, difflib, hashlib, json, os, re, subprocess, time, urllib.request, urllib.error

EVERAI_URL = 'https://www.everai.vn/api/v1/tts'
FAILED = re.compile(r'^(FAILURE|FAILED|ERROR|CANCELED|CANCELLED)$', re.I)
CACHE = lambda: os.environ.get('INK_CACHE', '.cache/voice')


def norm(w): return re.sub(r'[^\w]', '', w.lower())
def duration(path): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))


# ---------------- EverAI ----------------
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

def everai_clip(text, out, timeout=300):
    key = os.environ['EVERAI_API_KEY']; url = os.environ.get('EVERAI_API_URL', EVERAI_URL).rstrip('/')
    headers = {'authorization': 'Bearer ' + key, 'content-type': 'application/json'}
    rate = os.environ.get('INK_VOICE_RATE', '+8%'); speed = 1 + int(re.sub(r'[^\d-]', '', rate) or 0) / 100
    body = {'response_type': 'indirect', 'input_text': text, 'voice_code': os.environ.get('EVERAI_VOICE_CODE') or 'vi_female_thuytrang_mb',
            'model_id': os.environ.get('EVERAI_MODEL', 'everai-v1.6'), 'audio_type': 'mp3', 'bitrate': 128,
            'speed_rate': round(max(0.5, min(2.0, speed)), 1), 'pitch_rate': 1.0, 'volume': 100}
    cache = os.path.join(CACHE(), 'e-' + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:24] + '.mp3')
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    if not os.path.exists(cache):
        # creating a request is not retried: a lost answer could mean a paid duplicate
        try: j = _json(urllib.request.Request(url, json.dumps(body).encode(), headers))
        except urllib.error.HTTPError as e: raise RuntimeError(f'EverAI từ chối (HTTP {e.code})')
        if j.get('status') != 1: raise RuntimeError(f'EverAI từ chối: {j.get("error_message") or j.get("message") or j}')
        rid = _find(j.get('result'), 'request_id')
        if not rid: raise RuntimeError('EverAI không trả về request_id')
        t0 = time.time()
        while True:
            if time.time() - t0 > timeout: raise RuntimeError(f'EverAI quá thời gian chờ ({rid})')
            time.sleep(2)
            try: s = _json(urllib.request.Request(f'{url}/{rid}', headers=headers))
            except (urllib.error.URLError, TimeoutError): continue
            if FAILED.match(str(_find(s.get('result', s), 'status') or '')): raise RuntimeError(f'EverAI báo thất bại ({rid})')
            link = _find(s, 'audio_link')
            if link:
                with urllib.request.urlopen(link, timeout=60) as r: open(cache, 'wb').write(r.read())
                break
    with open(cache, 'rb') as a, open(out, 'wb') as b: b.write(a.read())
    return out


def everai_all(text, out):
    """EverAI takes up to 5000 characters a request; longer narrations go in paragraph chunks, joined"""
    chunks, cur = [], ''
    for sent in re.split(r'(?<=[.!?…])\s+', text):
        if cur and len(cur) + len(sent) + 1 > 4500: chunks.append(cur); cur = sent
        else: cur = (cur + ' ' + sent).strip()
    if cur: chunks.append(cur)
    if len(chunks) == 1: return everai_clip(chunks[0], out)
    parts = [everai_clip(c, f'{out}.{i}.mp3') for i, c in enumerate(chunks)]
    lst = out + '.txt'; open(lst, 'w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    subprocess.check_call(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', out])
    return out


# ---------------- Microsoft (edge-tts) ----------------
def microsoft_all(text, out):
    import edge_tts
    voice = os.environ.get('INK_MS_VOICE', 'vi-VN-HoaiMyNeural'); rate = os.environ.get('INK_VOICE_RATE', '+8%')
    words = []
    async def run():
        c = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary')
        with open(out, 'wb') as f:
            async for ch in c.stream():
                if ch['type'] == 'audio': f.write(ch['data'])
                elif ch['type'] == 'WordBoundary':
                    words.append((ch['text'], ch['offset'] / 1e7, (ch['offset'] + ch['duration']) / 1e7))
    asyncio.run(run())
    return out, words


# ---------------- timing ----------------
def whisper_words(audio):
    try: from faster_whisper import WhisperModel
    except ImportError: return None
    import numpy as np
    model = WhisperModel(os.environ.get('INK_WHISPER_MODEL', 'small'), device='cpu', compute_type='int8')
    # decoded by ffmpeg, not by faster-whisper's own PyAV reader (newer PyAV refuses its arguments)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    segs, _ = model.transcribe(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768, language='vi', word_timestamps=True, vad_filter=False, beam_size=1)
    return [(w.word.strip(), w.start, w.end) for s in segs for w in (s.words or [])]


def align(lines, heard, total):
    """map every script word to a time using the words heard (Microsoft boundaries or Whisper), matched as
    sequences so a few misheard words do not matter; unmatched words are interpolated"""
    script = [(i, w) for i, l in enumerate(lines) for w in l.split()]
    a = [norm(w) for _, w in script]; b = [norm(w) for w, _, _ in heard]
    t = [None] * len(script)
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size): t[blk.a + k] = (heard[blk.b + k][1], heard[blk.b + k][2])
    known = [k for k, v in enumerate(t) if v]
    if not known: return None
    for k in range(len(t)):
        if t[k]: continue
        p = max([j for j in known if j < k], default=None); n = min([j for j in known if j > k], default=None)
        t0 = t[p][1] if p is not None else 0.0; t1 = t[n][0] if n is not None else total
        gp = k - (p if p is not None else -1); gn = (n if n is not None else len(t)) - (p if p is not None else -1)
        x = t0 + (t1 - t0) * gp / gn; t[k] = (x, x + 0.18)
    return [(script[k][0], script[k][1], t[k][0], t[k][1]) for k in range(len(script))]


def silences(audio):
    log = subprocess.run(['ffmpeg', '-i', audio, '-af', 'silencedetect=noise=-34dB:d=0.12', '-f', 'null', '-'], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    return [(s + e) / 2 for s, e in zip(st, en)]


def estimate(lines, audio, total):
    """no word timings: share the time by syllables, then snap each line break to the nearest pause"""
    n = [len(l.split()) for l in lines]; tot = sum(n); marks = []; acc = 0
    for k in n[:-1]: acc += k; marks.append(total * acc / tot)
    pauses = silences(audio)
    for i, m in enumerate(marks):
        near = min(pauses, key=lambda p: abs(p - m), default=None)
        if near is not None and abs(near - m) < 0.8: marks[i] = near
    bounds = [0.0] + marks + [total]; words = []
    for i, l in enumerate(lines):
        ws = l.split(); a, b = bounds[i], bounds[i + 1]
        for k, w in enumerate(ws): words.append((i, w, a + (b - a) * k / len(ws), a + (b - a) * (k + 1) / len(ws)))
    return words


errors = []  # why the chosen voice was not used in the last narration (sent to the admin page only)
last = {}    # the last narration measured: words, seconds and rate, so the site learns each voice's real speed


def narrate(lines, folder, log=print):
    """returns (audio file, [(line, start, end)], [(line, word, start, end)], provider used)"""
    os.makedirs(folder, exist_ok=True); out = os.path.join(folder, 'voice.mp3')
    text = ' '.join(l.strip().rstrip('.!?…') + '.' if not re.search(r'[.!?…]$', l.strip()) else l.strip() for l in lines)
    first = os.environ.get('INK_VOICE_PROVIDER', 'everai' if os.environ.get('EVERAI_API_KEY') else 'microsoft')
    order = [first] + ([p for p in ('everai', 'microsoft') if p != first] if os.environ.get('INK_VOICE_FALLBACK', '1') == '1' else [])
    heard = None; used = None; errors.clear()
    for p in order:
        try:
            if p == 'everai':
                if not os.environ.get('EVERAI_API_KEY'): raise RuntimeError('chưa có EVERAI_API_KEY')
                everai_all(text, out); used = 'everai'
            else:
                _, heard = microsoft_all(text, out); used = 'microsoft'
            break
        except Exception as e:  # noqa: BLE001
            log(f'  giọng {p} không dùng được ({e}); thử nhà cung cấp tiếp theo'); errors.append(f'{p}: {str(e)[:160]}')
    if not used: raise RuntimeError('Không đọc được lời bằng nhà cung cấp giọng nào.')
    total = duration(out)
    if used == 'everai':
        log('  dò thời điểm từng chữ (Whisper)…'); heard = whisper_words(out)
    words = align(lines, heard, total) if heard else None
    if not words: log('  không có mốc từng chữ: chia theo khoảng ngắt trong giọng'); words = estimate(lines, out, total)
    log(f'  giọng {used}: {total:.1f} giây, {len(words)} chữ có mốc thời gian')
    last.clear(); last.update(provider=used, words=sum(len(l.split()) for l in lines), seconds=round(total, 2), rate=os.environ.get('INK_VOICE_RATE', '+8%'))
    return out, line_spans(lines, words, total), words, used


def own(lines, path, folder, log=print):
    """the person's own recording instead of a voice service: the same word times (Whisper), same shape as narrate"""
    os.makedirs(folder, exist_ok=True); out = os.path.join(folder, 'voice.mp3')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-b:a', '160k', out], check=True)
    total = duration(out)
    log('  giọng của bạn: dò thời điểm từng chữ (Whisper)…')
    heard = whisper_words(out); words = align(lines, heard, total) if heard else None
    if not words: log('  không khớp được từng chữ: chia theo khoảng ngắt trong giọng'); words = estimate(lines, out, total)
    log(f'  giọng của bạn: {total:.1f} giây, {len(words)} chữ có mốc thời gian')
    return out, line_spans(lines, words, total), words, 'own'


def pauses(audio, words, lines, gaps, log=print):
    """a breath before the lines that matter: silence is put into the voice before line k (gaps {k: seconds}) and
    every later word moves on by that much; returns (audio, words, line spans)"""
    gaps = {k: g for k, g in gaps.items() if 0 < k and g > 0}
    if not gaps or not words: return audio, words, None
    starts = {}
    for w in words: starts.setdefault(w[0], w[2])
    cuts = sorted((max(0.0, starts[k] - .05), g) for k, g in gaps.items() if k in starts)
    if not cuts: return audio, words, None
    out = audio.replace('.mp3', '.paused.mp3'); parts, prev, f = [], 0.0, ''
    for i, (t, g) in enumerate(cuts):
        f += f'[0:a]atrim={prev:.3f}:{t:.3f},asetpts=PTS-STARTPTS[a{i}];aevalsrc=0:d={g:.2f}:s=44100:c=mono[s{i}];'; parts += [f'[a{i}]', f'[s{i}]']; prev = t
    f += f'[0:a]atrim=start={prev:.3f},asetpts=PTS-STARTPTS[z];'; parts.append('[z]')
    f += ''.join(parts) + f'concat=n={len(parts)}:v=0:a=1[o]'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', audio, '-filter_complex', f, '-map', '[o]', '-ac', '1', '-ar', '44100', '-b:a', '160k', out], check=True)
    shift = lambda t: t + sum(g for c, g in cuts if t >= c)
    words = [(w[0], w[1], round(shift(w[2]), 3), round(shift(w[3]), 3)) for w in words]
    log(f'  thêm {len(cuts)} quãng nghỉ trước câu quan trọng ({sum(g for _, g in cuts):.1f} giây)')
    total = duration(out)
    return out, words, line_spans(lines, words, total)


def plain_estimate(lines, total):
    """no word timings and no audio tools (browser): share the time by syllables"""
    n = [len(l.split()) for l in lines]; tot = max(1, sum(n)); words = []; a = 0.0
    for i, l in enumerate(lines):
        ws = l.split(); b = a + total * len(ws) / tot
        for k, w in enumerate(ws): words.append((i, w, a + (b - a) * k / len(ws), a + (b - a) * (k + 1) / len(ws)))
        a = b
    return words


def line_spans(lines, words, total):
    """[(line, start, end)]: each line runs until the next one starts, so scenes follow each other with no gap"""
    spans = []
    for i in range(len(lines)):
        ws = [w for w in words if w[0] == i]
        spans.append((ws[0][2], ws[-1][3]) if ws else (0, 0))
    # each line runs until the next one starts, so scenes follow each other with no gap
    starts = [0.0] + [spans[i][0] for i in range(1, len(lines))]
    for i in range(1, len(starts)): starts[i] = max(starts[i], starts[i - 1] + 0.4)
    ends = starts[1:] + [total + 0.35]
    return list(zip(range(len(lines)), starts, ends))
