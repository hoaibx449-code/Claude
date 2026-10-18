import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import vm from 'node:vm';
import {database} from './support/sqlite.ts';import {defaultConfig,encrypt} from '../web/src/settings.ts';
import {bridgeAdmin,bridgeReceive,appsScript} from '../web/src/feed-apps-script.ts';
import {feedAdmin,feedDefault,feedSubscription,tickFeed} from '../web/src/image-feed.ts';
import {showImageFeed} from '../web/public/image-feed.js';

test('Apps Script source ingests once, accepts native images, obeys consent, preserves Google and revokes keys',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'feed-bridge-')),original=globalThis.fetch,objects=new Map();
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ZALO_BOT_TOKEN:'test',PUBLIC_URL:'https://studio.test',BUCKET:{async put(k:any,v:any,o:any){objects.set(k,{body:v,httpMetadata:o.httpMetadata});},async head(k:any){return objects.get(k);},async delete(k:any){objects.delete(k);}}};env.config=defaultConfig(env);env.config.zalo.enabled=true;
 const c={...feedDefault,transport:'apps-script',enabled:true,windows:['00:00-23:59']};
 const req=(path:string,value:any={},key='',contentType='application/json')=>new Request('https://studio.test/'+path,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':contentType},body:contentType==='application/json'?JSON.stringify(value):value});
 await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('feed-google:token',?,1)").bind(await encrypt(env,JSON.stringify({refresh_token:'preserve-me'}))).run();
 await feedAdmin(new Request('https://studio.test/api/admin/image-feed',{method:'PUT',body:JSON.stringify(c)}),env,'image-feed');
 const setup:any=await (await bridgeAdmin(req('setup'),env,'image-feed/apps-script/setup'))!.json();
 new vm.Script(setup.script);const key=setup.script.match(/const FACIUP_KEY = "([a-f0-9]+)"/)[1];
 const route=async(path:string,data:any={},secret=key,type='application/json')=>bridgeReceive(req(path,data,secret,type),env,path);
 await assert.rejects(()=>route('config',{},'bad'),/khóa|Khóa/);
 let state:any=await (await route('config')).json();assert.equal(state.active,true);assert.equal(state.due,true);
 const headers=['ID','Link ảnh Google Drive','Caption đề xuất'];const rows=[['old','https://drive.google.com/file/d/old1234567890/view','Cũ']];
 await route('rows',{revision:state.revision,headers,rows});await feedSubscription(env,'reader','Bạn đọc',true);await env.DB.prepare('UPDATE image_feed_subscribers SET joined_at=joined_at-1000').run();
 rows.push(['new','https://drive.google.com/file/d/new1234567890/view','Ảnh mới']);const result:any=await (await route('rows',{revision:state.revision,headers,rows})).json();assert.equal(result.images.length,1);
 const sent:any[]=[];globalThis.fetch=async(url:any,opts:any)=>{assert.ok(String(url).endsWith('/sendPhoto'),'Bridge mode must not call Google OAuth or public Drive');sent.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:'photo'}});};
 await tickFeed(env);assert.equal(sent.length,0); // waits for original image, does not consume delivery attempts
 const id=result.images[0].id;
 await assert.rejects(()=>route('image/'+id,new TextEncoder().encode('<html>login</html>'),key,'image/png'),/PNG/);
 await route('image/'+id,new Uint8Array([137,80,78,71,13,10,26,10]),key,'image/png');await tickFeed(env);assert.equal(sent.length,1);assert.equal(sent[0].caption,'Ảnh mới');assert.ok(!sent[0].photo.includes(key));
 await route('rows',{revision:state.revision,headers,rows:rows.reverse()});await tickFeed(env);assert.equal(sent.length,1);
 assert.ok(await env.DB.prepare("SELECT 1 FROM settings WHERE key='feed-google:token'").first());
 await assert.rejects(()=>route('rows',{revision:'old',headers,rows}),/thay đổi/);
 const moved={...c,image:'Tên cột chưa đúng'};
 await feedAdmin(new Request('https://studio.test/api/admin/image-feed',{method:'PUT',body:JSON.stringify(moved)}),env,'image-feed');
 state=await (await route('config')).json();const warned:any=await (await route('rows',{revision:state.revision,headers,rows})).json();assert.ok(warned.warning);
 const preview:any=await (await feedAdmin(req('preview',moved),env,'image-feed/preview'))!.json();assert.deepEqual(preview.headers,headers); // can remap columns even if old mapping fails
 await bridgeAdmin(req('disconnect'),env,'image-feed/apps-script/disconnect');await assert.rejects(()=>route('config'),/khóa|Khóa/);
 assert.ok(await env.DB.prepare("SELECT 1 FROM settings WHERE key='feed-google:token'").first());
 // Generated code only modifies its own trigger and does not deploy any public endpoint.
 assert.ok(appsScript('https://studio.test',key).includes("getHandlerFunction() === 'dongBoAnh'"));
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});

test('Admin switches connection panels and retains both methods with one source and schedule',async()=>{
 const original=(globalThis as any).document;
 try{
 const h=(tag:any,attrs:any={},...kids:any[])=>({tag,attrs,...attrs,kids:kids.flat(Infinity).filter(x=>x!=null),classList:{add(){}},append(...x:any[]){this.kids.push(...x);},replaceChildren(...x:any[]){this.kids=x;}});
 (globalThis as any).document={getElementById(){return true;},head:{append(){}}};const root=h('div');
 const api=async(path:string)=>path.endsWith('/google')?{clientId:'fixture',configured:true,connected:true,redirect:'https://studio.test/callback'}:path.endsWith('/apps-script')?{configured:false}:({config:{...feedDefault},state:{},subscribers:[],deliveries:[]});
 await showImageFeed({h,api,body:root,toast(){},fail(e:any){throw e;}});
 const nodes:any[]=[];const walk=(n:any)=>{if(n&&typeof n==='object'){nodes.push(n);n.kids?.forEach(walk);}};walk(root);
 const title=(n:any)=>n.kids?.[0]?.kids?.[0];
 const google=nodes.find(n=>n.tag==='section'&&title(n)==='Kết nối Google Drive'),script=nodes.find(n=>n.tag==='section'&&title(n)==='Kết nối Apps Script');assert.ok(google);assert.ok(script);
 const select=nodes.find(n=>n.tag==='select'&&n.kids.some((k:any)=>k.value==='apps-script'));
 assert.equal(script.hidden,true);select.onchange({target:{value:'apps-script'}});assert.equal(google.hidden,true);assert.equal(script.hidden,false);
 select.onchange({target:{value:'google'}});assert.equal(google.hidden,false);assert.equal(script.hidden,true);
 assert.equal(nodes.filter(n=>n.tag==='section'&&title(n)==='Nguồn ảnh Google Sheet').length,1);assert.equal(nodes.filter(n=>n.tag==='section'&&title(n)==='Lịch gửi & đăng ký').length,1);
 }finally{(globalThis as any).document=original;}
});
