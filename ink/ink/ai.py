"""Text AI for scripts and storyboards: OpenAI and Gemini in a chosen order, each with fallback models.

Environment (keys only come from secrets, never from files):
  OPENAI_API_KEY, GEMINI_API_KEY
  ANTHROPIC_API_KEY  Claude writes the code of the 3D props (code()); without it Gemini/OpenAI write it
  INK_CLAUDE_MODEL   default claude-opus-5-5
  INK_AI_ORDER     e.g. "gemini,openai" (default) - who is asked first
  INK_GEMINI_MODELS e.g. "gemini-3.5-flash,gemini-flash-latest"
  INK_OPENAI_MODELS e.g. "gpt-4.1-mini,gpt-4.1-nano"
  INK_AI_FALLBACK  1 (default): when the first provider fails, the other one answers; 0: never
Every answer must be JSON; a model that errors, is busy or returns broken JSON hands over to the next one."""
import json, os, re, time, urllib.request, urllib.error

DEFAULT_MODELS = {'gemini': 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-latest', 'openai': 'gpt-4.1-mini,gpt-4o-mini'}
KEYS = {'gemini': 'GEMINI_API_KEY', 'openai': 'OPENAI_API_KEY'}
used = []  # (provider, model) of each successful call, written to the run log


def chain():
    order = [p.strip() for p in os.environ.get('INK_AI_ORDER', 'gemini,openai').split(',') if p.strip() in KEYS]
    if os.environ.get('INK_AI_FALLBACK', '1') != '0':  # 0 = only the first provider, never the other one
        for p in KEYS:
            if p not in order: order.append(p)
    out = []
    for p in order:
        if not os.environ.get(KEYS[p]): continue
        for m in os.environ.get(f'INK_{p.upper()}_MODELS', DEFAULT_MODELS[p]).split(','):
            if m.strip(): out.append((p, m.strip()))
    return out


def _post(url, body, headers, timeout=70):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'content-type': 'application/json', **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())


def _gemini(model, system, user, temperature):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ["GEMINI_API_KEY"]}'
    body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}],
            'generationConfig': {'temperature': temperature, 'responseMimeType': 'application/json'}}
    r = _post(url, body, {})
    return ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts'])


def _openai(model, system, user, temperature, timeout=70):
    body = {'model': model, 'temperature': temperature, 'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]}
    r = _post('https://api.openai.com/v1/chat/completions', body, {'authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']}, timeout)
    return r['choices'][0]['message']['content']


def parse_json(text):
    text = text.strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', text, re.S)
    if m: text = m.group(1)
    a, b = text.find('{'), text.rfind('}')
    return json.loads(text[a:b + 1] if a >= 0 else text)


# In the browser (Pyodide) the keys and the prompts stay on the website: prompt() hands over a reference
# {name, kw} and `remote(system, user, temperature, attempt)` asks the site, which fills the prompt and walks
# its own model chain (attempt n starts at the n-th model). It returns (text, provider, model).
remote = None


