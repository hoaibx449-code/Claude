import { HttpError, type Env } from './util.ts';

export type CouncilProvider = 'gemini' | 'ollama' | 'openai';
export interface CouncilModel { provider: CouncilProvider; model: string }
export interface CouncilAgent { id: string; name: string; prompt: string; models: CouncilModel[] }
// Explicit free-tier catalogue checked 2026-10-21. Billing status belongs to the account,
// not to the model ID: cloud use additionally requires the admin's free-account confirmation.
export const FREE_GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
export function councilPlan(models: CouncilModel[], freeOnly: boolean, freeConfirmed: boolean) {
  return models.filter(m => !freeOnly || (freeConfirmed && (m.provider === 'ollama' ||
    (m.provider === 'gemini' && FREE_GEMINI.includes(m.model)))));
}

export async function councilGenerate(env: Env, model: CouncilModel, system: string, input: string) {
  const timeout = AbortSignal.timeout(22_000);
  const common = { method: 'POST', redirect: 'manual' as const, signal: timeout };
  let response: Response;
  if (model.provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Chưa có khóa Gemini.');
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.model)}:generateContent`, {
      ...common, headers: {'content-type':'application/json', 'x-goog-api-key':env.GEMINI_API_KEY},
      body: JSON.stringify({systemInstruction:{parts:[{text:system}]}, contents:[{role:'user',parts:[{text:input}]}],
        generationConfig:{maxOutputTokens:2200}}),
    });
  } else if (model.provider === 'ollama') {
    // Never pass secrets to an arbitrary URL, metadata host, local address or redirect.
    if (env.OLLAMA_URL && env.OLLAMA_URL.replace(/\/$/,'') !== 'https://ollama.com')
      throw new HttpError(400, 'Nhóm AI trên máy chủ chỉ dùng Ollama Cloud tại ollama.com.');
    if (!env.OLLAMA_API_KEY) throw new HttpError(503, 'Chưa có khóa Ollama Cloud.');
    response = await fetch('https://ollama.com/api/chat', {...common,
      headers:{'content-type':'application/json',authorization:`Bearer ${env.OLLAMA_API_KEY}`},
      body:JSON.stringify({model:model.model,stream:false,messages:[{role:'system',content:system},{role:'user',content:input}],options:{num_predict:2200}})});
  } else {
    if (!env.OPENAI_API_KEY) throw new HttpError(503, 'Chưa có khóa OpenAI.');
    response = await fetch('https://api.openai.com/v1/responses', {...common,
      headers:{'content-type':'application/json',authorization:`Bearer ${env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:model.model,instructions:system,input,store:false,max_output_tokens:2200})});
  }
  if (!response.ok) throw new HttpError(response.status === 429 ? 429 : 502, `AI ${model.provider}: HTTP ${response.status}.`);
  const j:any = await response.json();
  let text = '';
  if (model.provider === 'gemini') {
    const c=j.candidates?.[0];
    if(c?.finishReason && c.finishReason!=='STOP') throw new HttpError(502,'AI chưa hoàn tất nội dung.');
    text=(c?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('\n');
  } else if(model.provider==='ollama') {
    if(j.done===false||j.done_reason==='length') throw new HttpError(502,'AI chưa hoàn tất nội dung.');
    text=j.message?.content||'';
  } else {
    if(j.status!=='completed') throw new HttpError(502,'AI chưa hoàn tất nội dung.');
    text=(j.output||[]).filter((x:any)=>x.type==='message').flatMap((x:any)=>x.content||[])
      .filter((x:any)=>x.type==='output_text').map((x:any)=>x.text||'').join('\n');
  }
  if(typeof text!=='string'||!text.trim()||text.length>18000) throw new HttpError(502,'AI trả nội dung rỗng hoặc quá dài.');
  return text.trim();
}
