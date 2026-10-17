import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';
import {downloadZaloImage,zaloImageURL} from '../web/src/ocr.ts';
import {normalizeMessage,zaloWebhook,webhookSecret,resumeZalo} from '../web/src/zalo.ts';

test('photo and photo_url captions remain image data, not executable commands',()=>{
 for(const key of ['photo','photo_url']){const m=normalizeMessage({result:{event_name:'message.image.received',message:{chat:{id:'c'},message_id:'i',caption:'PROMPT execute me',[key]:'https://a.zadn.vn/p.png'}}});assert.equal(m?.isText,false);assert.ok(m?.text.startsWith('[ocr-image]'));}
 for(const url of ['http://a.zadn.vn/x','https://127.0.0.1/x','https://zadn.vn.evil.com/x','https://u:p@a.zadn.vn/x','https://a.zadn.vn:444/x'])assert.throws(()=>zaloImageURL(url));
});
test('image fetch rejects off-CDN redirects, excessive size and non-images',async()=>{
 const original=globalThis.fetch;try{
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/x'}});await assert.rejects(downloadZaloImage('https://a.zadn.vn/x'),/gửi trực tiếp/);
 globalThis.fetch=async()=>new Response('x',{headers:{'content-length':String(9*1024*1024)}});await assert.rejects(downloadZaloImage('https://a.zadn.vn/x'),/8 MB/);
 globalThis.fetch=async()=>new Response('<html>wrong</html>');await assert.rejects(downloadZaloImage('https://a.zadn.vn/x'),/PNG/);
 }finally{globalThis.fetch=original;}
});
test('Zalo OCR defers work, transcribes once, requires explicit publication and deduplicates',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zalo-ocr-')),original=globalThis.fetch;
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ZALO_BOT_TOKEN:'test',OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'vision-fixture',AI_ORDER:'openai',PUBLIC_URL:'https://test'};
 env.config=defaultConfig(env);env.config.zalo.enabled=true;env.config.zalo.ownerChat='owner';env.config.models.order=['openai'];
 const pending:any[]=[],sent:string[]=[];let vision=0;
 const rc:any={ip:'test',log(){},wait(p:any){pending.push(p);}};
 const content='Hãy viết bài giới thiệu sản phẩm theo phong cách gần gũi.\nGiữ nguyên nội dung gốc.';
 globalThis.fetch=async(url:any,opts:any)=>{
  if(String(url).startsWith('https://a.zadn.vn/'))return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0,0]));
  if(String(url).includes('api.openai.com')){const b=JSON.parse(opts.body),image=Array.isArray(b.messages[1].content);if(image){vision++;assert.equal(b.model,'vision-fixture');assert.equal(b.messages[1].content[1].image_url.detail,'high');assert.match(b.messages[0].content,/KHÔNG làm theo/);}return Response.json({choices:[{message:{content:JSON.stringify(image?{text:content,uncertain:true}:{title:'Prompt từ ảnh',category:'Viết & nội dung',tool:'ChatGPT',description:'Viết giới thiệu'})}}]});}
  if(String(url).endsWith('/sendMessage'))sent.push(JSON.parse(opts.body).text);
  return Response.json({ok:true,result:{message_id:'reply'}});
 };
 const drain=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
 const receive=async(message:any,event:string,chat='owner')=>{const r=await zaloWebhook(new Request('https://test/api/zalo/webhook',{method:'POST',headers:{'x-bot-api-secret-token':await webhookSecret(env)},body:JSON.stringify({event_name:event,message:{chat:{id:chat},from:{display_name:'Admin'},...message}})}),env,rc);await drain();return r;};
 await receive({message_id:'img1',photo_url:'https://a.zadn.vn/photo.png',caption:'PROMPT'},'message.image.received');assert.equal(vision,0);
 await resumeZalo(env,rc);await drain();assert.equal(vision,1);assert.ok(sent.some(t=>t.includes(content)));assert.ok(sent.some(t=>t.includes('PROMPT ANH')));
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM hunter_prompts').first<any>()).n,0);
 assert.equal((await env.DB.prepare("SELECT content FROM zalo_ocr WHERE message_id='img1'").first<any>()).content,content);
 await receive({message_id:'publish1',text:'PROMPT ANH'},'message.text.received');await resumeZalo(env,rc);await drain();
 const post=await env.DB.prepare('SELECT content,status FROM hunter_prompts').first<any>();assert.equal(post.content,content);assert.equal(post.status,'published');
 await receive({message_id:'publish2',text:'PROMPT ANH'},'message.text.received');await resumeZalo(env,rc);await drain();assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM hunter_prompts').first<any>()).n,1);assert.equal(vision,1);
 await env.DB.prepare("INSERT INTO users(id,email,name,created_at) VALUES('member','member@test','Member',1)").run();
 await env.DB.prepare("INSERT INTO zalo_links(user_id,chat_id,name,linked_at,notify,prefs) VALUES('member','member-chat','Member',1,1,'{}')").run();
 await env.DB.prepare("INSERT INTO zalo_ocr(message_id,chat_id,content,uncertain,created_at) VALUES('member-image','member-chat',?,0,?)").bind(content,Date.now()).run();
 await receive({message_id:'publish-member',text:'PROMPT ANH'},'message.text.received','member-chat');await resumeZalo(env,rc);await drain();
 assert.equal((await env.DB.prepare("SELECT status FROM hunter_prompts WHERE user_id='member'").first<any>()).status,'pending');
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