def ask(system, user, temperature=0.7, check=None, log=print):
    """the first valid JSON answer along the chain; `check(obj)` may raise ValueError to reject an answer"""
    errors = []
    if remote:
        for attempt in range(4):
            try:
                raw, provider, model = remote(system, user, temperature, attempt)
                obj = parse_json(raw)
                if check: check(obj)
                used.append((provider, model)); return obj
            except (ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
                errors.append(f'{type(e).__name__}: {str(e)[:160]}'); log('  AI trả lời chưa đạt, thử tiếp: ' + errors[-1])
        raise RuntimeError('AI không trả lời được: ' + ' | '.join(errors))
    models = chain()
    if not models: raise RuntimeError('Chưa có khóa AI (OPENAI_API_KEY hoặc GEMINI_API_KEY).')
    first = {}
    for p_, m_ in models: first.setdefault(p_, m_)
    for provider, model in models:
        # the best model of each provider is worth waiting for when busy (429/503): the lighter ones break long JSON
        waits = [6, 15, 30] if first.get(provider) == model else [4]
        for attempt in range(len(waits) + 1):
            try:
                raw = (_gemini if provider == 'gemini' else _openai)(model, system, user, temperature)
                obj = parse_json(raw)
                if check: check(obj)
                used.append((provider, model)); return obj
            except urllib.error.HTTPError as e:
                msg = f'{provider}/{model}: HTTP {e.code}'
                errors.append(msg); log('  AI lỗi, thử tiếp: ' + msg)
                if e.code in (429, 500, 502, 503, 504) and attempt < len(waits):
                    try: after = float(e.headers.get('retry-after') or 0)
                    except (TypeError, ValueError): after = 0
                    time.sleep(min(60, max(waits[attempt], after))); continue
                break
            except (ValueError, KeyError, IndexError, json.JSONDecodeError, urllib.error.URLError, TimeoutError) as e:
                msg = f'{provider}/{model}: {type(e).__name__}: {str(e)[:160]}'
                errors.append(msg); log('  AI trả lời chưa đạt, thử tiếp: ' + msg)
                if attempt == 0 and first.get(provider) == model: continue   # the best model gets a second try
                break
    raise RuntimeError('Tất cả mô hình AI đều không trả lời được: ' + ' | '.join(errors))


# ---------------------------------------------------------------- research on the web (grounded answers with their sources)
def _gemini_search(model, system, user):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ["GEMINI_API_KEY"]}'
    body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}],
            'tools': [{'google_search': {}}], 'generationConfig': {'temperature': 0.3}}
    r = _post(url, body, {}, timeout=120)
    c = r['candidates'][0]
    text = ''.join(p.get('text', '') for p in c['content']['parts'])
    chunks = (c.get('groundingMetadata') or {}).get('groundingChunks') or []
    return text, [{'title': (g.get('web') or {}).get('title', ''), 'url': (g.get('web') or {}).get('uri', '')} for g in chunks if g.get('web')]


def _openai_search(model, system, user):
    body = {'model': model, 'tools': [{'type': 'web_search'}], 'instructions': system, 'input': user}
    r = _post('https://api.openai.com/v1/responses', body, {'authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']}, timeout=150)
    text, sources = '', []
    for item in r.get('output') or []:
        for part in item.get('content') or []:
            if part.get('type') == 'output_text':
                text += part.get('text', '')
                sources += [{'title': a.get('title', ''), 'url': a.get('url', '')} for a in part.get('annotations') or [] if a.get('type') == 'url_citation']
    return text, sources


def research(system, user, check=None, log=print):
    """a JSON answer written from pages found on the web right now, and the pages it came from.
    Gemini answers with Google Search, OpenAI with its web search; an answer without any source is refused."""
    errors = []
    for provider, model in chain():
        if provider == 'gemini' and 'lite' in model: continue  # the light models search poorly
        try:
            text, sources = (_gemini_search if provider == 'gemini' else _openai_search)(model, system, user)
            obj = parse_json(text)
            seen, src = set(), []
            for s in sources:
                if s['url'] and s['url'] not in seen: seen.add(s['url']); src.append(s)
            if not src: raise ValueError('không có nguồn web nào')
            if check: check(obj)
            used.append((provider, model + '+search')); return obj, src
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
            msg = f'{provider}/{model}: {type(e).__name__}: {str(getattr(e, "code", "") or e)[:160]}'
            errors.append(msg); log('  tìm nguồn chưa được, thử tiếp: ' + msg)
    raise RuntimeError('Không tìm được nguồn trên web: ' + ' | '.join(errors))


# ---------------------------------------------------------------- looking at a picture (the preview grid of a video)
def look(system, user, image_path, check=None, log=print):
    """a JSON answer about an image; Gemini first, OpenAI after (the chain's order). Raises when no model can see it."""
    import base64
    data = base64.b64encode(open(image_path, 'rb').read()).decode()
    mime = 'image/png' if image_path.endswith('.png') else 'image/jpeg'
    errors = []
    for provider, model in chain():
        if 'lite' in model: continue
        try:
            if provider == 'gemini':
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ["GEMINI_API_KEY"]}'
                r = _post(url, {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'inline_data': {'mime_type': mime, 'data': data}}, {'text': user}]}],
                                'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json'}}, {}, timeout=120)
                raw = ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts'])
            else:
                r = _post('https://api.openai.com/v1/chat/completions', {'model': model, 'temperature': 0.2, 'response_format': {'type': 'json_object'},
                          'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{data}'}}, {'type': 'text', 'text': user}]}]},
                          {'authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']}, timeout=120)
                raw = r['choices'][0]['message']['content']
            obj = parse_json(raw)
            if check: check(obj)
            used.append((provider, model + '+vision')); return obj
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
            errors.append(f'{provider}/{model}: {type(e).__name__}: {str(getattr(e, "code", "") or e)[:120]}'); log('  xem hình chưa được, thử tiếp: ' + errors[-1])
    raise RuntimeError('Không mô hình nào xem được hình: ' + ' | '.join(errors))


