import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {database} from './support/sqlite.ts';
import worker from '../web/src/worker.ts';
import {startSession} from '../web/src/auth.ts';
import {defaultConfig,clearCache,encrypt} from '../web/src/settings.ts';
import {cleanCouncil,councilDefaults,tickCouncil,telegramParts,councilWebhook,councilAdmin} from '../web/src/council.ts';
import {councilPlan,councilGenerate,councilRoute,councilRouting,councilFailure,FREE_GEMINI} from '../web/src/council-ai.ts';
import {sha256} from '../web/src/util.ts';
import {councilTelegramFormat,councilTitle} from '../web/src/council-present.ts';

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'council-'));
  const env:any={DB:database(join(dir,'db.sqlite')),ADMIN_EMAIL:'admin@test',RUNNER_TOKEN:'r'.repeat(32),
    GEMINI_API_KEY:'never-expose-gemini',DAILY_SCRIPTS:'20',DAILY_IMAGES:'20',DAILY_RENDERS:'5',ASSETS:{fetch:async()=>new Response('asset')}};
  env.config=defaultConfig(env);
  const user={id:'admin',email:'admin@test',name:'Admin',picture:null};
  const adminCookie=(await startSession(env,user)).split(';')[0];
  const memberCookie=(await startSession(env,{...user,id:'member',email:'member@test'})).split(';')[0];
  const pending:Promise<any>[]=[],ctx:any={waitUntil(p:Promise<any>){pending.push(p);}};
  const request=async(path:string,opts:any={})=>{
    const r=await worker.fetch(new Request('https://studio.test'+path,opts),env,ctx);
    await Promise.all(pending.splice(0));return r;
  };
  const write=(route:string,value:any={},method='POST')=>request('/api/admin/council'+route,{method,headers:{cookie:adminCookie,'x-nv':'1','content-type':'application/json',origin:'https://studio.test'},body:JSON.stringify(value)});
  const save=async(c:any)=>{
    const r=await write('/config',{config:c},'PUT');assert.equal(r.status,200,await r.text());
  };
  const secret=async(key:string,value:string)=>env.DB.prepare('INSERT OR REPLACE INTO council_secrets VALUES(?,?)').bind(key,await encrypt(env,value)).run();
  const hook=async(payload:any,header='hook-secret')=>request('/api/council/telegram',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':header},body:JSON.stringify(payload)});
  const webhookMessage=(id:number,from=55,chat=-100,text='/brief Nội dung cà phê')=>({update_id:id,message:{message_id:id,from:{id:from,is_bot:false},chat:{id:chat,type:'supergroup'},text}});
  const enabled=()=>{const c=councilDefaults();return {...c,enabled:true,freeConfirmed:true,agents:c.agents.map(a=>({...a,routing:"custom" as const}))};};
  const close=()=>{clearCache();rmSync(dir,{recursive:true,force:true});};
  return {env,user,adminCookie,memberCookie,request,write,save,secret,hook,webhookMessage,enabled,close};
}

