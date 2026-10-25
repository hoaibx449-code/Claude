"""Text AI for scripts and storyboards: OpenAI and Gemini in a chosen order, each with fallback models.

Environment (keys only come from secrets, never from files):
  OPENAI_API_KEY, GEMINI_API_KEY
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


def _openai(model, system, user, temperature):
    body = {'model': model, 'temperature': temperature, 'response_format': {'type': 'json_object'},
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]}
    r = _post('https://api.openai.com/v1/chat/completions', body, {'authorization': 'Bearer ' + os.environ['OPENAI_API_KEY']})
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
    for provider, model in models:
        for attempt in range(2):
            try:
                raw = (_gemini if provider == 'gemini' else _openai)(model, system, user, temperature)
                obj = parse_json(raw)
                if check: check(obj)
                used.append((provider, model)); return obj
            except urllib.error.HTTPError as e:
                msg = f'{provider}/{model}: HTTP {e.code}'
                errors.append(msg); log('  AI lỗi, thử tiếp: ' + msg)
                if e.code in (429, 500, 502, 503, 504) and attempt == 0: time.sleep(4); continue
                break
            except (ValueError, KeyError, IndexError, json.JSONDecodeError, urllib.error.URLError, TimeoutError) as e:
                msg = f'{provider}/{model}: {type(e).__name__}: {str(e)[:160]}'
                errors.append(msg); log('  AI trả lời chưa đạt, thử tiếp: ' + msg)
                break
    raise RuntimeError('Tất cả mô hình AI đều không trả lời được: ' + ' | '.join(errors))
