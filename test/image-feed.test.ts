import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';
import {feedDefault,cleanFeed,csvRows,column,driveImage,sendSlot,feedAdmin,scanFeed,tickFeed,feedSubscription,feedPhoto} from '../web/src/image-feed.ts';

test('Fixed daily times validate, use timezone/day and retain one stable round across cron retries',()=>{
 const c=cleanFeed({...feedDefault,schedule:'fixed',times:['19:00','08:00','08:00','08:05'],days:[1],windows:['09:00-10:00']});
 assert.deepEqual(c.times,['08:00','08:05','19:00']);assert.deepEqual(c.windows,['09:00-10:00']);
 const slot=sendSlot(c,Date.parse('2026-10-19T01:00:12Z'));assert.ok(slot.includes(':at:08:00'));
 assert.equal(sendSlot(c,Date.parse('2026-10-19T01:04:59Z')),slot);
 assert.ok(sendSlot(c,Date.parse('2026-10-19T01:05:00Z')).includes(':at:08:05'));
 assert.equal(sendSlot(c,Date.parse('2026-10-19T01:15:00Z')),'');assert.equal(sendSlot(c,Date.parse('2026-10-20T01:00:00Z')),'');
 assert.equal(sendSlot(c,Date.parse('2026-10-19T00:59:59Z')),'');
 const midnight={...c,times:['23:55']};assert.ok(sendSlot(midnight,Date.parse('2026-10-19T17:02:00Z')).includes(':at:23:55'));assert.equal(sendSlot(midnight,Date.parse('2026-10-19T17:05:00Z')),'');
 for(const times of [[],['25:00'],['8:00'],['08:60']])assert.throws(()=>cleanFeed({...c,times}));
 assert.equal(cleanFeed({...feedDefault,schedule:undefined,times:undefined}).schedule,'windows');
});

test('Fixed-time cron sends one queued image per recipient per scheduled round',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'feed-fixed-')),original=globalThis.fetch,clock=Date.now;let now=Date.parse('2026-10-19T01:00:10Z');
 try{
 Date.now=()=>now;const env:any={DB:database(join(dir,'db.sqlite')),ZALO_BOT_TOKEN:'test',PUBLIC_URL:'https://studio.test',BUCKET:{async head(){return true;}}};env.config=defaultConfig(env);env.config.zalo.enabled=true;
 const c={...feedDefault,transport:'apps-script',enabled:true,schedule:'fixed',times:['08:00','08:10'],days:[1]};
 await feedAdmin(new Request('https://studio.test',{method:'PUT',body:JSON.stringify(c)}),env,'image-feed');
 await env.DB.prepare("INSERT INTO image_feed_subscribers(chat_id,name,active,joined_at) VALUES('reader','Reader',1,1)").run();
 for(const id of ['a','b'])await env.DB.prepare('INSERT INTO image_feed_items(id,file_id,source,caption,created_at,baseline,expires,token) VALUES(?,?,?,?,?,0,?,?)').bind(id.repeat(64),id+'1234567890123',c.sheet+'|'+c.gid,id,now-1000,now+86400000,'cached-token').run();
 const sent:any[]=[];globalThis.fetch=async(url:any,opts:any)=>{assert.ok(String(url).endsWith('/sendPhoto'));sent.push(JSON.parse(opts.body));return Response.json({ok:true,result:{message_id:String(sent.length)}});};
 await tickFeed(env);assert.equal(sent.length,1);now+=60000;await tickFeed(env);assert.equal(sent.length,1);
 now=Date.parse('2026-10-19T01:10:05Z');await tickFeed(env);assert.equal(sent.length,2);assert.notEqual(sent[0].photo,sent[1].photo);
 await tickFeed(env);assert.equal(sent.length,2);
 }finally{Date.now=clock;globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});

test('CSV, flexible column mapping, Drive links and overnight schedules',()=>{
 assert.deepEqual(csvRows('Ảnh,Chú thích\r\n"a,b","hai\ndòng ""đẹp"""'),[['Ảnh','Chú thích'],['a,b','hai\ndòng "đẹp"']]);
 assert.equal(column(['Chú thích','Ảnh'],'Link|Ảnh'),1);assert.equal(column(['Ảnh'],'#AA'),26);assert.throws(()=>column(['Ảnh','Ảnh'],'Ảnh'));assert.throws(()=>column(['Ảnh'],'Link'));
 assert.equal(driveImage('https://drive.google.com/file/d/1234567890abc/view'),'1234567890abc');assert.equal(driveImage('https://drive.google.com/open?id=1234567890abc'),'1234567890abc');assert.throws(()=>driveImage('https://evil.test/?id=1234567890abc'));
 const c={...feedDefault,days:[1],windows:['22:00-02:00'],interval:15};
 assert.ok(sendSlot(c,Date.parse('2026-10-19T15:05:00Z')));assert.ok(sendSlot(c,Date.parse('2026-10-19T18:05:00Z')));assert.equal(sendSlot(c,Date.parse('2026-10-19T19:00:00Z')),'');
 assert.equal(sendSlot(c,Date.parse('2026-10-20T15:05:00Z')),'');assert.throws(()=>cleanFeed({...c,windows:['25:00-26:00']}));
});