test('council: inherited routing follows Ollama-first settings, migrates legacy defaults and explains skipped choices',()=>{
  const agent=councilDefaults().agents[1];
  const env:any={AI_ORDER:'ollama,openai,gemini',OLLAMA_TEXT_MODEL:'cloud-model',OLLAMA_TEXT_FALLBACK:'backup-cloud',
    OLLAMA_URL:'https://ollama.com',OLLAMA_API_KEY:'private-ollama-key',GEMINI_API_KEY:'private-gemini-key',
    OPENAI_API_KEY:'private-openai-key',OPENAI_TEXT_MODEL:'paid'};
  let route=councilRoute(env,agent,true,true);
  assert.deepEqual(route.plan.slice(0,2).map(m=>m.provider+'/'+m.model),['ollama/cloud-model','ollama/backup-cloud']);
  assert.ok(route.plan.every(m=>m.provider!=='openai'));
  assert.ok(route.skipped.some(m=>m.provider==='openai'&&m.reason.includes('miễn phí')));
  const legacy={...agent};delete legacy.routing;assert.equal(councilRouting(legacy),'global');
  assert.equal(councilRoute(env,{...agent,routing:'custom'},true,true).plan[0].provider,'gemini');
  route=councilRoute({...env,OLLAMA_URL:'http://localhost:11434'},agent,true,true);
  assert.equal(route.plan[0].provider,'gemini');assert.ok(route.skipped.some(m=>m.reason.includes('máy tính tắt')));
  route=councilRoute({...env,OLLAMA_API_KEY:''},agent,true,true);
  assert.ok(route.skipped.some(m=>m.reason.includes('Chưa cấu hình khóa Ollama')));
  assert.ok(!JSON.stringify(route).includes('private-'));
  assert.equal(councilRoute(env,agent,true,false).plan.length,0);
  assert.ok(!councilFailure(new Error('secret-provider-url')).includes('secret-provider-url'));
});

test('council: model errors survive pause, bypass a failed Telegram receipt, and resume uses current routing without replaying turns',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];try{
    const c=f.enabled();c.agents=c.agents.slice(0,2);c.agents[0].models=c.agents[0].models.slice(0,1);c.agents[1].models=c.agents[1].models.slice(0,1);
    await f.save(c);await f.secret('bot:editor','123456:secret-never-echo');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/')){sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});}
      return new Response('private-provider-body',{status:429});
    };
    const created=await f.write('/jobs',{brief:'Lịch sử thế giới trong 7 ngày'}),{id}=await created.json() as any;
    // An exhausted receipt must never suppress the subsequent pause alert.
    await f.env.DB.prepare("UPDATE council_outbox SET sent=0,attempts=4 WHERE job_id=?").bind(id).run();
    sent.length=0;await tickCouncil(f.env);
    assert.ok(sent.some(x=>x.text.includes('HTTP 429')&&x.text.includes('Phiên tạm dừng')));
    let detail=await (await f.request('/api/admin/council/jobs/'+id,{headers:{cookie:f.adminCookie}})).json() as any;
    assert.equal(detail.job.status,'paused');assert.match(detail.attempts[0].reason,/HTTP 429/);
    assert.ok(!JSON.stringify(detail).includes('private-provider-body'));assert.ok(!JSON.stringify(detail).includes('secret-never-echo'));
    const alerts=sent.filter(x=>x.text.includes('HTTP 429')).length;
    assert.equal((await f.write('/jobs/'+id+'/resume')).status,200);await tickCouncil(f.env);
    assert.equal(sent.filter(x=>x.text.includes('HTTP 429')).length,alerts+1,'a resumed failure sends a fresh alert');
    await f.env.DB.prepare('INSERT INTO council_turns VALUES(?,?,?,?,?,?,?)').bind(id,0,'strategy','gemini',FREE_GEMINI[0],'Đã hoàn tất trước đó.',Date.now()).run();
    await f.env.DB.prepare('UPDATE council_jobs SET step=1 WHERE id=?').bind(id).run();
    c.agents.forEach(a=>a.routing='global');await f.save(c);
    f.env.AI_ORDER='ollama,gemini';f.env.OLLAMA_TEXT_MODEL='working-cloud';f.env.OLLAMA_API_KEY='private-ollama-key';f.env.OLLAMA_URL='https://ollama.com';
    // Keep this fixture on the real route while supplying the same effective environment as the worker.
    const resumed=await councilAdmin(new Request('https://studio.test/api/admin/council/jobs/'+id+'/resume',{method:'POST',body:'{}'}),f.env,'council/jobs/'+id+'/resume',f.user,{log(){}} as any);
    assert.equal(resumed.status,200);
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/'))return Response.json({ok:true,result:{message_id:1}});
      assert.equal(String(url),'https://ollama.com/api/chat');assert.equal(JSON.parse(options?.body as string).model,'working-cloud');
      return Response.json({done:true,message:{content:'Bản tổng hợp.'}});
    };
    await tickCouncil(f.env);
    detail=await f.env.DB.prepare('SELECT * FROM council_jobs WHERE id=?').bind(id).first<any>();assert.equal(detail.status,'pending');assert.equal(detail.step,2);
    const turns=await f.env.DB.prepare('SELECT * FROM council_turns WHERE job_id=? ORDER BY step').bind(id).all<any>();
    assert.equal(turns.results.length,2);assert.equal(turns.results[0].text,'Đã hoàn tất trước đó.');assert.equal(turns.results[1].provider,'ollama');
    assert.equal((await f.write('/jobs/'+id+'/retry-delivery')).status,200);
    assert.equal((await f.env.DB.prepare('SELECT sent FROM council_outbox WHERE id=?').bind(id+':opening:0').first<any>()).sent,1);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: actual Worker protects reads, writes, CSRF, blocked admins and private data',async()=>{
  clearCache();const f=await fixture();try{
    for(const path of ['/api/admin/council','/api/admin/council/telegram-status','/api/admin/council/jobs/'+'a'.repeat(24)]){
      for(const [cookie,status] of [['',401],[f.memberCookie,403],['sid='+'0'.repeat(64),401]]){
        const r=await f.request(path,{headers:{cookie}});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
      }
    }
    for(const route of ['/jobs','/pair','/connect','/unlink','/menu']){
      for(const headers of [{cookie:f.adminCookie},{cookie:f.adminCookie,'x-nv':'1',origin:'https://evil.test'},{cookie:f.memberCookie,'x-nv':'1'}])
        assert.equal((await f.request('/api/admin/council'+route,{method:'POST',headers,body:'{}'})).status,403);
    }
    await f.secret('bot:editor','123456:secret-token');await f.secret('webhook','hook-secret');
    const state=await f.request('/api/admin/council',{headers:{cookie:f.adminCookie}}),s=await state.text();
    assert.equal(state.status,200);for(const secret of ['secret-token','hook-secret','never-expose-gemini'])assert.ok(!s.includes(secret));
    const pub=await f.request('/api/legal');assert.ok(!(await pub.text()).includes('council'));
    await f.env.DB.prepare("INSERT INTO blocked_users(user_id,blocked_at) VALUES('admin',1)").run();
    assert.equal((await f.request('/api/admin/council',{headers:{cookie:f.adminCookie}})).status,403);
    await assert.rejects(()=>councilAdmin(new Request('https://studio.test'),f.env,'council',f.user,{} as any),{status:403});
  }finally{f.close();}
});

