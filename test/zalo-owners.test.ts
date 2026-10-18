import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';import {ownerAdmin,ownerRecipients} from '../web/src/zalo-owners.ts';import {notifyOwner} from '../web/src/zalo.ts';
import {feedAdmin,feedDefault,feedSubscription,tickFeed} from '../web/src/image-feed.ts';

test('Owner roster preserves existing recipients once, supports add/remove, and never enrolls owners into image subscriptions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zalo-owners-')),original=globalThis.fetch;
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),ZALO_BOT_TOKEN:'test',PUBLIC_URL:'https://studio.test',ADMIN_EMAIL:'one@test',BUCKET:{async head(){return true;}}};env.config=defaultConfig(env);env.config.admins=['one@test','two@test','new@test'];env.config.zalo.enabled=true;env.config.zalo.ownerChat='claimed-owner';
 for(const [id,email,chat] of [['one','one@test','one-chat'],['two','two@test','two-chat']]){await env.DB.prepare('INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,1)').bind(id,email,id).run();await env.DB.prepare('INSERT INTO zalo_links(user_id,chat_id,name,linked_at) VALUES(?,?,?,1)').bind(id,chat,id).run();}
 assert.deepEqual(new Set((await ownerRecipients(env)).chats),new Set(['claimed-owner','one-chat','two-chat']));
 await env.DB.prepare("INSERT INTO users(id,email,name,created_at) VALUES('new','new@test','New',1)").run();await env.DB.prepare("INSERT INTO zalo_links(user_id,chat_id,name,linked_at) VALUES('new','new-chat','New',1)").run();
 assert.ok(!(await ownerRecipients(env)).chats.includes('new-chat')); // no implicit enrollment of newly linked admins
 const post=(action:string,chatId:string)=>ownerAdmin(new Request('https://studio.test',{method:'POST',body:JSON.stringify({action,chatId})}),env,'zalo/owners');
 await env.DB.prepare("INSERT INTO zalo_outbox(id,chat_id,text,status,created_at,updated_at) VALUES('old','two-chat','🔔 Đơn hàng cũ','pending',1,1)").run();
 await post('remove','two-chat');assert.ok(!(await ownerRecipients(env)).chats.includes('two-chat'));assert.equal((await env.DB.prepare("SELECT status FROM zalo_outbox WHERE id='old'").first<any>()).status,'cancelled');
 await post('remove','claimed-owner');assert.deepEqual((await ownerRecipients(env)).chats,['one-chat']); // legacy config does not resurrect removed owner
 await post('add','new-chat');assert.ok((await ownerRecipients(env)).chats.includes('new-chat'));
 await assert.rejects(()=>post('add','unknown-chat'),/Chọn Zalo/);
 const names:any=await (await ownerAdmin(new Request('https://studio.test'),env,'zalo/owners'))!.json();assert.equal(names.owners.find((o:any)=>o.chat_id==='two-chat').email,'two@test');
 const texts:any[]=[],photos:any[]=[];globalThis.fetch=async(url:any,opts:any)=>{const payload=JSON.parse(opts.body);if(String(url).endsWith('/sendPhoto'))photos.push(payload);else if(String(url).endsWith('/sendMessage'))texts.push(payload);return Response.json({ok:true,result:{message_id:'ok'}});};
 await notifyOwner(env,'order','Có đơn mới');assert.deepEqual(new Set(texts.map(x=>x.chat_id)),new Set(['one-chat','new-chat']));
 // The owner roster is never used for scheduled image recipients.
 const c={...feedDefault,transport:'apps-script',enabled:true,windows:['00:00-23:59']};await feedAdmin(new Request('https://studio.test',{method:'PUT',body:JSON.stringify(c)}),env,'image-feed');
 await feedSubscription(env,'customer-chat','Customer',true);await env.DB.prepare('UPDATE image_feed_subscribers SET joined_at=1').run();
 await env.DB.prepare('INSERT INTO image_feed_items(id,file_id,source,caption,created_at,baseline,expires,token) VALUES(?,?,?,?,?,0,?,?)').bind('a'.repeat(64),'drive1234567890',c.sheet+'|'+c.gid,'Ảnh',Date.now()-1000,Date.now()+86400000,'cache').run();
 await tickFeed(env);assert.equal(photos.length,1);assert.equal(photos[0].chat_id,'customer-chat');
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM image_feed_subscribers').first<any>()).n,1);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
