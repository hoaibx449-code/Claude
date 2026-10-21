import { HttpError, type Env } from './util.ts';

export type CouncilProvider = 'gemini' | 'ollama' | 'openai';
export interface CouncilModel { provider: CouncilProvider; model: string }
export interface CouncilAgent { id: string; name: string; prompt: string; models: CouncilModel[]; routing?: 'global' | 'custom' }
// Explicit free-tier catalogue checked 2026-10-21. Billing status belongs to the account,
// not to the model ID: cloud use additionally requires the admin's free-account confirmation.
export const FREE_GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
export function councilPlan(models: CouncilModel[], freeOnly: boolean, freeConfirmed: boolean) {
  return models.filter(m => !freeOnly || (freeConfirmed && (m.provider === 'ollama' ||
    (m.provider === 'gemini' && FREE_GEMINI.includes(m.model)))));
}

// Older installations shipped this exact Gemini-only default, without a routing field.
export function councilRouting(agent: CouncilAgent): 'global' | 'custom' {
  return agent.routing || (agent.models.length===FREE_GEMINI.length && agent.models.every((m,i)=>
    m.provider==='gemini' && m.model===FREE_GEMINI[i]) ? 'global' : 'custom');
}
export function councilRoute(env: Env, agent: CouncilAgent, freeOnly: boolean, freeConfirmed: boolean) {
  const split=(value:string|undefined)=>(value||'').split(',').map(x=>x.trim()).filter(Boolean);
  const providers=['ollama','gemini','openai'] as const;
  const order=[...new Set([...split(env.AI_ORDER),...providers])].filter(p=>providers.includes(p as any));
  const configured:Record<string,string[]>={
    ollama:[env.OLLAMA_TEXT_MODEL||'',...split(env.OLLAMA_TEXT_FALLBACK)],
    gemini:[env.GEMINI_TEXT_MODEL||FREE_GEMINI[0],...split(env.GEMINI_TEXT_FALLBACK),...FREE_GEMINI],
    openai:[env.OPENAI_TEXT_MODEL||'',...split(env.OPENAI_TEXT_FALLBACK)],
  };
  const routing=councilRouting(agent);
  const candidates=routing==='custom'?agent.models:order.flatMap(provider=>configured[provider]
    .filter(Boolean).map(model=>({provider:provider as CouncilProvider,model})));
  const seen=new Set<string>(), skipped:{provider:string;model:string;reason:string}[]=[];
  const plan:CouncilModel[]=[];
  for(const m of candidates){
    const key=m.provider+'/'+m.model;if(seen.has(key))continue;seen.add(key);
    let reason='';
    if(!councilPlan([m],freeOnly,freeConfirmed).length)
      reason=freeOnly&&!freeConfirmed?'Chưa xác nhận tài khoản dùng hạn mức miễn phí.':'Bị chặn bởi chính sách chỉ dùng miễn phí.';
    else if(m.provider==='ollama'&&env.OLLAMA_URL&&env.OLLAMA_URL.replace(/\/$/,'')!=='https://ollama.com')
      reason='Cần Ollama Cloud tại https://ollama.com để chạy khi máy tính tắt.';
    else if(!(m.provider==='ollama'?env.OLLAMA_API_KEY:m.provider==='gemini'?env.GEMINI_API_KEY:env.OPENAI_API_KEY))
      reason='Chưa cấu hình khóa '+(m.provider==='ollama'?'Ollama Cloud':m.provider)+'.';
    if(reason)skipped.push({...m,reason});else plan.push(m);
  }
  if(routing==='global'&&!configured.ollama.some(Boolean))skipped.push({provider:'ollama',model:'',reason:'Chưa chọn mô hình Ollama Cloud trong API & token.'});
  return {routing,plan,skipped};
}

export function councilFailure(error:unknown) {
  // Never persist provider bodies, request URLs or arbitrary network error strings.
  if(error instanceof HttpError)return error.message;
  if(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name))return 'Nhà cung cấp không trả lời trong 22 giây.';
  return 'Không kết nối được nhà cung cấp hoặc phản hồi không hợp lệ.';
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
  if (!response.ok) {
    const explanation=response.status===429?'Hết hạn mức hoặc bị giới hạn tốc độ; kiểm tra hạn mức tài khoản.':
      [401,403].includes(response.status)?'Khóa không hợp lệ hoặc tài khoản không có quyền dùng mô hình.':
      response.status===404?'Tên mô hình không tồn tại hoặc chưa được cấp cho tài khoản.':
      response.status>=500?'Nhà cung cấp đang gặp sự cố.':'Nhà cung cấp từ chối yêu cầu.';
    throw new HttpError(response.status === 429 ? 429 : 502, `AI ${model.provider}: HTTP ${response.status}. ${explanation}`);
  }
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