test('council: fail closed on webhook secret, one-use/expired pairing, group and numeric identity checks',async()=>{
  clearCache();const f=await fixture();try{
    await f.secret('webhook','hook-secret');
    assert.equal((await f.hook(f.webhookMessage(1),'wrong')).status,401);
    const code='a'.repeat(32);
    await f.env.DB.prepare('INSERT INTO council_pairings VALUES(?,?,?)').bind(await sha256(code),'admin',Date.now()+600000).run();
    await f.hook(f.webhookMessage(2,55,-100,'/link '+code));
    assert.equal((await f.env.DB.prepare('SELECT * FROM council_links').first<any>()).tg_user,'55');
    await f.hook(f.webhookMessage(3,66,-200,'/link '+code));
    assert.equal((await f.env.DB.prepare('SELECT * FROM council_links').first<any>()).tg_user,'55');
    await f.env.DB.prepare('INSERT INTO council_pairings VALUES(?,?,?)').bind(await sha256('b'.repeat(32)),'admin',1).run();
    await f.hook(f.webhookMessage(4,66,-200,'/link '+'b'.repeat(32)));
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_links').first<any>()).n,1);
    await f.save(f.enabled());
    await f.hook(f.webhookMessage(5,66));await f.hook(f.webhookMessage(6,55,-200));
    const anonymous=f.webhookMessage(7);(anonymous.message as any).sender_chat={id:-100};await f.hook(anonymous);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,0);
    await f.hook(f.webhookMessage(8));await f.hook(f.webhookMessage(8));
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,1,'duplicate Telegram updates create one job');
    await f.env.DB.prepare("UPDATE users SET email='no-longer-admin@test' WHERE id='admin'").run();
    await f.hook(f.webhookMessage(9));
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,1);
  }finally{f.close();}
});

