import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { normalizeMessage, webhookSecret, zaloAdmin, zaloWebhook, resumeZalo } from '../web/src/zalo.ts';

async function fixture(run: (f: any) => Promise<void>) {
 const dir=mkdtempSync(join(tmpdir(),'zalo-')), originalFetch=globalThis.fetch;
 try {
  const env: any={DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ZALO_BOT_TOKEN:'test-token',PUBLIC_URL:'https://studio.test',DAILY_SCRIPTS:'20',DAILY_IMAGES:'60',DAILY_RENDERS:'5'};
  env.config=defaultConfig(env);env.config.zalo.enabled=true;
  const pending: Promise<unknown>[]=[], log: any[]=[], sent: any[]=[];
  const rc: any={userId:null,channel:'zalo',quiet:false,log(type: string, extra: any){log.push({type,...extra});},wait(p: Promise<unknown>){pending.push(p);}};
  let response: any={ok:true,result:{message_id:'reply'}};
  globalThis.fetch=async (url: any, options: any)=>{assert.ok(String(url).startsWith('https://bot-api.zaloplatforms.com/bot'));sent.push({url:String(url),body:JSON.parse(options.body)});return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});};
  const drain=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  const receive=async (text: any, id='m1', secret?: string)=>zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-zalo-signature':secret??await webhookSecret(env)},body:JSON.stringify({event_name:'message.text.received',message:{message_id:id,chat:{id:'chat-1'},from:{display_name:'Khách thử'},...(text===undefined?{}:{text})}})}),env,rc);
  await run({env,rc,sent,log,receive,drain,setResponse:(value: any)=>{response=value;}});
 }finally{globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true});}
}
test('Zalo normalizes wrapped Bot Platform updates without pretending OA events are Bot messages',()=>{
 assert.equal(normalizeMessage({result:{event_name:'message.text.received',message:{chat:{id:123},text:'GIUP',message_id:'1'}}})?.chatId,'123');
 assert.equal(normalizeMessage({event_name:'user_send_text',sender:{id:'123'},message:{text:'x'}}),null);
});
test('Zalo records incoming GIUP, replies, and does not repeat a delivered webhook',async()=>fixture(async f=>{
 assert.equal((await f.receive('GIUP')).status,200);await f.drain();
 const received=await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='m1'").first();assert.equal(received.status,'handled');
 assert.equal((await f.env.DB.prepare('SELECT * FROM zalo_outbox').first()).status,'sent');assert.match(f.sent[0].body.text,/HUONGDAN|KB/);
 await f.receive('GIUP');await f.drain();assert.equal(f.sent.length,1);
 const inbox=await (await zaloAdmin(new Request('https://studio.test/api/admin/zalo/inbox'),f.env,f.env,'zalo/inbox','GET',f.rc)).json();assert.equal(inbox.messages.length,1);assert.equal(inbox.replies[0].status,'sent');
}));
test('Zalo answers 200 but refuses wrong secrets, disabled configuration and unsupported payloads, logging why',async()=>fixture(async f=>{
 const refused=async (res: Response)=>{assert.equal(res.status,200);assert.equal((await res.json()).ok,false);};
 await refused(await f.receive('GIUP','m1','wrong'));assert.equal(await f.env.DB.prepare('SELECT * FROM zalo_messages').first(),null);
 f.env.config.zalo.enabled=false;await refused(await f.receive('GIUP'));f.env.config.zalo.enabled=true;
 await refused(await zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-zalo-signature':await webhookSecret(f.env)},body:'{"event_name":"user_send_text"}'}),f.env,f.rc));
 assert.ok(f.log.some((e: any)=>e.type==='zalo.webhook'&&e.ok===false&&/sai mã/.test(e.data.error)));

}));
test('Zalo token cleanup strips pasted bot prefix and quotes',async()=>{
 const { cleanToken }=await import('../web/src/zalo.ts');
 assert.equal(cleanToken(' "bot123:abc" '),'123:abc');assert.equal(cleanToken('123:abc'),'123:abc');
});
test('Zalo HTTP 200 without ok:true is a failed reply; retry persists the actual result',async()=>fixture(async f=>{
 f.setResponse({description:'temporary service failure'});await f.receive('GIUP');await f.drain();
 const failed=await f.env.DB.prepare('SELECT * FROM zalo_outbox').first();assert.equal(failed.status,'failed');assert.match(failed.error,/temporary/);
 f.setResponse({ok:true,result:{message_id:'success'}});
 const result=await zaloAdmin(new Request('https://studio.test/api/admin/zalo/retry',{method:'POST',body:JSON.stringify({replyId:failed.id})}),f.env,f.env,'zalo/retry','POST',f.rc);assert.equal((await result.json()).ok,true);
 assert.equal((await f.env.DB.prepare('SELECT * FROM zalo_outbox').first()).status,'sent');
}));
test('non-text and quota exhaustion both receive an explicit response',async()=>fixture(async f=>{
 await f.receive(undefined,'photo');await f.drain();assert.match(f.sent[0].body.text,/tin nhắn chữ/);
 await f.env.DB.prepare("INSERT INTO usage(user_id,day,kind,n) VALUES('z:chat-1',?,'zalo',60)").bind(new Date().toISOString().slice(0,10)).run();
 await f.receive('GIUP','over-limit');await f.drain();assert.match(f.sent.at(-1).body.text,/hết lượt/);
}));
test('multiline KB creates and queues a video; replay uses the saved checkpoint',async()=>fixture(async f=>{
 await f.receive('KB\nBắt đầu từ một bước nhỏ. Bạn có thể làm ngay hôm nay.','script');await f.drain();
 const row=await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='script'").first();assert.equal(row.status,'handled');assert.ok(row.project_id);assert.ok(row.job_id);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first()).n,1);
 await f.env.DB.prepare("UPDATE zalo_messages SET status='failed' WHERE id='script'").run();
 await resumeZalo(f.env,f.rc);await f.drain();
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first()).n,1);
 assert.match(f.sent.at(-1).body.text,/đã vào hàng chờ/);
}));
test('processing failures remain retryable instead of being permanently marked as seen',async()=>fixture(async f=>{
 const prepare=f.env.DB.prepare.bind(f.env.DB);let failOnce=true;
 f.env.DB.prepare=(sql: string)=>{
  const statement=prepare(sql);
  if(sql.startsWith('SELECT l.user_id')) {const first=statement.first.bind(statement);statement.first=async()=>{if(failOnce){failOnce=false;throw new Error('temporary database failure');}return first();};}
  return statement;
 };
 await f.receive('GIUP','retryable');await f.drain();
 let row=await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='retryable'").first();assert.equal(row.status,'failed');assert.equal(row.attempts,1);
 await resumeZalo(f.env,f.rc);await f.drain();
 row=await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='retryable'").first();assert.equal(row.status,'handled');assert.equal(row.attempts,2);
}));
test('blocked Zalo accounts receive an explanation and cannot queue another video',async()=>fixture(async f=>{
 await f.receive('KB Bắt đầu từ một bước nhỏ. Bạn có thể làm ngay hôm nay.','first');await f.drain();
 const link=await f.env.DB.prepare("SELECT user_id FROM zalo_links WHERE chat_id='chat-1'").first();
 await f.env.DB.prepare('INSERT INTO blocked_users(user_id,blocked_at) VALUES(?,?)').bind(link.user_id,Date.now()).run();
 await f.receive('KB Kịch bản khác đủ dài để dựng một video mới.','blocked');await f.drain();
 assert.match(f.sent.at(-1).body.text,/bị khóa/);assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first()).n,1);
}));
test('SDK X-Zalo-Signature authenticates a received update and delivers exactly one reply',async()=>fixture(async f=>{
 const secret=await webhookSecret(f.env);
 const update={event_name:'message.text.received',message:{message_id:'sdk-1',date:1700000000,chat:{id:'sdk-chat',chat_type:'PRIVATE'},from:{id:'sdk-user',display_name:'SDK'},text:'GIUP'}};
 const send=async(headers: Record<string,string>,url='https://studio.test/api/zalo/webhook')=>zaloWebhook(new Request(url,{method:'POST',headers,body:JSON.stringify(update)}),f.env,f.rc);
 assert.equal((await (await send({'X-Zalo-Signature':'wrong'})).json()).ok,false);
 assert.equal((await (await send({'X-Zalo-Signature':'wrong'},'https://studio.test/api/zalo/webhook?s='+secret)).json()).ok,false);
 assert.equal(await f.env.DB.prepare('SELECT * FROM zalo_messages').first(),null);
 assert.equal((await (await send({'X-Zalo-Signature':secret})).json()).recorded,true);await f.drain();
 assert.equal((await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='sdk-1'").first()).status,'handled');
 assert.equal(f.sent[0].body.chat_id,'sdk-chat');assert.match(f.sent[0].body.text,/HUONGDAN|KB/);
 await send({'X-Zalo-Signature':secret});await f.drain();assert.equal(f.sent.length,1);
 assert.ok(!JSON.stringify(f.log).includes(secret));
}));

test('direct webhook is default, legacy relay settings migrate, and polling never runs implicitly',async()=>fixture(async f=>{
 const { receiveMode,pollZalo }=await import('../web/src/zalo.ts');
 const { cleanConfig }=await import('../web/src/settings.ts');
 assert.equal(await receiveMode(f.env),'webhook');
 for(const receive of ['relay','auto']) {
  const migrated=cleanConfig({...f.env.config,zalo:{...f.env.config.zalo,receive}},f.env.config);
  assert.equal(migrated.zalo.receive,'webhook');
 }
 await pollZalo(f.env,f.rc,4000);assert.equal(f.sent.length,0);
 const secret=await webhookSecret(f.env);
 const refused=await zaloWebhook(new Request('https://studio.test/api/zalo/webhook?s='+secret,{method:'POST',body:'{}'}),f.env,f.rc);
 assert.equal((await refused.json()).ok,false);
 await assert.rejects(zaloAdmin(new Request('https://studio.test/api/admin/zalo/relay'),f.env,f.env,'zalo/relay','GET',f.rc),/Không tìm thấy/);
}));
test('SDK setWebhook registers a direct HTTPS URL and secret_token without relay query',async()=>fixture(async f=>{
 f.setResponse({ok:true,result:{url:'https://studio.test/api/zalo/webhook'}});
 const result=await zaloAdmin(new Request('https://studio.test/api/admin/zalo/connect',{method:'POST'}),f.env,f.env,'zalo/connect','POST',f.rc);
 assert.equal((await result.json()).ok,true);
 const registered=f.sent.find((s: any)=>s.url.endsWith('/setWebhook'));
 assert.deepEqual(registered.body,{url:'https://studio.test/api/zalo/webhook',secret_token:await webhookSecret(f.env)});
 assert.ok(!JSON.stringify(f.log).includes(registered.body.secret_token));
}));

test('connection does not report success until Zalo confirms the direct webhook URL',async()=>fixture(async f=>{
 for(const result of [{url:'https://script.google.com/macros/s/old/exec'},{}]) {
  f.setResponse({ok:true,result});
  await assert.rejects(zaloAdmin(new Request('https://studio.test/api/admin/zalo/connect',{method:'POST'}),f.env,f.env,'zalo/connect','POST',f.rc),/Chưa xác minh/);
 }
 assert.equal(await f.env.DB.prepare("SELECT * FROM settings WHERE key='zalo:recv'").first(),null);
}));
