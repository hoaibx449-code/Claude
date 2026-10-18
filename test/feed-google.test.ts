import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig,encrypt} from '../web/src/settings.ts';
import {startSession} from '../web/src/auth.ts';import {googleFeedAdmin,googleFeedCallback,googleAccess,googleStatus} from '../web/src/feed-google.ts';
import {feedAdmin,feedDefault,scanFeed} from '../web/src/image-feed.ts';

test('Google offline connection binds state to admin, uses PKCE, encrypts grants and reads private Sheet by gid',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'feed-google-')),original=globalThis.fetch;
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),RUNNER_TOKEN:'r'.repeat(32),ADMIN_EMAIL:'admin@test',PUBLIC_URL:'https://studio.test'};env.config=defaultConfig(env);
 const user={id:'admin',email:'admin@test',name:'Admin',picture:null};const cookie=(await startSession(env,user)).split(';')[0];
 const request=(sub:string,payload:any,method='POST')=>new Request('https://studio.test/api/admin/'+sub,{method,body:JSON.stringify(payload)});
 await googleFeedAdmin(request('image-feed/google/client',{web:{client_id:'fixture.apps.googleusercontent.com',client_secret:'secret-for-fixture'}},'PUT'),env,user,'image-feed/google/client');
 const status=await googleStatus(env,'https://studio.test');assert.equal(status.configured,true);assert.equal(status.connected,false);assert.ok(!JSON.stringify(status).includes('secret-for-fixture'));
 const getConnect=async()=>new URL((await (await googleFeedAdmin(request('image-feed/google/connect',{}),env,user,'image-feed/google/connect'))!.json() as any).url);
 const connect=await getConnect();assert.equal(connect.searchParams.get('code_challenge_method'),'S256');assert.equal(connect.searchParams.get('access_type'),'offline');
 assert.equal(connect.searchParams.get('redirect_uri'),'https://studio.test/api/image-feed/google/callback');
 const callback='https://studio.test/api/image-feed/google/callback?state='+connect.searchParams.get('state')+'&code=fixture-code';
 await assert.rejects(()=>googleFeedCallback(new Request(callback),env),/quản trị/);
 let exchanges=0,refreshes=0,readPrivate=0;
 globalThis.fetch=async(url:any,opts:any={})=>{
  if(String(url).includes('oauth2.googleapis.com/token')){const q=new URLSearchParams(opts.body);if(q.get('grant_type')==='refresh_token'){refreshes++;assert.equal(q.get('refresh_token'),'private-refresh');return Response.json({access_token:'renewed-access',expires_in:3600});}
   exchanges++;assert.ok(q.get('code_verifier'));assert.equal(q.get('client_secret'),'secret-for-fixture');return Response.json({access_token:'private-access',refresh_token:'private-refresh',scope:'https://www.googleapis.com/auth/drive.readonly',expires_in:3600});}
  if(String(url).includes('sheets.googleapis.com')){readPrivate++;assert.equal(opts.headers.authorization,'Bearer private-access');assert.equal(opts.redirect,'error');return Response.json(String(url).includes('/values/')?{values:[['ID','Link ảnh Google Drive','Caption đề xuất'],['one','https://drive.google.com/file/d/1234567890abcdef/view','Riêng tư']]}:{sheets:[{properties:{sheetId:102,title:'Đổi tên tab',gridProperties:{rowCount:50,columnCount:3}}}]});}
  if(String(url).includes('/revoke'))return new Response('');throw new Error('Unexpected URL '+url);
 };
 assert.equal((await googleFeedCallback(new Request(callback,{headers:{cookie}}),env)).status,303);assert.equal(exchanges,1);
 await assert.rejects(()=>googleFeedCallback(new Request(callback,{headers:{cookie}}),env),/hết hạn|sử dụng/);assert.equal(exchanges,1);
 assert.equal((await googleStatus(env,'https://studio.test')).connected,true);
 const secrets=(await env.DB.prepare("SELECT value FROM settings WHERE key LIKE 'feed-google:%'").all<any>()).results.map(r=>r.value).join('');assert.ok(!secrets.includes('private-refresh'));assert.ok(!secrets.includes('secret-for-fixture'));
 await feedAdmin(request('image-feed',feedDefault,'PUT'),env,'image-feed');await scanFeed(env,feedDefault);assert.equal(readPrivate,2);
 const item=await env.DB.prepare('SELECT file_id,caption FROM image_feed_items').first<any>();assert.equal(item.caption,'Riêng tư');
 await env.DB.prepare("UPDATE settings SET value=? WHERE key='feed-google:token'").bind(await encrypt(env,JSON.stringify({refresh_token:'private-refresh',expires:0}))).run();
 assert.equal(await googleAccess(env),'renewed-access');assert.equal(refreshes,1);
 const forged=await getConnect();const other={id:'other',email:'other@test',name:'Other',picture:null};const otherCookie=(await startSession(env,other)).split(';')[0];
 await assert.rejects(()=>googleFeedCallback(new Request('https://studio.test/api/image-feed/google/callback?state='+forged.searchParams.get('state')+'&code=x',{headers:{cookie:otherCookie}}),env),/quản trị/);
 await googleFeedAdmin(request('image-feed/google/disconnect',{}),env,user,'image-feed/google/disconnect');assert.equal(await googleAccess(env),null);assert.equal((await googleStatus(env,'https://studio.test')).connected,false);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
