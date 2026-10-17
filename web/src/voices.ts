// Voices on the site: listen before choosing (the sample is made the same way the render
// machine reads, so what you hear is what the video gets), the user's own recording as the
// narration, and an honest status of each voice service for the admin page.
import { requireBudget } from './budget.ts';
import { voiceCost } from './log.ts';
import { standIn } from '../../src/engine/voices.ts';
import type { User } from './auth.ts';
import { accessToken } from './gcp.ts';
import { runnerSecrets } from './settings.ts';
import { HttpError, json, useQuota, sha256 } from './util.ts';
import type { Rc, XEnv } from './worker.ts';

const SAMPLE = 'Xin chào! Đây là giọng đọc cho video của bạn. Nghe có dễ chịu không?';
const PREVIEW_V = 'v2';

/** What the render machine told us about itself (keys it holds), and the last time a voice fell back. */
export async function voiceStatus(env: XEnv) {
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('runner:caps', 'runner:voicefail')").all<any>()).results;
  const get = (k: string) => { try { return JSON.parse(rows.find((r: any) => r.key === k)?.value || 'null'); } catch { return null; } };
  const caps = get('runner:caps') || {}, fail = get('runner:voicefail');
  const secrets = await runnerSecrets(env);
  const everai = !!(secrets.EVERAI_API_KEY || caps.everai), google = !!(secrets.GOOGLE_TTS_API_KEY || caps.google);
  // a fallback in the last day after the key was set means the service itself is failing
  const failing = fail && Date.now() - fail.at < 86_400_000 ? fail : null;
  return { everai, google, free: true, failing, runnerSeen: caps.at || null };
}

export async function recordRunnerCaps(env: XEnv, caps: any) {
  const v = JSON.stringify({ everai: !!caps?.everai, google: !!caps?.google, eleven: !!caps?.eleven, at: Date.now() });
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('runner:caps', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(v, Date.now()).run();
}
export async function recordVoiceFallback(env: XEnv, provider: string, error = '') {
  const v = JSON.stringify({ at: Date.now(), provider: provider.slice(0, 40), error: error.slice(0, 200) });
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('runner:voicefail', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(v, Date.now()).run();
}

export async function clearVoiceFallback(env: XEnv) {
  await env.DB.prepare("DELETE FROM settings WHERE key = 'runner:voicefail'").run();
}

/** Admin "Thử EverAI": read a short sample with the saved key and say exactly what EverAI answered. */
export async function testEverAI(env: XEnv, code = 'vi_female_thuytrang_mb') {
  const key = (await runnerSecrets(env)).EVERAI_API_KEY;
  if (!key) return { ok: false, error: 'Chưa có khoá EverAI (Quản trị → Giọng đọc → Khoá API).' };
  const t0 = Date.now();
  try {
    const audio = await everaiSample(key, code);
    if (audio.byteLength < 1000) return { ok: false, error: `EverAI trả về tệp âm thanh rỗng (${audio.byteLength} byte).` };
    await clearVoiceFallback(env);
    return { ok: true, bytes: audio.byteLength, ms: Date.now() - t0 };
  } catch (e: any) { return { ok: false, error: String(e.message || e).slice(0, 300), ms: Date.now() - t0 }; }
}

/** Voices users can pick, each with whether it really reads with its own voice right now. */
export async function voicesWithStatus(env: XEnv) {
  const st = await voiceStatus(env);
  return env.config.voices.filter((v) => (env.config.visibility['voice:' + v.code] || 'on') !== 'hidden').map((v) => {
    const ready = v.provider === 'everai' ? st.everai && !st.failing : v.provider === 'google' ? true : v.provider === 'elevenlabs' ? false : true;
    return { code: v.code, label: v.label, provider: v.provider, ready, standIn: ready ? undefined : standIn(v.code).name };
  });
}

async function googleSample(env: XEnv, name: string, pitch: number, rate: number, key?: string, text = SAMPLE) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  if (key) url += '?key=' + encodeURIComponent(key);
  else if (env.GCP_TRIGGER_KEY) { headers.authorization = 'Bearer ' + (await accessToken(env)); if (env.GCP_PROJECT) headers['x-goog-user-project'] = env.GCP_PROJECT; }
  else throw new HttpError(503, 'Chưa có dịch vụ giọng để tạo bản nghe thử.');
  const res = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ input: { text }, voice: { languageCode: 'vi-VN', name }, audioConfig: { audioEncoding: 'MP3', ...(pitch ? { pitch } : {}), ...(rate !== 1 ? { speakingRate: rate } : {}) } }) });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new HttpError(502, `Google đọc lỗi (HTTP ${res.status}${t ? ': ' + (t.match(/"message": *"([^"]{0,140})/)?.[1] || '') : ''}).`); }
  const j: any = await res.json();
  return Uint8Array.from(atob(j.audioContent), (c) => c.charCodeAt(0));
}

