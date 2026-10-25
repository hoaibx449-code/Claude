import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { normalizeMessage, webhookSecret, zaloAdmin, zaloWebhook, resumeZalo } from '../web/src/zalo.ts';
import {addOwner} from '../web/src/zalo-owners.ts';

async function fixture(run: (f: any) => Promise<void>) {
 const dir=mkdtempSync(join(tmpdir(),'zalo-')), originalFetch=globalThis.fetch;
 try {
  const objects=new Map<string, any>();
  const BUCKET={async head(k: string){return objects.has(k)?{size:objects.get(k).length}:null;},async get(k: string){return objects.has(k)?{body:objects.get(k),httpMetadata:{}}:null;},async put(k: string,v: any){objects.set(k,v);},
   async list({prefix}: any){return {objects:[...objects.keys()].filter((k)=>k.startsWith(prefix)).map((key)=>({key}))};},async delete(keys: any){for(const k of [keys].flat())objects.delete(k);}};
  const env: any={BUCKET,DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ZALO_BOT_TOKEN:'test-token',PUBLIC_URL:'https://studio.test',DAILY_SCRIPTS:'20',DAILY_IMAGES:'60',DAILY_RENDERS:'5'};
  env.config=defaultConfig(env);env.config.zalo.enabled=true;env.OPENAI_TEXT_MODEL='fixture-test';env.config.defaults.textAI='openai';
  const pending: Promise<unknown>[]=[], log: any[]=[], sent: any[]=[];
  const rc: any={userId:null,channel:'zalo',quiet:false,log(type: string, extra: any){log.push({type,...extra});},wait(p: Promise<unknown>){pending.push(p);}};
  let response: any={ok:true,result:{message_id:'reply'}};
  globalThis.fetch=async (url: any, options: any)=>{
   if(String(url)==='https://api.openai.com/v1/chat/completions') {
    const user=JSON.parse(options.body).messages[1].content;
    const scenes=user.split(/Cảnh \d+: /).slice(1).map((line: string)=>{
     const lines=line.trim().split(/\[câu \d+\] /).filter(Boolean);
     return {lines,x:{keys:[lines[0].split(' ')[0]]},diagram:{kind:'sketch',items:[{t:'text',id:'t',text:'Bắt đầu',x:50,y:10,size:'l'},{t:'icon',id:'i',name:'calendar',x:50,y:55,w:30}]}};
    });
    return Response.json({choices:[{message:{content:JSON.stringify({title:'Video thử',scenes})}}]});
   }
   if(!String(url).startsWith('https://bot-api.zaloplatforms.com/bot'))return new Response('{}',{status:404});if(!String(url).endsWith('/sendChatAction'))sent.push({url:String(url),body:JSON.parse(options.body)});return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});};
  await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('ink:voicechecks',?,0)").bind(JSON.stringify({'microsoft:vi-VN-HoaiMyNeural':{ok:true,at:1},'microsoft:vi-VN-NamMinhNeural':{ok:true,at:1}})).run();
  const drain=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  const receive=async (text: any, id='m1', secret?: string)=>zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-bot-api-secret-token':secret??await webhookSecret(env)},body:JSON.stringify({event_name:'message.text.received',message:{message_id:id,chat:{id:'chat-1'},from:{display_name:'Khách thử'},...(text===undefined?{}:{text})}})}),env,rc);
  await run({env,rc,sent,log,receive,drain,objects,enableAI:()=>{env.OPENAI_API_KEY='fixture-only';},setResponse:(value: any)=>{response=value;}});
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
 await f.receive(undefined,'photo');await f.drain();assert.match(f.sent[0].body.text,/nhắn chữ/);
 await f.env.DB.prepare("INSERT INTO usage(user_id,day,kind,n) VALUES('z:chat-1',?,'zalo',?)").bind(new Date().toISOString().slice(0,10),f.env.config.zalo.perDay).run();
 await f.receive('GIUP','over-limit');await f.drain();assert.match(f.sent.at(-1).body.text,/Hôm nay bạn đã nhắn 300 tin/);
 // the admin's limit is the one used, and raising it lets the person continue at once
 f.env.config.zalo.perDay=1000;await f.receive('GIUP','after-raise');await f.drain();assert.doesNotMatch(f.sent.at(-1).body.text,/Hôm nay bạn đã nhắn/);
}));
test('multiline KB queues an Ink video at once; a replayed message never makes a second one',async()=>fixture(async f=>{
 f.enableAI();
 const res=await (await f.receive('KB\nBắt đầu từ một bước nhỏ mỗi ngày. Bạn có thể làm ngay hôm nay, không cần chờ.','script')).json();await f.drain();
 assert.equal(res.deferred,undefined);
 const row=await f.env.DB.prepare("SELECT * FROM zalo_messages WHERE id='script'").first();assert.equal(row.status,'handled');assert.match(row.job_id,/^ink:[a-f0-9]{24}$/);
 const job=await f.env.DB.prepare('SELECT * FROM ink_jobs').first(), input=JSON.parse(job.input);
 assert.equal(input.mode,'script');assert.match(input.script,/bước nhỏ/);assert.equal(input.zalo,'chat-1');assert.equal(input.format,'ink');assert.equal(input.browser,false);assert.equal(input.review,true);
 assert.match(f.sent.at(-1).body.text,/Đã nhận video từ kịch bản.*duyệt/s);
 await f.env.DB.prepare("UPDATE zalo_messages SET status='failed' WHERE id='script'").run();
 await resumeZalo(f.env,f.rc);await f.drain();
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM ink_jobs').first()).n,1);
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
 f.enableAI();
 await f.receive('TAO thói quen tiết kiệm','first');await f.drain();
 const link=await f.env.DB.prepare("SELECT user_id FROM zalo_links WHERE chat_id='chat-1'").first();
 await f.env.DB.prepare('INSERT INTO blocked_users(user_id,blocked_at) VALUES(?,?)').bind(link.user_id,Date.now()).run();
 await f.receive('TAO một chủ đề khác','blocked');await f.drain();
 assert.match(f.sent.at(-1).body.text,/bị khóa/);assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM ink_jobs').first()).n,1);
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
 await f.receive('Khung ngang','n4');await f.drain();assert.match(last(),/dọc 9:16/);
 await f.receive('Định dạng','n6');await f.drain();assert.match(last(),/Chọn định dạng|dựng theo kiểu/);
 await f.receive('Tắt','n7');await f.drain();assert.match(last(),/tắt thông báo/);
 assert.ok(!f.sent.some((s: any)=>/chưa hiểu/.test(s.body.text)));
 await f.receive('blah blah','n8');await f.drain();assert.doesNotMatch(last(),/chưa hiểu/);assert.match(last(),/1\. .+\n2\. .+bảng giá|Xem bảng giá/);
 // guests not allowed: told to link instead of "chưa hiểu"
 f.env.config.zalo.allowGuests=false;
 await f.env.DB.prepare("DELETE FROM zalo_links").run();
 await f.receive('Giọng đọc','n9');await f.drain();assert.match(last(),/kết nối tài khoản/);
}));
test('the storyboard is reviewed in Zalo: OK makes it, SUA plans again with the change, HUY drops it and gives the video back',async()=>fixture(async f=>{
 f.enableAI();
 const { zaloInk }=await import('../web/src/zalo.ts');
 await f.receive('TAO vì sao lương mãi không tăng','t1');await f.drain();
 let j=await f.env.DB.prepare('SELECT * FROM ink_jobs').first();
 // "ok" with nothing to approve is only a word in a conversation
 const before=f.sent.length;
 await f.env.DB.prepare("UPDATE ink_jobs SET status='review', storyboard=? WHERE id=?").bind(JSON.stringify({title:'Lương',scenes:[{say:'Câu mở đầu.'},{say:'Câu thứ hai.'}]}),j.id).run();
 j=await f.env.DB.prepare('SELECT * FROM ink_jobs').first();
 await zaloInk(f.env,f.rc,j,'review',JSON.parse(j.storyboard));
 const review=f.sent.slice(before).map((x: any)=>x.body.text).join('\n');assert.match(review,/Phân cảnh "vì sao lương mãi không tăng" \(2 cảnh\)/);assert.match(review,/1\. Câu mở đầu\./);assert.match(review,/OK để dựng/);
 await f.receive('SUA mở đầu bằng một câu hỏi','t2');await f.drain();
 assert.match(f.sent.at(-1).body.text,/làm lại phân cảnh/);
 const rows=(await f.env.DB.prepare('SELECT * FROM ink_jobs').all()).results;assert.equal(rows.length,1);assert.notEqual(rows[0].id,j.id);
 const input=JSON.parse(rows[0].input);assert.match(input.notes,/mở đầu bằng một câu hỏi/);assert.equal(input.zalo,'chat-1');assert.equal(rows[0].parent,j.id);
 await f.env.DB.prepare("UPDATE ink_jobs SET status='review' WHERE id=?").bind(rows[0].id).run();
 await f.receive('ok','t3');await f.drain();
 assert.match(f.sent.at(-1).body.text,/Đã duyệt/);
 const made=await f.env.DB.prepare('SELECT status, stage FROM ink_jobs').first();assert.equal(made.status,'queued');assert.equal(made.stage,'render');
 await f.env.DB.prepare("UPDATE ink_jobs SET status='review'").run();
 const used=async()=>(await f.env.DB.prepare("SELECT COALESCE(SUM(n),0) AS n FROM usage WHERE kind='render'").first()).n;
 const n=await used();
 await f.receive('HUY','t4');await f.drain();
 assert.match(f.sent.at(-1).body.text,/Đã bỏ phân cảnh/);assert.equal((await f.env.DB.prepare('SELECT COUNT(*) AS n FROM ink_jobs').first()).n,0);assert.equal(await used(),n-1);
 await f.receive('HUY','t5');await f.drain();assert.match(f.sent.at(-1).body.text,/Không có phân cảnh nào/);
}));
test('a finished Ink video comes back as its cover with a no-login link that plays it; TT finds it too',async()=>fixture(async f=>{
 f.enableAI();
 const { zaloInk, shareInk }=await import('../web/src/zalo.ts');
 await f.receive('TAO thói quen đọc sách','v1');await f.drain();
 const j=await f.env.DB.prepare('SELECT * FROM ink_jobs').first();
 f.objects.set(`ink/${j.user_id}/${j.id}/video.mp4`,'mp4-bytes');f.objects.set(`ink/${j.user_id}/${j.id}/cover.jpg`,'jpg');
 await f.env.DB.prepare("UPDATE ink_jobs SET status='done', meta=? WHERE id=?").bind(JSON.stringify({files:['video.mp4','cover.jpg']}),j.id).run();
 await zaloInk(f.env,f.rc,{...(await f.env.DB.prepare('SELECT * FROM ink_jobs').first()),duration:42},'done');
 const photo=f.sent.at(-1);assert.match(photo.url,/sendPhoto$/);assert.match(photo.body.caption,/42 giây/);
 const link=photo.body.caption.match(/https:\/\/\S+/)[0];assert.match(link,new RegExp(`/api/share/ink/${j.id}\\?e=`));assert.match(photo.body.photo,/\/cover\.jpg\?e=/);
 const res=await shareInk(f.env,f.rc,new Request(link),j.id,'');assert.equal(res.status,200);
 await assert.rejects(shareInk(f.env,f.rc,new Request(link.replace(/s=\w+/,'s=bad')),j.id,''),/hết hạn/);
 await f.receive('TT','v2');await f.drain();assert.match(f.sent.at(-1).body.text,/thói quen đọc sách: đã xong\n\s+https:\/\/studio\.test\/api\/share\/ink\//);
 // turned off with TAT: no news of the video
 await f.env.DB.prepare('UPDATE zalo_links SET notify=0').run();const n=f.sent.length;
 await zaloInk(f.env,f.rc,j,'done');assert.equal(f.sent.length,n);
}));
test('Zalo video kind: the admin default is used, and DINHDANG offers only the ticked kinds that can be made',async()=>fixture(async f=>{
 f.enableAI();
 const c=f.env.config;
 // real footage needs its footage library: not offered without it
 await f.receive('DINHDANG','d0');await f.drain();assert.match(f.sent.at(-1).body.text,/Vẽ tay/);assert.doesNotMatch(f.sent.at(-1).body.text,/Điện ảnh/);
 f.env.PIXABAY_API_KEY='p';c.zalo.formats={default:'cine',allowed:['ink','cine']};
 await f.receive('DINHDANG','d1');await f.drain();
 const list=f.sent.at(-1).body.text;assert.match(list,/1\. Vẽ tay/);assert.match(list,/2\. Điện ảnh/);
 await f.receive('TAO vì sao nên ngủ sớm','v1');await f.drain();
 assert.equal(JSON.parse((await f.env.DB.prepare('SELECT input FROM ink_jobs ORDER BY created_at DESC').first()).input).format,'cine');
 await f.receive('DINHDANG 1','d2');await f.drain();assert.match(f.sent.at(-1).body.text,/Vẽ tay/);
 await f.env.DB.prepare('DELETE FROM ink_jobs').run();
 await f.receive('TAO một chủ đề khác nữa','v2');await f.drain();
 assert.equal(JSON.parse((await f.env.DB.prepare('SELECT input FROM ink_jobs').first()).input).format,'ink');
 // settings saved before (old format keys) still give a working choice
 const { cleanConfig }=await import('../web/src/settings.ts');
 assert.deepEqual(cleanConfig({zalo:{formats:{default:'kinetic',allowed:['kinetic','classic-sketch']}}},defaultConfig(f.env)).zalo.formats,{default:'ink',allowed:['ink','cine','money']});
 // the full list from before 'Đòn Bẩy Tư Duy' offers it too
 assert.deepEqual(cleanConfig({zalo:{formats:{default:'cine',allowed:['ink','cine']}}},defaultConfig(f.env)).zalo.formats.allowed,['ink','cine','money']);
 // 'Đòn Bẩy Tư Duy' from Zalo: the series' own kind, made on the render machines
 c.zalo.formats={default:'money',allowed:['money']};await f.env.DB.prepare('DELETE FROM ink_jobs').run();await f.env.DB.prepare("DELETE FROM usage WHERE kind='render'").run();
 await f.receive('TAO vì sao lương tăng mà vẫn hết tiền','v3');await f.drain();
 const inp=JSON.parse((await f.env.DB.prepare('SELECT input FROM ink_jobs').first()).input);assert.equal(inp.format,'money');assert.equal(inp.browser,false);assert.match(f.sent.at(-1).body.text,/Đòn Bẩy Tư Duy/);
}));
test('the webhook is never dropped for being quiet, and is put back when something else moves or deletes it',async()=>fixture(async f=>{
 const { receiveMode, keepWebhook } = await import('../web/src/zalo.ts');
 const { cleanConfig } = await import('../web/src/settings.ts');
 // the old "auto" mode (which deleted the webhook after 15 quiet minutes) is now the plain webhook
 assert.equal(cleanConfig({zalo:{receive:'auto'}},f.env.config).zalo.receive,'webhook');
 f.env.config.zalo.receive='auto';assert.equal(await receiveMode(f.env),'webhook');f.env.config.zalo.receive='webhook';
 f.env.config.zalo.ownerChat='owner-1';
 const ours='https://studio.test/api/zalo/webhook';
 f.setResponse({ok:true,result:{url:ours}});
 await zaloAdmin(new Request('https://studio.test/api/admin/zalo/connect',{method:'POST'}),f.env,f.env,'zalo/connect','POST',f.rc);
 // someone else took it (an old Apps Script with the same token)
 f.setResponse({ok:true,result:{url:'https://script.google.com/macros/s/abc/exec'}});
 let before=f.sent.length;
 const r=await keepWebhook(f.env,f.rc);
 assert.equal(r.found,'https://script.google.com/macros/s/abc/exec');
 const set=f.sent.slice(before).find((x: any)=>/setWebhook$/.test(x.url));assert.equal(set.body.url,ours);
 assert.ok(f.sent.slice(before).some((x: any)=>x.body.chat_id==='owner-1'&&/Webhook Zalo vừa bị chuyển sang https:\/\/script\.google\.com/.test(x.body.text)));
 assert.ok(!f.sent.slice(before).some((x: any)=>/deleteWebhook/.test(x.url)));
 // still ours: nothing to do
 f.setResponse({ok:true,result:{url:ours}});before=f.sent.length;
 assert.equal((await keepWebhook(f.env,f.rc)).ok,true);assert.ok(!f.sent.slice(before).some((x: any)=>/setWebhook$/.test(x.url)));
 // the admin can turn the keeper off
 f.env.config.zalo.keepWebhook=false;assert.equal((await keepWebhook(f.env,f.rc)).checked,false);
}));

test('people answer the offered choices with a number, without any command',async()=>fixture(async f=>{
 f.env.config.plans.find((p: any)=>p.price>0).visible=true;
 await f.receive('chào shop','n1');await f.drain();
 assert.match(f.sent.at(-1).body.text,/1\. Làm thử một video miễn phí\n2\. Xem video mẫu\n3\. Xem bảng giá/);
 await f.receive('3','n2');await f.drain();
 assert.match(f.sent.at(-1).body.text,/199\.000đ/);
 const lead=await f.env.DB.prepare("SELECT stage, quoted_at FROM zalo_leads WHERE chat_id='chat-1'").first();
 assert.equal(lead.stage,'quoted');assert.ok(lead.quoted_at);
}));

test('a member of staff answering a customer silences the assistant for that chat and receives the next messages',async()=>fixture(async f=>{
 f.env.config.zalo.ownerChat='owner-1';
 await f.env.DB.prepare("INSERT INTO zalo_leads (chat_id, stage, profile, followups, optout, human_until, updated_at) VALUES ('chat-1','interested','{}',0,0,?,?)").bind(Date.now()+600_000,Date.now()).run();
 const before=f.sent.length;
 await f.receive('cho mình hỏi thêm về gói năm','h1');await f.drain();
 const out=f.sent.slice(before).filter((x: any)=>/sendMessage$/.test(x.url));
 assert.ok(!out.some((x: any)=>x.body.chat_id==='chat-1'));
 assert.ok(out.some((x: any)=>x.body.chat_id==='owner-1'&&/gói năm/.test(x.body.text)));
}));

test('one friendly follow-up to someone who saw prices and went quiet, never twice, never after they opted out',async()=>fixture(async f=>{
 const { followUps } = await import('../web/src/zalo.ts');
 f.env.config.zalo.followup={enabled:true,hours:20,text:'Chào {ten}, bạn còn phân vân gì về gói {goi} không?'};
 const t=Date.now()-21*3600_000;
 await f.env.DB.prepare("INSERT INTO zalo_leads (chat_id, stage, profile, quoted_at, followups, optout, updated_at) VALUES ('chat-1','quoted','{\"ten\":\"Lan\",\"goi\":\"Chuyên nghiệp\"}',?,0,0,?)").bind(t,t).run();
 await f.env.DB.prepare("INSERT INTO zalo_leads (chat_id, stage, profile, quoted_at, followups, optout, updated_at) VALUES ('chat-2','quoted','{}',?,0,1,?)").bind(t,t).run();
 assert.equal((await followUps(f.env,f.rc)).sent,1);
 assert.equal(f.sent.at(-1).body.chat_id,'chat-1');assert.match(f.sent.at(-1).body.text,/Chào Lan, bạn còn phân vân gì về gói Chuyên nghiệp/);
 assert.equal((await followUps(f.env,f.rc)).sent,0);
 f.env.config.zalo.followup.enabled=false;
}));

test('a slow AI is cut off within the deadline so the customer still gets an answer',async()=>{
 const { assistantAnswer } = await import('../web/src/ai.ts');
 const originalFetch=globalThis.fetch;
 // a model that never answers (it only stops when the request is aborted)
 globalThis.fetch=((_u: any, o: any)=>new Promise((_ok, no)=>o?.signal?.addEventListener('abort',()=>no(new Error('The operation was aborted due to timeout'))))) as any;
 try {
  const env: any={GEMINI_API_KEY:'k',GEMINI_TEXT_MODEL:'m1',GEMINI_TEXT_FALLBACK:'m2,m3'};
  const t0=Date.now(), alive=setInterval(()=>{},500); // AbortSignal.timeout does not keep Node's loop alive by itself
  try { await assert.rejects(assistantAnswer(env,'sys',[],'chào','gemini',5000)); } finally { clearInterval(alive); }
  assert.ok(Date.now()-t0<6500,'took '+(Date.now()-t0)+'ms');
 } finally { globalThis.fetch=originalFetch; }
});

test('rich text goes with parse_mode html, and falls back to plain words if Zalo refuses the formatting',async()=>fixture(async f=>{
 f.env.config.plans.find((p: any)=>p.price>0).visible=true;
 const calls: any[]=[];
 globalThis.fetch=async (url: any, o: any)=>{const b=JSON.parse(o.body);calls.push({url:String(url),body:b});
  const ok=!(String(url).endsWith('/sendMessage')&&b.parse_mode);return new Response(JSON.stringify(ok?{ok:true,result:{}}:{ok:false,description:'parse error'}),{status:200});};
 await f.receive('bảng giá','p1');await f.drain();
 const sends=calls.filter((c)=>c.url.endsWith('/sendMessage'));
 assert.equal(sends.at(-2).body.parse_mode,'html');assert.match(sends.at(-2).body.text,/<b>Chuyên nghiệp<\/b>/);
 assert.equal(sends.at(-1).body.parse_mode,undefined);assert.doesNotMatch(sends.at(-1).body.text,/<b>/);
 assert.equal((await f.env.DB.prepare("SELECT status FROM zalo_outbox ORDER BY created_at DESC LIMIT 1").first()).status,'sent');
}));


test('Prompt Hunter Zalo command is owner-only, publishes with AI metadata and deduplicates delivery',async()=>fixture(async f=>{
 await f.receive('PROMPT Hãy viết một đoạn giới thiệu cho [SẢN PHẨM] với lợi ích cụ thể.','ph-denied');await f.drain();await resumeZalo(f.env,f.rc);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) n FROM hunter_prompts').first()).n,0);
 f.env.config.zalo.ownerChat='chat-1';await addOwner(f.env,'chat-1');f.enableAI();const original=globalThis.fetch;
 globalThis.fetch=async(url:any,opt:any)=>String(url).includes('api.openai.com')?Response.json({choices:[{message:{content:JSON.stringify({title:'Giới thiệu sản phẩm',category:'Viết & nội dung',description:'Thay biến sản phẩm trước khi sử dụng.',tool:'Đa nền tảng'})}}]}):original(url,opt);
 await f.receive('PROMPT Hãy viết một đoạn giới thiệu cho [SẢN PHẨM] với lợi ích cụ thể.','ph-owner');await f.drain();await resumeZalo(f.env,f.rc);
 const p=await f.env.DB.prepare('SELECT * FROM hunter_prompts').first();assert.equal(p.title,'Giới thiệu sản phẩm');assert.equal(p.status,'published');assert.equal(p.ai_state,'ready');
 await f.receive('PROMPT Hãy viết một đoạn giới thiệu cho [SẢN PHẨM] với lợi ích cụ thể.','ph-owner');await f.drain();await resumeZalo(f.env,f.rc);
 assert.equal((await f.env.DB.prepare('SELECT COUNT(*) n FROM hunter_prompts').first()).n,1);
}));
test('the owner Zalo makes videos with the admin web account (no daily limit), and a Zalo-only account is told why it ran out',async()=>fixture(async f=>{
 f.enableAI();
 f.env.ADMIN_EMAIL='boss@shop.vn';
 await f.env.DB.prepare("INSERT INTO users (id,email,name,created_at) VALUES ('boss','boss@shop.vn','Chủ',1)").run();
 await addOwner(f.env,'chat-1');
 for(let i=0;i<7;i++){await f.receive('TAO chủ đề số '+i+' cho video','o'+i);await f.drain();await f.env.DB.prepare("UPDATE ink_jobs SET status='done'").run();}
 assert.equal((await f.env.DB.prepare("SELECT user_id FROM zalo_links WHERE chat_id='chat-1'").first()).user_id,'boss');
 assert.equal((await f.env.DB.prepare("SELECT COUNT(*) AS n FROM ink_jobs WHERE user_id='boss'").first()).n,7);
 // a customer without a web account: their own allowance, and the way to use the web account's
 const guest=async(text: string,id: string)=>{await zaloWebhook(new Request('https://studio.test/api/zalo/webhook',{method:'POST',headers:{'x-bot-api-secret-token':await webhookSecret(f.env)},body:JSON.stringify({event_name:'message.text.received',message:{message_id:id,chat:{id:'chat-g'},from:{display_name:'Khách'},text}})}),f.env,f.rc);await f.drain();};
 const limit=f.env.config.plans.find((p: any)=>p.price===0).limits.render;
 for(let i=0;i<=limit;i++){await guest('TAO chủ đề khách '+i+' nhé','g'+i);await f.env.DB.prepare("UPDATE ink_jobs SET status='done'").run();}
 const last=f.sent.filter((x: any)=>x.body.chat_id==='chat-g').at(-1).body.text;
 assert.match(last,/hết lượt dựng video/);assert.match(last,/chưa liên kết tài khoản web/);assert.match(last,/KETNOI/);
}));

