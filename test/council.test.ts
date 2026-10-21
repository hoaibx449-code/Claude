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
import {councilPlan,councilGenerate,FREE_GEMINI} from '../web/src/council-ai.ts';
import {sha256} from '../web/src/util.ts';

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
  const enabled=()=>({...councilDefaults(),enabled:true,freeConfirmed:true});
  const close=()=>{clearCache();rmSync(dir,{recursive:true,force:true});};
  return {env,user,adminCookie,memberCookie,request,write,save,secret,hook,webhookMessage,enabled,close};
}

test('council: actual Worker protects reads, writes, CSRF, blocked admins and private data',async()=>{
  clearCache();const f=await fixture();try{
    for(const path of ['/api/admin/council','/api/admin/council/jobs/'+'a'.repeat(24)]){
      for(const [cookie,status] of [['',401],[f.memberCookie,403],['sid='+'0'.repeat(64),401]]){
        const r=await f.request(path,{headers:{cookie}});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
      }
    }
    for(const route of ['/jobs','/pair','/connect','/unlink']){
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
    const result=await f.write('/jobs',{brief:'Nội dung cho các kênh'}),{id}=await result.json() as any;
    globalThis.fetch=async(url,options)=>{
      if(String(url).startsWith('https://api.telegram.org/')){sent.push(JSON.parse(options?.body as string));return Response.json({ok:true,result:{message_id:1}});}
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Nội dung đề xuất.'}]}}]});
    };
    await tickCouncil(f.env);await tickCouncil(f.env);await tickCouncil(f.env);await tickCouncil(f.env);
    assert.equal(sent.length,2);assert.match(sent[0].text,/Chiến lược/);
    assert.equal(sent[1].reply_markup.inline_keyboard[0][0].callback_data,'approved:'+id);
    assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM council_outbox WHERE sent=1').first<any>()).n,2);
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
