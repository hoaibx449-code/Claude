import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {database} from './support/sqlite.ts';import worker from '../web/src/worker.ts';
import {clearCache,defaultConfig} from '../web/src/settings.ts';
import {startSession,newNonce,consumeNonce,checkLoginBrowser,loginNonceCookie,verifyGoogleToken} from '../web/src/auth.ts';
import {googleFeedCallback} from '../web/src/feed-google.ts';import {readBytes} from '../web/src/util.ts';import {upload} from '../web/src/media.ts';import {validEndpoint} from '../web/src/push.ts';

test('Actual Worker rejects unauthenticated/forged/member/blocked admin access and cross-account project reads',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'security-admin-'));clearCache();
 try{
 const env:any={DB:database(join(dir,'db.sqlite')),ADMIN_EMAIL:'admin@test',RUNNER_TOKEN:'r'.repeat(32),DAILY_SCRIPTS:'20',DAILY_IMAGES:'60',DAILY_RENDERS:'5',ASSETS:{fetch:async()=>new Response('asset',{headers:{'content-type':'text/plain'}})}};
 const pending:Promise<any>[]=[];const ctx:any={waitUntil(p:Promise<any>){pending.push(p);}};
 const call=async(path:string,options:any={})=>{const r=await worker.fetch(new Request('https://studio.test'+path,options),env,ctx);await Promise.all(pending.splice(0));return r;};
 const member=(await startSession(env,{id:'member',email:'member@test',name:'Member',picture:null})).split(';')[0];
 const admin=(await startSession(env,{id:'admin',email:'admin@test',name:'Admin',picture:null})).split(';')[0];
 const routes=['settings','users','orders','zalo/owners','image-feed','image-feed/test','image-feed/apps-script','image-feed/google'];
 for(const r of routes){
  const anon=await call('/api/admin/'+r);assert.equal(anon.status,401,r);assert.equal(anon.headers.get('x-frame-options'),'DENY');assert.equal(anon.headers.get('x-content-type-options'),'nosniff');assert.equal(anon.headers.get('cache-control'),'no-store');
  assert.equal((await call('/api/admin/'+r,{headers:{cookie:member}})).status,403,r);
  assert.equal((await call('/api/admin/'+r,{headers:{cookie:'sid='+'0'.repeat(64)}})).status,401,r);
 }
 for(const path of ['/api/admin/settings','/api/admin/zalo/owners','/api/admin/image-feed/apps-script/setup']){
  const method=path.endsWith('settings')?'PUT':'POST';
  assert.equal((await call(path,{method,headers:{cookie:admin,'content-type':'application/json'},body:'{}'})).status,403);
  assert.equal((await call(path,{method,headers:{cookie:admin,'x-nv':'1',origin:'https://attacker.test','content-type':'application/json'},body:'{}'})).status,403);
  assert.equal((await call(path,{method,headers:{cookie:member,'x-nv':'1',origin:'https://studio.test','content-type':'application/json'},body:'{}'})).status,403);
 }
 assert.equal((await call('/api/admin/image-feed',{headers:{cookie:admin}})).status,200);
 env.GOOGLE_CLIENT_ID='fixture-client';
 const config=await call('/api/auth/config'),login=await config.json() as any;
 assert.match(config.headers.get('set-cookie')||'',/__Host-nv_login=/);
 const callback=await call('/api/auth/google/callback',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state:login.nonce+'.',credential:'attacker-token'})});
 assert.equal(callback.status,303);assert.match(callback.headers.get('location')||'',/dang-nhap-loi/);assert.equal(callback.headers.get('set-cookie'),null);
 const id='a'.repeat(24);await env.DB.prepare('INSERT INTO projects(id,user_id,title,spec,created_at,updated_at) VALUES(?,?,?,?,1,1)').bind(id,'admin','private',JSON.stringify({title:'private',scenes:[]})).run();
 assert.equal((await call('/api/projects/'+id,{headers:{cookie:member}})).status,404);
 assert.equal((await call('/api/projects/'+id,{method:'PUT',headers:{cookie:member,'x-nv':'1'},body:JSON.stringify({spec:{title:'stolen'}})})).status,404);
 assert.equal((await call('/api/runner/config',{headers:{authorization:'Bearer wrong'}})).status,401);
 assert.equal((await call('/api/image-feed/bridge/config',{method:'POST',body:'{}'})).status,401);
 await env.DB.prepare("INSERT INTO blocked_users(user_id,blocked_at) VALUES('admin',1)").run();
 assert.equal((await call('/api/admin/settings',{headers:{cookie:admin}})).status,403);
 const xenv={...env,config:defaultConfig(env)};
 await assert.rejects(()=>googleFeedCallback(new Request('https://studio.test/api/image-feed/google/callback?state='+'a'.repeat(64),{headers:{cookie:admin}}),xenv),/khóa/);
 }finally{clearCache();rmSync(dir,{recursive:true,force:true});}
});

