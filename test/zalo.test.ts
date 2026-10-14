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
  globalThis.fetch=async (url: any, options: any)=>{assert.ok(String(url).startsWith('https://bot-api.zaloplatforms.com/bot'));if(!String(url).endsWith('/sendChatAction'))sent.push({url:String(url),body:JSON.parse(options.body)});return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});};
  const drain=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  const receive=async (text: any, id='m1', secret?: string)=>zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-bot-api-secret-token':secret??await webhookSecret(env)},body:JSON.stringify({event_name:'message.text.received',message:{message_id:id,chat:{id:'chat-1'},from:{display_name:'Khách thử'},...(text===undefined?{}:{text})}})}),env,rc);
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
 await refused(await zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-bot-api-secret-token':await webhookSecret(f.env)},body:'{"event_name":"user_send_text"}'}),f.env,f.rc));
 assert.ok(f.log.some((e: any)=>e.type==='zalo.webhook'&&e.ok===false&&/sai mã/.test(e.data.error)));
 // the secret may also arrive in the webhook address
 const viaQuery=await zaloWebhook(new Request('https://studio.test/api/zalo/webhook?s='+await webhookSecret(f.env),{method:'POST',body:JSON.stringify({event_name:'message.text.received',message:{message_id:'q1',chat:{id:'chat-q'},from:{display_name:'Q'},text:'GIUP'}})}),f.env,f.rc);
 assert.equal((await viaQuery.json()).recorded,true);await f.drain();
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
test('standalone bot like the Zalo Bot SDK: direct webhook, SDK header accepted, old shared-bot setting becomes webhook',async()=>fixture(async f=>{
 const { receiveMode, pollZalo } = await import('../web/src/zalo.ts');
 const { cleanConfig } = await import('../web/src/settings.ts');
 // the removed Apps Script relay setting turns into the direct webhook
 assert.equal(cleanConfig({zalo:{receive:'relay'}},f.env.config).zalo.receive,'webhook');
 assert.equal(defaultConfig(f.env).zalo.receive,'webhook');
 assert.equal(await receiveMode(f.env),'webhook');
 // X-Zalo-Signature (SDK example) carries the same secret
 const res=await zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'content-type':'application/json','x-zalo-signature':await webhookSecret(f.env)},body:JSON.stringify({event_name:'message.text.received',message:{message_id:'s1',chat:{id:'chat-9',chat_type:'PRIVATE'},from:{id:'u9',display_name:'Khách'},text:'GIUP'}})}),f.env,f.rc);
 assert.equal((await res.json()).recorded,true);await f.drain();
 assert.equal(f.sent.at(-1).body.chat_id,'chat-9');
 // no forwarding address any more
 await assert.rejects(zaloAdmin(new Request('https://studio.test/api/admin/zalo/relay'),f.env,f.env,'zalo/relay','GET',f.rc),/Không tìm thấy/);
 // "Kết nối webhook" moves the bot here with url + secret_token, as SetWebhookRequest does
 f.setResponse({ok:true,result:{url:'https://studio.test/api/zalo/webhook?s='+await webhookSecret(f.env)}});
 const before=f.sent.length;
 const connected=await (await zaloAdmin(new Request('https://studio.test/api/admin/zalo/connect',{method:'POST'}),f.env,f.env,'zalo/connect','POST',f.rc)).json();
 assert.equal(connected.url,'https://studio.test/api/zalo/webhook');
 const set=f.sent.slice(before).find((x: any)=>/setWebhook$/.test(x.url));assert.equal(set.body.secret_token,await webhookSecret(f.env));
 // polling never removes another site's webhook by itself: the admin moves it with "Kết nối webhook"
 f.env.config.zalo.receive='poll';f.setResponse({ok:true,result:{url:'https://script.google.com/macros/s/abc/exec'}});
 const b2=f.sent.length;const r=await pollZalo(f.env,f.rc,4000);
 assert.equal(r.error,'foreign webhook');assert.ok(!f.sent.slice(b2).some((x: any)=>/deleteWebhook/.test(x.url)));
}));
test('commands typed the way people speak: Vietnamese words with spaces, accents and punctuation',async()=>{
 const { parseCommand }=await import('../web/src/zalo.ts');
 const c=(t: string)=>parseCommand(t).cmd;
 assert.equal(c('Hướng dẫn'),'HUONGDAN');assert.equal(c('trạng thái?'),'TT');assert.equal(c('Danh sách'),'DS');assert.equal(c('Hủy kết nối'),'HUYKETNOI');
 assert.equal(c('Định dạng 2'),'DINHDANG');assert.deepEqual(parseCommand('Định dạng 2').rest,['2']);assert.equal(c('GIUP!'),'GIUP');assert.equal(c('/start'),'START');
 assert.deepEqual(parseCommand('KETNOI: abc123'),{cmd:'KETNOI',rest:['abc123'],arg:'abc123'});
 assert.equal(parseCommand('Kịch bản mẫu 3').cmd,'MAU');assert.equal(parseCommand('Kịch bản: Một câu.\nHai câu.').arg,'Một câu.\nHai câu.');
 assert.equal(parseCommand('Tạo video vì sao lương không tăng').arg,'vì sao lương không tăng');
});
test('natural commands get real answers, and a new chat typing a valid command is never told "chưa hiểu"',async()=>fixture(async f=>{
 const last=()=>f.sent.at(-1).body.text;
 await f.receive('Trạng thái','n1');await f.drain();assert.match(last(),/chưa có video/);
 await f.receive('Hủy kết nối','n2');await f.drain();assert.match(last(),/chưa kết nối/);
 await f.receive('Hướng dẫn','n3');await f.drain();assert.match(last(),/KB/);
 await f.receive('Khung ngang','n4');await f.drain();assert.match(last(),/ngang 16:9/);
 await f.receive('KHUNG 9:16','n5');await f.drain();assert.match(last(),/dọc 9:16/);
 await f.receive('Định dạng','n6');await f.drain();assert.match(last(),/Chọn định dạng/);
 await f.receive('Tắt','n7');await f.drain();assert.match(last(),/tắt thông báo/);
 assert.ok(!f.sent.some((s: any)=>/chưa hiểu/.test(s.body.text)));
 await f.receive('blah blah','n8');await f.drain();assert.match(last(),/chưa hiểu/);
 // guests not allowed: told to link instead of "chưa hiểu"
 f.env.config.zalo.allowGuests=false;
 await f.env.DB.prepare("DELETE FROM zalo_links").run();
 await f.receive('Giọng đọc','n9');await f.drain();assert.match(last(),/kết nối tài khoản/);
}));
test('AI work is left to the minute job (a webhook call only lives 30 seconds), acknowledged once',async()=>fixture(async f=>{
 f.env.GEMINI_API_KEY='g';f.env.config.zalo.scriptSource='mine-ai';
 const res=await (await f.receive('KB Bắt đầu từ một bước nhỏ. Bạn có thể làm ngay hôm nay.','ai')).json();await f.drain();
 assert.equal(res.deferred,true);
 assert.equal((await f.env.DB.prepare("SELECT status FROM zalo_messages WHERE id='ai'").first()).status,'received');
 assert.equal(f.sent.filter((s: any)=>/Đã nhận/.test(s.body.text)).length,1);
 await resumeZalo(f.env,f.rc);await f.drain();
 assert.equal((await f.env.DB.prepare("SELECT status FROM zalo_messages WHERE id='ai'").first()).status,'handled');
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first()).n,1);
 assert.equal(f.sent.filter((s: any)=>/^Đã nhận, mình đang/.test(s.body.text)).length,1);
 assert.match(f.sent.at(-1).body.text,/đang được dựng/);
 // quick commands are still answered straight away
 const quick=await (await f.receive('GIUP','fast')).json();await f.drain();assert.equal(quick.deferred,undefined);
}));