# ---------------------------------------------------------------- writing code (the 3D props of a series video)
def _claude(system, user, effort='high'):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'], max_retries=3)
    with client.messages.stream(model=os.environ.get('INK_CLAUDE_MODEL', 'claude-opus-5-5'), max_tokens=32000, system=system,
                                thinking={'type': 'adaptive'}, output_config={'effort': effort},
                                messages=[{'role': 'user', 'content': user}]) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == 'refusal': raise ValueError('Claude từ chối trả lời')
    return ''.join(b.text for b in msg.content if b.type == 'text')


def code(system, user, check=None, log=print):
    """the answer of a code-writing request as text (the prompt asks for one ```js block plus a JSON block).
    Claude first when its key is there; otherwise, or when it fails, the JSON chain answers {"code": ..., ...}."""
    errors = []
    if os.environ.get('ANTHROPIC_API_KEY') and not remote:
        try:
            import anthropic
            for attempt in range(2):
                try:
                    text = _claude(system, user)
                    if check: check(text)
                    used.append(('anthropic', os.environ.get('INK_CLAUDE_MODEL', 'claude-opus-5-5'))); return text
                except ValueError as e:
                    errors.append(f'claude: {str(e)[:160]}'); log('  Claude viết mã chưa đạt, thử lại: ' + errors[-1])
        except ImportError:
            errors.append('claude: chưa cài thư viện anthropic')
        except Exception as e:  # API errors (key, credit, overload): the other providers write it
            errors.append(f'claude: {type(e).__name__}: {str(e)[:160]}'); log('  Claude lỗi, chuyển mô hình khác: ' + errors[-1])
    def ok(obj):
        if not str(obj.get('code') or '').strip(): raise ValueError('thiếu "code"')
        if check: check(as_text(obj))
    as_text = lambda obj: '```js\n' + str(obj.get('code')) + '\n```\n```json\n' + json.dumps({k: v for k, v in obj.items() if k != 'code'}, ensure_ascii=False) + '\n```'
    ask_json = user + '\n\nTrả về MỘT đối tượng JSON: mã JavaScript đặt trong khóa "code" (chuỗi), các khóa khác như yêu cầu.'
    # code needs a strong model: the full OpenAI model first (the light ones break three.js), then the usual chain
    if os.environ.get('OPENAI_API_KEY') and not remote:
        for m in [x.strip() for x in os.environ.get('INK_CODE_OPENAI', 'gpt-4.1').split(',') if x.strip()]:
            try:
                obj = parse_json(_openai(m, system, ask_json, 0.4, 180)); ok(obj)
                used.append(('openai', m)); return as_text(obj)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
                errors.append(f'openai/{m}: {type(e).__name__}: {str(getattr(e, "code", "") or e)[:120]}'); log('  ' + errors[-1])
    try:
        return as_text(ask(system, ask_json, 0.6, check=ok, log=log))
    except RuntimeError as e:
        raise RuntimeError(' | '.join(errors + [str(e)]))


def blocks(text):
    """the ```js and ```json blocks of a code answer: (code, obj)"""
    js = re.search(r'```(?:js|javascript)\s*\n(.*?)```', text, re.S)
    if not js: raise ValueError('không thấy khối ```js')
    m = re.search(r'```json\s*\n(.*?)```', text, re.S)
    try: obj = json.loads(m.group(1)) if m else {}
    except json.JSONDecodeError: raise ValueError('khối ```json hỏng')
    return js.group(1).strip(), obj