async function everaiSample(key: string, code: string, text = SAMPLE, speed = 1) {
  const url = 'https://www.everai.vn/api/v1/tts', headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const r = await fetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ response_type: 'indirect', input_text: text, voice_code: code, model_id: 'everai-v1.6', audio_type: 'mp3', bitrate: 128, speed_rate: speed, pitch_rate: 1, volume: 100 }) });
  const j: any = await r.json().catch(() => ({}));
  const find = (o: any, k: string): any => { if (!o || typeof o !== 'object') return undefined; if (o[k] != null && o[k] !== '') return o[k]; for (const x of Object.keys(o)) { const v = find(o[x], k); if (v != null) return v; } };
  const id = find(j.result, 'request_id');
  if (r.status === 401 || r.status === 403) throw new Error(`Khoá EverAI không hợp lệ hoặc đã hết hạn (HTTP ${r.status}${j.error_message ? ': ' + j.error_message : ''})`);
  if (!r.ok || !id) throw new Error(`EverAI từ chối (HTTP ${r.status}): ${j.error_message || j.message || j.error_code || JSON.stringify(j).slice(0, 160)}`);
  for (let i = 0; i < 12; i++) {
    await new Promise((ok) => setTimeout(ok, 1500));
    const s: any = await (await fetch(`${url}/${encodeURIComponent(id)}`, { headers })).json().catch(() => ({}));
    const link = find(s, 'audio_link');
    if (link) return new Uint8Array(await (await fetch(String(link))).arrayBuffer());
    if (/FAIL|ERROR|CANCEL/i.test(String(find(s, 'status') || ''))) throw new Error('EverAI báo thất bại' + (find(s, 'error_message') ? ': ' + find(s, 'error_message') : ` (mã giọng ${code})`));
  }
  throw new Error('EverAI quá thời gian chờ');
}

/** GET /api/voices/preview?code=… — a short sample, cached in storage after the first listen. */
export async function voicePreview(req: Request, env: XEnv, rc: Rc) {
  const code = new URL(req.url).searchParams.get('code') || '';
  const voices = await voicesWithStatus(env);
  const v = voices.find((x) => x.code === code);
  if (!v) throw new HttpError(404, 'Không có giọng này.');
  const source = v.ready ? v.provider : 'standin';
  const key = `voice-preview/${PREVIEW_V}/${source}-${code}.mp3`;
  const cached = await env.BUCKET.get(key);
  const head = { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400', 'x-voice-source': source };
  if (cached) return new Response(cached.body, { headers: head });
  await useQuota(env, 'ip:' + rc.ip, 'voice', 40);
  const secrets = await runnerSecrets(env);
  let audio: Uint8Array;
  try {
    if (source === 'everai' && secrets.EVERAI_API_KEY) audio = await everaiSample(secrets.EVERAI_API_KEY, code);
    else if (source === 'google') audio = await googleSample(env, code, 0, 1, secrets.GOOGLE_TTS_API_KEY);
    else { const s = standIn(code); audio = await googleSample(env, s.name, s.pitch, s.rate, secrets.GOOGLE_TTS_API_KEY); }
  } catch (e: any) {
    if (source === 'everai') { const s = standIn(code); audio = await googleSample(env, s.name, s.pitch, s.rate, secrets.GOOGLE_TTS_API_KEY); }
    else throw e;
  }
  await env.BUCKET.put(key, audio, { httpMetadata: { contentType: 'audio/mpeg' } });
  rc.log('voice.preview', { data: { code, source } });
  return new Response(audio, { headers: head });
}

/** POST /api/voice-upload — the user's own narration (mp3, m4a or wav, ≤ 25 MB). */
export async function voiceUpload(req: Request, env: XEnv, rc: Rc, user: User) {
  const type = (req.headers.get('content-type') || '').split(';')[0];
  const ext = ({ 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' } as Record<string, string>)[type];
  if (!ext) throw new HttpError(415, 'Chỉ nhận tệp MP3, M4A hoặc WAV.');
  const size = Number(req.headers.get('content-length'));
  if (!size || size > 25_000_000) throw new HttpError(413, 'Tệp giọng đọc tối đa 25 MB.');
  await useQuota(env, user.id, 'voiceup', 20);
  const key = `voice/${user.id.replace(/[^\w-]/g, '')}/${[...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')}.${ext}`;
  await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: type } });
  rc.log('voice.upload', { data: { bytes: size, ext } });
  return json({ ref: 'r2:' + key });
}