test('Login browser binding blocks a valid nonce from a different browser and nonce replay',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'security-login-'));try{
 const env:any={DB:database(join(dir,'db.sqlite'))},nonce=await newNonce(env);
 assert.match(loginNonceCookie(nonce),/__Host-nv_login=.*HttpOnly; Secure; SameSite=None/);
 for(const cookie of ['', '__Host-nv_login='+'0'.repeat(32)])assert.throws(()=>checkLoginBrowser(new Request('https://studio.test',{headers:{cookie}}),nonce),/trình duyệt/);
 checkLoginBrowser(new Request('https://studio.test',{headers:{cookie:'__Host-nv_login='+nonce}}),nonce);
 await consumeNonce(env,nonce);await assert.rejects(()=>consumeNonce(env,nonce),/hết hạn/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Google token validation rejects altered signatures, wrong audience/issuer/nonce and expired/unverified identities',async()=>{
 const original=globalThis.fetch;try{
 const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',kp.publicKey),kid:'audit-key'};globalThis.fetch=async()=>Response.json({keys:[jwk]});
 const enc=(x:any)=>Buffer.from(JSON.stringify(x)).toString('base64url');const now=Math.floor(Date.now()/1000);
 const base={iss:'https://accounts.google.com',aud:'fixture-client',exp:now+3600,iat:now,sub:'12345',email:'admin@test',email_verified:true,nonce:'expected-nonce'};
 const signed=async(payload:any)=>{const text=enc({alg:'RS256',kid:'audit-key'})+'.'+enc(payload);return text+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(text))).toString('base64url');};
 assert.equal((await verifyGoogleToken(await signed(base),'fixture-client','expected-nonce')).email,'admin@test');
 for(const patch of [{aud:'attacker-client'},{iss:'https://attacker.test'},{exp:now-1},{iat:now+9999},{email_verified:false},{nonce:'stolen-nonce'}])await assert.rejects(()=>signed({...base,...patch}).then(t=>verifyGoogleToken(t,'fixture-client','expected-nonce')));
 const valid=await signed(base),parts=valid.split('.');parts[1]=enc({...base,email:'forged-admin@test'});await assert.rejects(()=>verifyGoogleToken(parts.join('.'),'fixture-client','expected-nonce'));
 await assert.rejects(()=>verifyGoogleToken(enc({alg:'none'})+'.'+enc(base)+'.','fixture-client','expected-nonce'));
 }finally{globalThis.fetch=original;}
});

test('Chunked/falsely sized uploads stop at byte limit before storage and push endpoints cannot add credentials or ports',async()=>{
 let stored=0;const env:any={BUCKET:{put(){stored++;}}};
 const stream=()=>new ReadableStream({start(c){c.enqueue(new Uint8Array(1024));c.enqueue(new Uint8Array(5*1024*1024));c.close();}});
 const request=()=>new Request('https://studio.test',{method:'POST',headers:{'content-type':'image/png','content-length':'1'},body:stream(),duplex:'half'} as any);
 await assert.rejects(()=>upload(request(),env,{} as any,{id:'u'} as any),{status:413});assert.equal(stored,0);
 await assert.rejects(()=>readBytes(new Request('https://studio.test',{method:'POST',body:'oversized'}),3),{status:413});
 for(const u of ['https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#token','http://fcm.googleapis.com/x','https://fcm.googleapis.com.attacker.test/x'])assert.equal(validEndpoint(u),false,u);
 assert.equal(validEndpoint('https://fcm.googleapis.com/fcm/send/example'),true);
});