test('Sheet baseline, consent, native photos, deduplication, schedule and uncertain delivery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'image-feed-')),original=globalThis.fetch,objects=new Map<string,any>();
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),ZALO_BOT_TOKEN:'test',PUBLIC_URL:'https://studio.test',BUCKET:{async put(k:string,v:any,o:any){objects.set(k,{body:v,httpMetadata:o.httpMetadata});},async head(k:string){return objects.get(k);},async get(k:string){return objects.get(k);},async delete(k:string){objects.delete(k);}}};
 env.config=defaultConfig(env);env.config.zalo.enabled=true;
 let csv='ID,Ảnh,Chú thích\nold,https://drive.google.com/file/d/old1234567890/view,Cũ',sends:any[]=[],uncertain=false;
 globalThis.fetch=async(url:any,opts:any)=>{
  if(String(url).includes('docs.google.com'))return new Response(csv,{headers:{'content-type':'text/csv'}});
  if(String(url).includes('drive.usercontent.google.com'))return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0]));
  if(String(url).endsWith('/sendPhoto')){sends.push(JSON.parse(opts.body));if(uncertain)throw new Error('lost response');return Response.json({ok:true,result:{message_id:'zalo-photo'}});}
  throw new Error('Unexpected fetch '+url);
 };
 const c={...feedDefault,enabled:true,image:'Ảnh',id:'ID',caption:'Chú thích',windows:['00:00-23:59']};
 await feedAdmin(new Request('https://test',{method:'PUT',body:JSON.stringify(c)}),env,'image-feed');
 await scanFeed(env,c);assert.equal((await env.DB.prepare('SELECT baseline FROM image_feed_items').first<any>()).baseline,1);
 await feedSubscription(env,'subscriber','Bạn đọc',true);await env.DB.prepare('UPDATE image_feed_subscribers SET joined_at=joined_at-1000').run();
 csv+='\nnew,https://drive.google.com/file/d/new1234567890/view,Mới';await scanFeed(env,c);await tickFeed(env);
 assert.equal(sends.length,1);assert.equal(sends[0].caption,'Mới');assert.match(sends[0].photo,/https:\/\/studio.test\/api\/image-feed\/photo\//);
 assert.ok(!sends[0].caption.includes('http'));const u=new URL(sends[0].photo);const id=u.pathname.split('/').at(-1)!;
 assert.equal((await feedPhoto(env,id,u.searchParams.get('t')!)).headers.get('content-type'),'image/png');await assert.rejects(()=>feedPhoto(env,id,'bad'));
 await tickFeed(env);assert.equal(sends.length,1);
 // Same file with another sharing URL and moved row never creates another item.
 csv='ID,Ảnh,Chú thích\nnew,https://drive.google.com/open?id=new1234567890,Đổi chú thích\nold,https://drive.google.com/open?id=old1234567890,Cũ';await scanFeed(env,c);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM image_feed_items').first<any>()).n,2);
 await feedSubscription(env,'subscriber','Bạn đọc',false);csv+='\nnext,https://drive.google.com/file/d/next1234567890/view,Tiếp';await scanFeed(env,c);await tickFeed(env);assert.equal(sends.length,1);
 await feedSubscription(env,'subscriber','Bạn đọc',true);await env.DB.prepare("UPDATE image_feed_deliveries SET slot='previous' WHERE status='sent'").run();uncertain=true;
 await tickFeed(env);assert.equal(sends.length,2);assert.equal((await env.DB.prepare("SELECT status FROM image_feed_deliveries WHERE status='unknown'").first<any>()).status,'unknown');
 await tickFeed(env);assert.equal(sends.length,2);
 // Private Sheet fails visibly; original successful scan state is retained.
 globalThis.fetch=async()=>new Response('Unauthorized',{status:401});await assert.rejects(()=>scanFeed(env,c),/401/);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
