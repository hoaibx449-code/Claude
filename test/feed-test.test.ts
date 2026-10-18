import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';
import {feedAdmin,feedDefault} from '../web/src/image-feed.ts';import {feedTestAdmin} from '../web/src/feed-test.ts';import {bridgeAdmin,bridgeReceive} from '../web/src/feed-apps-script.ts';

test('Immediate test delivers an old image only to admin, without schedule, subscribers or duplicate retries',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'feed-test-')),original=globalThis.fetch,objects=new Map();
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ZALO_BOT_TOKEN:'test',PUBLIC_URL:'https://studio.test',BUCKET:{async head(k:any){return objects.get(k);},async put(k:any,v:any,o:any){objects.set(k,{v,o});}}};env.config=defaultConfig(env);env.config.zalo.enabled=true;env.config.zalo.ownerChat='owner-chat';
 const user={id:'admin',email:'admin@test',name:'Admin',picture:null},c={...feedDefault,transport:'apps-script',enabled:false,days:[]};
 await feedAdmin(new Request('https://studio.test',{method:'PUT',body:JSON.stringify(c)}),env,'image-feed');
 const item='a'.repeat(64),requestId='b'.repeat(32);await env.DB.prepare('INSERT INTO image_feed_items(id,file_id,source,caption,created_at,baseline) VALUES(?,?,?,?,?,1)').bind(item,'drive1234567890',c.sheet+'|'+c.gid,'Ảnh cũ',1).run();
 const req=(data:any)=>new Request('https://studio.test',{method:'POST',body:JSON.stringify(data)});
 const call=()=>feedTestAdmin(req({itemId:item,requestId,chat_id:'victim'}),env,user,'image-feed/test');
 let result:any=await (await call())!.json();assert.equal(result.status,'pending');
 const setup:any=await (await bridgeAdmin(req({}),env,'image-feed/apps-script/setup'))!.json();const key=setup.script.match(/const FACIUP_KEY = "([a-f0-9]+)"/)[1];
 const bridge=(path:string,data:any={},type='application/json')=>bridgeReceive(new Request('https://studio.test',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':type},body:type==='application/json'?JSON.stringify(data):data}),env,path);
 const state:any=await (await bridge('config')).json();assert.equal(state.images[0].id,item); // includes skipped old image only for requested admin test
 const sent:any[]=[];globalThis.fetch=async(url:any,opts:any)=>{assert.ok(String(url).endsWith('/sendPhoto'));sent.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:'native-photo'}});};
 await bridge('image/'+item,new Uint8Array([137,80,78,71,13,10,26,10]),'image/png');
 result=await (await call())!.json();assert.equal(result.status,'sent');assert.equal(result.message_id,'native-photo');assert.equal(sent.length,1);assert.equal(sent[0].chat_id,'owner-chat');assert.ok(sent[0].caption.startsWith('[Gửi thử]'));
 assert.equal((await env.DB.prepare('SELECT baseline FROM image_feed_items WHERE id=?').bind(item).first<any>()).baseline,1);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM image_feed_deliveries').first<any>()).n,0);
 await call();assert.equal(sent.length,1);
 // Linked current admin takes priority over the shared owner; unavailable chat is rejected.
 await env.DB.prepare("INSERT INTO zalo_links(user_id,chat_id,name,linked_at) VALUES('admin','own-admin-chat','Admin',1)").run();
 await feedTestAdmin(req({itemId:item,requestId:'c'.repeat(32)}),env,user,'image-feed/test');assert.equal(sent[1].chat_id,'own-admin-chat');
 await env.DB.prepare("DELETE FROM zalo_links").run();env.config.zalo.ownerChat='';await assert.rejects(()=>feedTestAdmin(req({itemId:item,requestId:'d'.repeat(32)}),env,user,'image-feed/test'),/Chưa có Zalo/);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
