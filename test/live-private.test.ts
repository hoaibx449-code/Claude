import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from './support/sqlite.ts';
import {liveConversation} from '../web/src/live-private.ts';
import worker from '../web/src/worker.ts';
import {startSession} from '../web/src/auth.ts';
import {clearCache} from '../web/src/settings.ts';

test('personal Live conversation is scoped to the verified current link, including reply ownership and link time',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'live-private-'));try{
  const DB=database(join(dir,'db.sqlite')),env={DB} as any,now=Date.now();
  await DB.prepare("INSERT INTO zalo_links(user_id,chat_id,linked_at) VALUES('alice','chat-a',?),('bob','chat-b',?)").bind(now-10000,now-10000).run();
  for(const [id,chat,text,at] of [['a','chat-a','Alice private',now-9000],['b','chat-b','Bob secret',now-8000],['old','chat-a','Previous owner',now-20000]] as const)await DB.prepare("INSERT INTO zalo_messages(id,chat_id,text,status,received_at,updated_at) VALUES(?,?,?,'processing',?,?)").bind(id,chat,text,at,at).run();
  for(const [id,chat,m,text,status] of [['oa','chat-a','a','Alice reply','sent'],['ob','chat-b','b','Bob reply','sent'],['wrong','chat-a','b','Foreign reply','sent'],['old-o','chat-a','old','Old reply','sent'],['pending','chat-a','a','Undelivered','pending'],['notice','chat-a',null,'Owner notice','sent']] as const)await DB.prepare('INSERT INTO zalo_outbox(id,chat_id,message_id,text,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,chat,m,text,status,now-5000,now).run();
  const alice=await liveConversation(env,'alice');assert.equal(alice.userId,'alice');assert.equal(alice.linked,true);assert.equal(alice.processing,true);assert.deepEqual(alice.messages.map(x=>x.text),['Alice private','Alice reply']);assert.doesNotMatch(JSON.stringify(alice),/Bob|Foreign|Previous|Old reply|Undelivered|Owner notice|chat-a/);
  const bob=await liveConversation(env,'bob');assert.deepEqual(bob.messages.map(x=>x.text),['Bob secret','Bob reply']);
  assert.deepEqual(await liveConversation(env,'guest'),{userId:'guest',linked:false,messages:[],processing:false});
  await DB.prepare("DELETE FROM zalo_links WHERE user_id='alice'").run();assert.deepEqual((await liveConversation(env,'alice')).messages,[]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Worker personal endpoints require a session, ignore foreign identities, prevent caching and enforce CSRF/blocked checks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'live-private-auth-'));clearCache();try{
  const env:any={DB:database(join(dir,'db.sqlite')),ADMIN_EMAIL:'admin@test',DAILY_SCRIPTS:'20',DAILY_IMAGES:'20',DAILY_RENDERS:'5'},pending:Promise<any>[]=[],ctx:any={waitUntil(p:Promise<any>){pending.push(p);}};
  const cookie=(await startSession(env,{id:'alice',email:'alice@test',name:'Alice',picture:null})).split(';')[0];
  const admin=(await startSession(env,{id:'admin',email:'admin@test',name:'Admin',picture:null})).split(';')[0];
  await env.DB.prepare("INSERT INTO zalo_links(user_id,chat_id,linked_at) VALUES('alice','chat-a',1)").run();
  await env.DB.prepare("INSERT INTO zalo_messages(id,chat_id,text,received_at,updated_at) VALUES('a','chat-a','ONLY ALICE',2,2)").run();
  const call=async(path:string,opts:any={})=>{const r=await worker.fetch(new Request('https://studio.test'+path,opts),env,ctx);await Promise.all(pending.splice(0));return r;};
  assert.equal((await call('/api/faciup-live/mine')).status,401);
  assert.equal((await call('/api/faciup-live/chat',{method:'POST',headers:{'x-nv':'1',origin:'https://studio.test'},body:'{}'})).status,401);
  const mine=await call('/api/faciup-live/mine?user_id=admin&chat_id=other',{headers:{cookie}});assert.equal(mine.status,200);assert.match(mine.headers.get('cache-control')||'',/private.*no-store/);assert.match(await mine.text(),/ONLY ALICE/);
  const other=await call('/api/faciup-live/mine?user_id=alice&chat_id=chat-a',{headers:{cookie:admin}});assert.doesNotMatch(await other.text(),/ONLY ALICE|chat-a/);
  assert.equal((await call('/api/faciup-live/chat',{method:'POST',headers:{cookie,origin:'https://attacker.test'},body:'{}'})).status,403);
  await env.DB.prepare("INSERT INTO blocked_users(user_id,blocked_at) VALUES('alice',1)").run();assert.equal((await call('/api/faciup-live/mine',{headers:{cookie}})).status,403);
 }finally{clearCache();rmSync(dir,{recursive:true,force:true});}
});