test('council: free policy never silently expands into paid providers or arbitrary model IDs',()=>{
  const models:any=[{provider:'openai',model:'paid'},{provider:'gemini',model:'gemini-paid'},{provider:'gemini',model:FREE_GEMINI[0]},{provider:'ollama',model:'starter'}];
  assert.deepEqual(councilPlan(models,true,false),[]);
  assert.deepEqual(councilPlan(models,true,true).map(m=>m.provider),['gemini','ollama']);
  assert.equal(councilPlan(models,false,false).length,4);
  const c=councilDefaults();c.agents[1].id=c.agents[0].id;assert.throws(()=>cleanCouncil(c),/trùng/);
  assert.throws(()=>cleanCouncil({...councilDefaults(),agents:[]}),/2/);
  const chunks=telegramParts('🚀'.repeat(5000));assert.equal(chunks.join(''),'🚀'.repeat(5000));assert.ok(chunks.every(x=>x.length<=3400));
});

test('council: durable turns, fallback cursor, bounded daily calls and final approval without execution',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch;let calls=0;try{
    const c=f.enabled();c.agents=c.agents.slice(0,2);c.agents[1].models=[{provider:'gemini',model:FREE_GEMINI[0]},{provider:'gemini',model:FREE_GEMINI[1]}];
    await f.save(c);
    const created=await f.write('/jobs',{brief:'Nội dung cà phê đa kênh'});assert.equal(created.status,201);const {id}=await created.json() as any;
    globalThis.fetch=async(_url,options)=>{
      calls++;const b=JSON.parse(options?.body as string);assert.match(b.systemInstruction.parts[0].text,/Chỉ thảo luận/);
      if(calls===1)return new Response('{}',{status:429});
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Đề xuất và điểm chưa thống nhất.'}]}}]});
    };
    await tickCouncil(f.env);
    let job=await f.env.DB.prepare('SELECT * FROM council_jobs WHERE id=?').bind(id).first<any>();assert.equal(job.attempt,1);assert.equal(job.step,0);
    await f.env.DB.prepare('UPDATE council_jobs SET next_at=0 WHERE id=?').bind(id).run();await tickCouncil(f.env);
    job=await f.env.DB.prepare('SELECT * FROM council_jobs WHERE id=?').bind(id).first<any>();assert.equal(job.step,1);
    const first=await f.env.DB.prepare('SELECT * FROM council_turns WHERE job_id=?').bind(id).first<any>();assert.equal(first.model,FREE_GEMINI[1]);
    await tickCouncil(f.env);assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs WHERE id=?').bind(id).first<any>()).status,'pending');
    assert.equal((await f.write('/jobs/'+id+'/decision',{action:'approved'})).status,200);
    assert.equal((await f.write('/jobs/'+id+'/decision',{action:'rejected'})).status,409);
    await tickCouncil(f.env);assert.equal(calls,3,'approval never triggers execution');
    c.dailyCalls=3;await f.save(c);const more=await f.write('/jobs',{brief:'Một phiên khác'});assert.equal(more.status,201);
    await tickCouncil(f.env);assert.equal(calls,3,'daily cap blocks another request');
    const queued=await f.env.DB.prepare("SELECT * FROM council_jobs WHERE status='running'").first<any>();assert.match(queued.error,/trần/);assert.ok(queued.next_at>Date.now());
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: revoked admin and active lease stop background model calls',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch;try{
    await f.save(f.enabled());await f.write('/jobs',{brief:'Test'});
    globalThis.fetch=async()=>{throw new Error('must not call network');};
    await f.env.DB.prepare('INSERT INTO council_lock VALUES(1,?,?)').bind('someone-else',Date.now()+100000).run();
    await tickCouncil(f.env);assert.equal((await f.env.DB.prepare('SELECT step FROM council_jobs').first<any>()).step,0);
    await f.env.DB.prepare('UPDATE council_lock SET expires=0').run();
    await f.env.DB.prepare("INSERT INTO blocked_users(user_id,blocked_at) VALUES('admin',1)").run();
    await tickCouncil(f.env);assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs').first<any>()).status,'paused');
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: Telegram strangers cannot approve; linked admin decisions are replay safe',async()=>{
  clearCache();const f=await fixture();try{
    await f.save(f.enabled());await f.secret('webhook','hook-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    const result=await f.write('/jobs',{brief:'Test'}),{id}=await result.json() as any;
    await f.env.DB.prepare("UPDATE council_jobs SET status='pending' WHERE id=?").bind(id).run();
    const cb=(update_id:number,user:number,chat:number,action='approved')=>({update_id,callback_query:{id:'cb',from:{id:user},message:{chat:{id:chat,type:'supergroup'}},data:action+':'+id}});
    await f.hook(cb(1,66,-100));await f.hook(cb(2,55,-200));
    assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs').first<any>()).status,'pending');
    await f.hook(cb(3,55,-100));await f.hook(cb(4,55,-100,'rejected'));
    assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs').first<any>()).status,'approved');
  }finally{f.close();}
});

test('council: redirects and arbitrary Ollama hosts never receive credentials',async()=>{
  const orig=globalThis.fetch;let calls=0;try{
    globalThis.fetch=async(_u,o)=>{calls++;assert.equal(o?.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://evil.test'}});};
    await assert.rejects(()=>councilGenerate({OLLAMA_URL:'https://evil.test',OLLAMA_API_KEY:'secret'} as any,{provider:'ollama',model:'m'},'s','u'),{status:400});assert.equal(calls,0);
    await assert.rejects(()=>councilGenerate({GEMINI_API_KEY:'secret'} as any,{provider:'gemini',model:'m'},'s','u'),{status:502});assert.equal(calls,1);
  }finally{globalThis.fetch=orig;}
});

test('council: persisted Telegram outbox delivers role messages and review buttons once',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];try{
    const c=f.enabled();c.agents=c.agents.slice(0,2);await f.save(c);
    await f.secret('bot:editor','123456:fake-server-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/')){sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});}
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Nội dung đề xuất.'}]}}]});
    };
    const result=await f.write('/jobs',{brief:'Nội dung cho các kênh'}),{id}=await result.json() as any;
    await tickCouncil(f.env);await tickCouncil(f.env);await tickCouncil(f.env);await tickCouncil(f.env);
    assert.equal(sent.length,5);assert.match(sent[0].text,/ĐÃ NHẬN NHIỆM VỤ/);assert.match(sent[0].text,/PHÂN CÔNG/);
    assert.match(sent[1].text,/Chiến lược/);assert.match(sent[1].text,/đang làm/);
    assert.ok(sent.some(x=>x.reply_markup?.inline_keyboard?.flat().some((b:any)=>b.callback_data==='approved:'+id)));
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_outbox WHERE sent=1').first<any>()).n,5);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: immediate task receipt, roles and progress use no AI and are restricted to the linked group',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];try{
    await f.save(f.enabled());await f.secret('bot:editor','123456:fake-server-secret');await f.secret('webhook','hook-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      assert.ok(String(url).startsWith('https://api.telegram.org/'),'receipts and status must not consume model quota');
      sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});
    };
    await f.hook(f.webhookMessage(1));await f.hook(f.webhookMessage(1));
    assert.equal(sent.length,1);assert.match(sent[0].text,/ĐÃ NHẬN NHIỆM VỤ/);
    for(const agent of f.enabled().agents)assert.ok(sent[0].text.includes(agent.name));
    const job=await f.env.DB.prepare('SELECT * FROM council_jobs').first<any>();
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,1);
    const detail=await f.request('/api/admin/council/jobs/'+job.id,{headers:{cookie:f.adminCookie}}),d=await detail.json() as any;
    assert.equal(d.progress.completed,0);assert.equal(d.progress.total,5);assert.equal(d.progress.currentAgent,'Chiến lược');
    await f.hook(f.webhookMessage(2,55,-100,'/tientrinh@Faciup_bot'));assert.match(sent.at(-1).text,/TIẾN ĐỘ/);assert.match(sent.at(-1).text,/PHÂN CÔNG/);
    const before=sent.length;await f.hook(f.webhookMessage(3,66,-100,'/tientrinh '+job.id));await f.hook(f.webhookMessage(4,55,-200,'/tientrinh '+job.id));assert.equal(sent.length,before);
    await f.hook(f.webhookMessage(5,55,-100,'Làm bài về cà phê'));assert.match(sent.at(-1).text,/chưa mở phiên/);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: receipt delivery failure preserves accepted job and retries without another opening message',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];let fail=true;try{
    const c=f.enabled();c.agents=c.agents.slice(0,2);await f.save(c);await f.secret('bot:editor','123456:fake-server-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/')){
        if(fail)return new Response('{}',{status:503});
        sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});
      }
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Đề xuất.'}]}}]});
    };
    const result=await f.write('/jobs',{brief:'Nội dung đã nhận'});assert.equal(result.status,201);
    const item=await f.env.DB.prepare('SELECT * FROM council_outbox').first<any>();assert.equal(item.sent,0);assert.equal(item.attempts,1);
    fail=false;await f.env.DB.prepare('UPDATE council_outbox SET next_at=0').run();
    await tickCouncil(f.env);await tickCouncil(f.env);
    assert.equal(sent.filter(x=>x.text.startsWith('ĐÃ NHẬN NHIỆM VỤ')).length,1);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,1);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: exhausted models and daily quota produce visible progress alerts without extra AI calls',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];let models=0;try{
    const c=f.enabled();c.agents=c.agents.slice(0,2);c.agents[1].models=c.agents[1].models.slice(0,1);c.dailyCalls=1;
    await f.save(c);await f.secret('bot:editor','123456:fake-server-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/')){sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});}
      models++;return new Response('{}',{status:429});
    };
    const first=await f.write('/jobs',{brief:'Phiên có mô hình lỗi'}),{id}=await first.json() as any;
    await tickCouncil(f.env);
    assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs WHERE id=?').bind(id).first<any>()).status,'paused');
    assert.ok(sent.some(x=>x.text.includes('Phiên tạm dừng')));assert.equal(models,1);
    await f.write('/jobs',{brief:'Phiên chờ quota ngày sau'});await tickCouncil(f.env);
    assert.ok(sent.some(x=>x.text.includes('Đã đạt trần lượt AI hôm nay')));assert.equal(models,1);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: cancelling during AI network wait cannot commit a turn or deliver content',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch;try{
    await f.save(f.enabled());await f.write('/jobs',{brief:'Nội dung cần hủy'});
    globalThis.fetch=async()=>{
      await f.env.DB.prepare("UPDATE council_jobs SET status='cancelled',lease='' ").run();
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Không được lưu.'}]}}]});
    };
    await tickCouncil(f.env);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_turns').first<any>()).n,0);
    assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs').first<any>()).status,'cancelled');
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: pairing generates the real bot username and replies to success, malformed, expired and private-chat commands',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];try{
    await f.secret('bot:editor','123456:secret-never-echo');await f.secret('webhook','hook-secret');
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith('/getMe'))return Response.json({ok:true,result:{id:123456,username:'Faciup_bot'}});
      if(String(url).endsWith('/getWebhookInfo'))return Response.json({ok:true,result:{url:'https://studio.test/api/council/telegram',pending_update_count:0}});
      if(String(url).endsWith('/sendMessage'))sent.push(JSON.parse(options?.body as string));
      return Response.json({ok:true,result:true});
    };
    const status=await f.request('/api/admin/council/telegram-status',{headers:{cookie:f.adminCookie}}),statusText=await status.text();
    assert.ok(!statusText.includes('secret-never-echo'));assert.equal(JSON.parse(statusText).username,'Faciup_bot');assert.equal(JSON.parse(statusText).webhookMatches,true);
    const pairing=await f.write('/pair'),p=await pairing.json() as any;
    assert.match(p.command,/^\/link@Faciup_bot [a-f0-9]{32}$/);
    await f.hook(f.webhookMessage(1,55,-100,p.command));
    await f.hook(f.webhookMessage(1,55,-100,p.command));
    assert.equal(sent.length,1,'duplicate delivery does not repeat success');assert.match(sent[0].text,/thành công/);assert.match(sent[0].text,/đang tắt/);
    assert.ok(!sent[0].text.includes(p.command.split(' ')[1]),'never echo pairing code');
    await f.hook(f.webhookMessage(2,55,-100,p.command));assert.match(sent.at(-1).text,/đã dùng/);
    await f.hook(f.webhookMessage(3,55,-100,'/link@Faciup_bot'));assert.match(sent.at(-1).text,/thiếu mã/);
    await f.hook(f.webhookMessage(4,55,-100,'/link@Faciup_bot '+'c'.repeat(32)));assert.match(sent.at(-1).text,/không hợp lệ/);
    const privateMessage=f.webhookMessage(5,55,55,p.command);privateMessage.message.chat.type='private';await f.hook(privateMessage);assert.match(sent.at(-1).text,/nhóm Telegram riêng/);
    await f.hook(f.webhookMessage(6,55,-100,'/brief@Faciup_bot Nội dung'));assert.match(sent.at(-1).text,/Nhóm AI đang tắt/i);
    const before=sent.length;await f.hook(f.webhookMessage(7,66,-100,'/brief Nội dung'));assert.equal(sent.length,before,'strangers still cannot use the group');
    await f.hook(f.webhookMessage(8,66,66,'/help'));assert.match(sent.at(-1).text,/quản trị Faciup/);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: named sessions, button-only delegation, rename and approved follow-up preserve the original',async()=>{
  clearCache();const f=await fixture(),orig=globalThis.fetch,sent:any[]=[];try{
    await f.save(f.enabled());await f.secret('bot:editor','123456:fake-server-secret');await f.secret('webhook','hook-secret');
    await f.env.DB.prepare("INSERT INTO council_links VALUES('admin','55','-100')").run();
    globalThis.fetch=async(url,options)=>{
      assert.ok(String(url).startsWith('https://api.telegram.org/'),'menus never call a model');
      if(String(url).endsWith('/sendMessage'))sent.push(JSON.parse(options?.body as string));
      return Response.json({ok:true,result:{message_id:1}});
    };
    const callback=(id:number,data:string,user=55,chat=-100)=>({update_id:id,callback_query:{id:'cb',from:{id:user},message:{chat:{id:chat,type:'supergroup'}},data}});
    assert.equal((await f.write('/menu')).status,200);
    assert.equal(sent.at(-1).reply_markup.inline_keyboard[0][0].callback_data,'ui:new');
    await f.hook(callback(1,'ui:new'));assert.equal(sent.at(-1).reply_markup.force_reply,true);
    await f.hook(f.webhookMessage(2,66,-100,'Không được tạo phiên'));
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_jobs').first<any>()).n,0);
    await f.hook(f.webhookMessage(3,55,-100,'Chiến dịch cà phê tháng 11\nViết nội dung đa kênh'));
    let job=await f.env.DB.prepare('SELECT * FROM council_jobs').first<any>();
    assert.equal(councilTitle(job),'Chiến dịch cà phê tháng 11');assert.ok(!sent.at(-1).text.includes(job.id));
    assert.ok(sent.at(-1).entities.some((e:any)=>e.type==='bold'));
    await f.hook(callback(4,'ui:rename:'+job.id));
    await f.hook(f.webhookMessage(5,55,-100,'Cà phê văn phòng — Tuần 1'));
    job=await f.env.DB.prepare('SELECT * FROM council_jobs WHERE id=?').bind(job.id).first<any>();assert.equal(councilTitle(job),'Cà phê văn phòng — Tuần 1');
    await f.hook(callback(6,'ui:history'));
    assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some((b:any)=>b.text.includes('Cà phê văn phòng')));
    assert.ok(!JSON.stringify(sent.at(-1).text).includes(job.id));
    await f.env.DB.prepare("UPDATE council_jobs SET status='pending',step=5 WHERE id=?").bind(job.id).run();
    await f.env.DB.prepare('INSERT INTO council_turns VALUES(?,?,?,?,?,?,?)').bind(job.id,0,'editor','gemini','m','**Bản đã duyệt**\n***Không hiện dấu sao***\n<img src=x onerror=alert(1)>',Date.now()).run();
    await f.hook(callback(7,'approved:'+job.id));
    assert.match(sent.at(-1).text,/ĐÃ DUYỆT NỘI DUNG/);assert.match(sent.at(-1).text,/chưa tự dựng video hay đăng bài/);
    assert.ok(sent.at(-1).reply_markup.inline_keyboard.flat().some((b:any)=>b.callback_data==='ui:revise:'+job.id));
    await f.hook(callback(8,'ui:view:'+job.id));
    assert.ok(!sent.at(-1).text.includes('***'));assert.equal(sent.at(-1).parse_mode,undefined);assert.ok(sent.at(-1).text.includes('<img'));
    await f.hook(callback(9,'ui:revise:'+job.id));
    await f.hook(f.webhookMessage(10,55,-100,'Đổi caption ngắn hơn'));
    const child=await f.env.DB.prepare('SELECT * FROM council_jobs WHERE parent=?').bind(job.id).first<any>();
    assert.ok(child);assert.match(councilTitle(child),/bản tiếp/);
    assert.equal((await f.env.DB.prepare('SELECT status FROM council_jobs WHERE id=?').bind(job.id).first<any>()).status,'approved');
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_turns WHERE job_id=?').bind(job.id).first<any>()).n,1);
    const before=sent.length;await f.hook(callback(11,'ui:view:'+job.id,55,-200));await f.hook(callback(12,'ui:new',66));assert.equal(sent.length,before);
  }finally{globalThis.fetch=orig;f.close();}
});

test('council: Telegram bold uses safe entities without raw triple stars, HTML parsing or broken Unicode offsets',()=>{
  const result=councilTelegramFormat('🚀 **Cà phê**\n\nPHÂN CÔNG\n***Rõ ràng***\n<b>Văn bản thường</b>');
  assert.ok(!result.text.includes('***'));assert.ok(!result.text.includes('**'));
  assert.ok(result.text.includes('<b>Văn bản thường</b>'));
  const entity=result.entities.find(e=>result.text.slice(e.offset,e.offset+e.length)==='Cà phê');assert.ok(entity);assert.equal(entity.offset,3);
  assert.ok(result.entities.every(e=>e.type==='bold'&&e.length>0&&e.offset+e.length<=result.text.length));
});