/** Owner-authenticated browser narration; never exposes service credentials to the client. */
export async function browserVoice(env:XEnv,rc:Rc,user:User,projectId:string,spec:any,scene:unknown){
  const head={'content-type':'audio/mpeg','cache-control':'private, no-store'};
  if(spec.audio?.voice==='upload'){
    const key=String(spec.audio.voiceFile||'').replace(/^r2:/,'');
    if(!key.startsWith('voice/'+user.id.replace(/[^\w-]/g,'')+'/'))throw new HttpError(403,'Không có quyền dùng tệp giọng này.');
    const obj=await env.BUCKET.get(key);if(!obj)throw new HttpError(404,'Không tìm thấy tệp giọng.');
    return new Response(obj.body,{headers:{...head,'content-type':obj.httpMetadata?.contentType||'audio/mpeg'}});
  }
  const si=Number(scene);if(!Number.isInteger(si)||si<0||si>=spec.scenes.length)throw new HttpError(400,'Cảnh không hợp lệ.');
  const text=spec.scenes[si].lines.join(' ');if(text.length>1200)throw new HttpError(400,'Mỗi cảnh trình duyệt tối đa 1200 ký tự. Hãy tách cảnh ngắn hơn.');
  const voice=spec.voice||{},speed=Number(voice.speed)||1;
  const key='browser-voice/'+user.id+'/'+await sha256(JSON.stringify([voice,text]))+'.mp3';
  const cached=await env.BUCKET.get(key);if(cached)return new Response(cached.body,{headers:head});
  const cost=voiceCost(env.config,voice.provider,spec.scenes.reduce((n:number,s:any)=>n+s.lines.join(' ').length,0));
  if(env.config.budget.perVideoVnd>0&&cost>env.config.budget.perVideoVnd)throw new HttpError(413,'Chi phí giọng vượt trần mỗi video. Hãy rút ngắn hoặc dùng bản thu âm.');
  await requireBudget(env,'giọng đọc trình duyệt');await useQuota(env,user.id,'voice',80);
  const secrets=await runnerSecrets(env);let audio:Uint8Array|undefined;
  const everaiKey=secrets.EVERAI_API_KEY,googleKey=secrets.GOOGLE_TTS_API_KEY;
  // the chosen voice first, then a similar Google voice (same as the listen-before-choosing sample)
  const tries:[string,()=>Promise<Uint8Array>][]=[];
  if(voice.provider==='everai'&&everaiKey)tries.push(['EverAI',()=>everaiSample(everaiKey,voice.voiceId,text,speed)]);
  if(voice.provider==='google')tries.push(['Google',()=>googleSample(env,voice.voiceId,0,speed,googleKey,text)]);
  const s=standIn(voice.voiceId);tries.push(['Google thay thế',()=>googleSample(env,s.name,s.pitch,s.rate*speed,googleKey,text)]);
  const errors:string[]=[];let used='';
  for(const [name,run] of tries){
    try{audio=await run();if(audio.byteLength<500)throw new Error('tệp âm thanh rỗng');used=name;break;}
    catch(e:any){errors.push(`${name}: ${String(e?.message||e).slice(0,160)}`);if(name==='EverAI')await recordVoiceFallback(env,'everai',String(e?.message||e)).catch(()=>{});}
  }
  if(!used){rc.log('voice.browser',{ok:false,projectId,data:{scene:si,errors}});throw new HttpError(502,`Không tạo được giọng đọc cho cảnh ${si+1} (${errors.join('; ')}). Thử giọng khác, hoặc trong Âm thanh chọn Giọng của tôi (tải MP3/WAV) hay Không lời.`);}
  await env.BUCKET.put(key,audio!,{httpMetadata:{contentType:'audio/mpeg'}});
  rc.log('voice.browser',{projectId,cost:voiceCost(env.config,voice.provider,text.length),data:{scene:si,chars:text.length,provider:voice.provider,used}});
  return new Response(audio!,{headers:head});
}
