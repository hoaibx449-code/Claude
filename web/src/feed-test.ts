import type {User} from './auth.ts';import type {XEnv} from './worker.ts';
import {body,HttpError,json,useQuota} from './util.ts';
import {feedConfig,cacheImage} from './image-feed.ts';import {zaloApi,origin} from './zalo.ts';

async function target(env:XEnv,user:User){
 const own=await env.DB.prepare('SELECT chat_id,name FROM zalo_links WHERE user_id=?').bind(user.id).first<any>();
 return own?{chat:own.chat_id,name:(own.name||'Zalo của bạn')+' · …'+String(own.chat_id).slice(-6)}:null;
}
export async function runFeedTests(env:XEnv){
 const c=await feedConfig(env),now=Date.now();
 await env.DB.prepare("UPDATE feed_image_tests SET status='failed',error='Zalo nhận thử không còn khớp với tài khoản đã liên kết. Hãy gửi thử lại.' WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM zalo_links l WHERE l.user_id=feed_image_tests.user_id AND l.chat_id=feed_image_tests.chat_id)").run();
 await env.DB.prepare("UPDATE feed_image_tests SET status='failed',error='Nguồn ảnh đã thay đổi. Chọn lại ảnh để thử.' WHERE status='pending' AND EXISTS(SELECT 1 FROM image_feed_items i WHERE i.id=feed_image_tests.item_id AND i.source<>?)").bind(c.sheet+'|'+c.gid).run();
 await env.DB.prepare("UPDATE feed_image_tests SET status='failed',error='Hết thời gian chờ ảnh. Chạy dongBoAnh rồi thử lại.' WHERE status='pending' AND expires<?").bind(now).run();
 await env.DB.prepare("UPDATE feed_image_tests SET status='unknown',error='Tác vụ bị ngắt. Kiểm tra Zalo trước khi gửi lại.' WHERE status='sending' AND updated_at<?").bind(now-120000).run();
 const rows=await env.DB.prepare("SELECT t.id AS test_id,t.chat_id,t.origin,i.* FROM feed_image_tests t JOIN image_feed_items i ON i.id=t.item_id WHERE t.status='pending' AND t.expires>? ORDER BY t.created_at LIMIT 3").bind(now).all<any>();
 for(const i of rows.results){
  if(!env.config.zalo.enabled||!(env as any).ZALO_BOT_TOKEN){await env.DB.prepare("UPDATE feed_image_tests SET status='failed',error='Zalo Bot đang tắt hoặc thiếu token.' WHERE id=? AND status='pending'").bind(i.test_id).run();continue;}
  if(c.transport==='apps-script'&&(!(i.expires>now+60000)||!await env.BUCKET.head('feed/'+i.id)))continue;
  const claim=await env.DB.prepare("UPDATE feed_image_tests SET status='sending',updated_at=? WHERE id=? AND status='pending' RETURNING id").bind(now,i.test_id).first();if(!claim)continue;
  let status='failed',error='',message='';try{
   await cacheImage(env,i,c);const site=origin(env)||i.origin;
   if(!site?.startsWith('https://'))throw new Error('Chưa có địa chỉ web HTTPS.');
   const r=await zaloApi((env as any).ZALO_BOT_TOKEN,'sendPhoto',{chat_id:i.chat_id,photo:`${site}/api/image-feed/photo/${i.id}?t=${i.token}`,caption:('[Gửi thử] '+(i.caption||'Ảnh từ Google Sheet')).slice(0,1900)});
   status=r.ok?'sent':r.status===0||r.status>=500?'unknown':'failed';error=r.error;message=String(r.result?.message_id||'');
  }catch(e:any){error=String(e.message||e);}
  await env.DB.prepare('UPDATE feed_image_tests SET status=?,error=?,message_id=?,updated_at=? WHERE id=?').bind(status,error.slice(0,300),message,Date.now(),i.test_id).run();
 }
}
export async function feedTestAdmin(req:Request,env:XEnv,user:User,sub:string){
 if(sub!=='image-feed/test')return null;
 const c=await feedConfig(env),recipient=await target(env,user);
 if(req.method==='GET'){
  const items=await env.DB.prepare('SELECT id,file_id,external_id,caption,baseline,expires FROM image_feed_items WHERE source=? ORDER BY created_at DESC,id LIMIT 100').bind(c.sheet+'|'+c.gid).all<any>();
  const tests=await env.DB.prepare('SELECT id,item_id,status,error,message_id,created_at FROM feed_image_tests WHERE user_id=? ORDER BY created_at DESC LIMIT 10').bind(user.id).all<any>();
  return json({recipient:recipient?.name||'',items:items.results,tests:tests.results});
 }
 if(req.method==='POST'){
  if(!recipient)throw new HttpError(409,'Chưa có Zalo của quản trị. Hãy liên kết đúng Zalo với tài khoản quản trị này trước. Không tự chuyển sang Zalo chủ web.');
  if(!env.config.zalo.enabled||!(env as any).ZALO_BOT_TOKEN)throw new HttpError(409,'Zalo Bot đang tắt hoặc thiếu token.');
  const b=await body<any>(req,1000);if(!/^[a-f0-9-]{24,64}$/.test(b.requestId||''))throw new HttpError(400,'Mã gửi thử không hợp lệ.');
  const item=await env.DB.prepare('SELECT id FROM image_feed_items WHERE id=? AND source=?').bind(String(b.itemId),c.sheet+'|'+c.gid).first();if(!item)throw new HttpError(404,'Ảnh chưa được đồng bộ từ nguồn đang chọn. Chạy dongBoAnh rồi làm mới danh sách.');
  const prior=await env.DB.prepare('SELECT id FROM feed_image_tests WHERE id=? AND user_id=?').bind(b.requestId,user.id).first();
  if(!prior){await useQuota(env,user.id,'feed-test',30);await env.DB.prepare("INSERT OR IGNORE INTO feed_image_tests(id,user_id,item_id,chat_id,origin,status,created_at,updated_at,expires) VALUES(?,?,?,?,?,'pending',?,?,?)").bind(b.requestId,user.id,b.itemId,recipient.chat,new URL(req.url).origin,Date.now(),Date.now(),Date.now()+600000).run();}
  await runFeedTests(env);
  return json(await env.DB.prepare('SELECT id,status,error,message_id FROM feed_image_tests WHERE id=? AND user_id=?').bind(b.requestId,user.id).first());
 }
 throw new HttpError(405,'Thao tác không hợp lệ.');
}
