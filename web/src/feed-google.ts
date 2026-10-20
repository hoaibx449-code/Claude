import {body,HttpError,json,randomId,sha256} from './util.ts';
import {encrypt,decrypt,isAdmin} from './settings.ts';
import {currentUser,type User} from './auth.ts';
import type {XEnv} from './worker.ts';

const SCOPE='https://www.googleapis.com/auth/drive.readonly';
const callback='/api/image-feed/google/callback';
type Client={client_id:string;client_secret:string};
async function read(env:XEnv,key:string){const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('feed-google:'+key).first<any>();if(!row)return null;try{return JSON.parse(await decrypt(env,row.value));}catch{throw new HttpError(503,'Không giải mã được kết nối Google. Hãy kết nối lại trong quản trị.');}}
async function write(env:XEnv,key:string,value:unknown){await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('feed-google:'+key,await encrypt(env,JSON.stringify(value)),Date.now()).run();}
export async function googleStatus(env:XEnv,site:string){
 const client=await read(env,'client'),token=await read(env,'token');return {configured:!!client,connected:!!token?.refresh_token,clientId:client?.client_id||env.GOOGLE_CLIENT_ID||'',redirect:site+callback,scope:SCOPE};
}
async function tokenRequest(params:Record<string,string>){
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(15000),redirect:'error'});
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok||!data.access_token)throw new HttpError(502,data.error==='invalid_grant'?'Quyền Google đã hết hạn hoặc bị thu hồi. Hãy kết nối lại.':'Google chưa cấp quyền truy cập. Kiểm tra Client ID, Client secret và cấu hình OAuth.');
 return data;
}
export async function googleAccess(env:XEnv):Promise<string|null>{
 const token=await read(env,'token');if(!token)return null;
 if(token.expires>Date.now()+60000&&token.access_token)return token.access_token;
 const client:Client=await read(env,'client');if(!client||!token.refresh_token)throw new HttpError(503,'Cần kết nối lại Google Drive.');
 const fresh=await tokenRequest({...client,grant_type:'refresh_token',refresh_token:token.refresh_token});
 await write(env,'token',{...token,access_token:fresh.access_token,expires:Date.now()+Number(fresh.expires_in||3600)*1000});return fresh.access_token;
}
export async function googleGet(env:XEnv,url:string){
 const token=await googleAccess(env);if(!token)throw new HttpError(409,'Chưa kết nối Google Drive trong quản trị web.');
 const u=new URL(url);if(u.protocol!=='https:'||!['www.googleapis.com','sheets.googleapis.com'].includes(u.hostname))throw new Error('Invalid Google API host');
 const r=await fetch(url,{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok){await r.body?.cancel();throw new HttpError(r.status===401?401:400,r.status===401?'Phiên Google không còn hiệu lực; hãy kết nối lại.':`Google không cho đọc dữ liệu (HTTP ${r.status}). Kiểm tra quyền tệp và đã bật Drive API / Sheets API.`);}
 return r;
}
export async function googleFeedAdmin(req:Request,env:XEnv,user:User,sub:string){
 if(!sub.startsWith('image-feed/google'))return null;const site=new URL(req.url).origin;
 if(sub==='image-feed/google'&&req.method==='GET')return json(await googleStatus(env,site));
 if(sub==='image-feed/google/client'&&req.method==='PUT'){
  const b=await body<any>(req,12000),c=b.web||b;
  const client_id=String(c.client_id||'').trim(),client_secret=String(c.client_secret||'').trim();
  if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client_id)||client_secret.length<10||client_secret.length>300)throw new HttpError(400,'Cần OAuth Client ID và Client secret của ứng dụng Web. Có thể tải tệp JSON OAuth từ Google Cloud vào đây.');
  const old=await read(env,'client');
  if(old&&(old.client_id!==client_id||old.client_secret!==client_secret))await env.DB.batch([env.DB.prepare("DELETE FROM settings WHERE key='feed-google:token'"),env.DB.prepare('DELETE FROM feed_google_states')]);
  await write(env,'client',{client_id,client_secret});return json(await googleStatus(env,site));
 }
 if(sub==='image-feed/google/connect'&&req.method==='POST'){
  const client:Client=await read(env,'client');if(!client)throw new HttpError(409,'Nhập OAuth Client ID và Client secret trước khi kết nối.');
  const state=randomId(32),verifier=randomId(48),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  const challenge=btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  await env.DB.prepare('DELETE FROM feed_google_states WHERE expires<? OR user_id=?').bind(Date.now(),user.id).run();
  await env.DB.prepare('INSERT INTO feed_google_states(state,user_id,verifier,redirect,expires) VALUES(?,?,?,?,?)').bind(await sha256(state),user.id,await encrypt(env,verifier),site+callback,Date.now()+600000).run();
  const q=new URLSearchParams({client_id:client.client_id,redirect_uri:site+callback,response_type:'code',scope:SCOPE,state,access_type:'offline',prompt:'consent',code_challenge:challenge,code_challenge_method:'S256'});
  return json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+q});
 }
 if(sub==='image-feed/google/disconnect'&&req.method==='POST'){
  // Delete locally first: scheduled jobs stop using this grant immediately. Revocation is best effort.
  const token=await read(env,'token');await env.DB.batch([env.DB.prepare("DELETE FROM settings WHERE key='feed-google:token'"),env.DB.prepare('DELETE FROM feed_google_states')]);
  if(token?.refresh_token)await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refresh_token}),signal:AbortSignal.timeout(5000),redirect:'error'}).catch(()=>{});
  return json({ok:true});
 }
 throw new HttpError(404,'Không tìm thấy thao tác Google.');
}
export async function googleFeedCallback(req:Request,env:XEnv){
 const user=await currentUser(env,req);if(!user||!await isAdmin(env,env.config,user))throw new HttpError(403,'Hãy đăng nhập tài khoản quản trị đã bắt đầu kết nối Google.');
 if(await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').bind(user.id).first())throw new HttpError(403,'Tài khoản quản trị đã bị khóa.');
 const u=new URL(req.url),state=u.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))throw new HttpError(400,'Mã kết nối Google không hợp lệ.');
 const row=await env.DB.prepare('DELETE FROM feed_google_states WHERE state=? AND user_id=? AND expires>? RETURNING *').bind(await sha256(state),user.id,Date.now()).first<any>();
 if(!row||row.redirect!==u.origin+callback)throw new HttpError(400,'Phiên kết nối đã hết hạn hoặc đã sử dụng. Hãy kết nối lại.');
 if(u.searchParams.has('error'))return Response.redirect(u.origin+'/admin/anh-zalo',303);
 const code=u.searchParams.get('code');if(!code||code.length>4000)throw new HttpError(400,'Google chưa cung cấp mã cấp quyền.');
 const client:Client=await read(env,'client');if(!client)throw new HttpError(409,'Cấu hình Google đã thay đổi.');
 const token=await tokenRequest({...client,grant_type:'authorization_code',code,redirect_uri:row.redirect,code_verifier:await decrypt(env,row.verifier)});
 if(!String(token.scope||'').split(' ').includes(SCOPE))throw new HttpError(403,'Cần chấp thuận quyền đọc Google Drive để lấy ảnh riêng tư.');
 if(!token.refresh_token)throw new HttpError(409,'Google chưa cấp quyền chạy định kỳ. Hãy kết nối lại và chấp thuận quyền truy cập ngoại tuyến.');
 await write(env,'token',{refresh_token:token.refresh_token,access_token:token.access_token,expires:Date.now()+Number(token.expires_in||3600)*1000});
 return new Response(null,{status:303,headers:{location:u.origin+'/admin/anh-zalo','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
