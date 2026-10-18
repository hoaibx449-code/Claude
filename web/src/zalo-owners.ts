import {body,HttpError,json} from './util.ts';import type {XEnv} from './worker.ts';

async function seed(env:XEnv){
 if(await env.DB.prepare("SELECT 1 FROM settings WHERE key='zalo-owner-roster:v1'").first())return;
 const emails=(env.config.admins.length?env.config.admins:[env.ADMIN_EMAIL||'']).map(x=>x.toLowerCase().trim()).filter(Boolean);
 const old=emails.length?(await env.DB.prepare(`SELECT l.chat_id,l.name FROM zalo_links l JOIN users u ON u.id=l.user_id WHERE lower(u.email) IN (${emails.map(()=>'?').join(',')})`).bind(...emails).all<any>()).results:[];
 if(env.config.zalo.ownerChat)old.push({chat_id:env.config.zalo.ownerChat,name:''});
 await env.DB.batch([...old.map(r=>env.DB.prepare('INSERT OR IGNORE INTO zalo_owners(chat_id,name,active,created_at,updated_at) VALUES(?,?,1,?,?)').bind(r.chat_id,r.name||'',Date.now(),Date.now())),env.DB.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES('zalo-owner-roster:v1','1',?)").bind(Date.now())]);
}
export async function ownerRecipients(env:XEnv){
 await seed(env);
 const rows=(await env.DB.prepare('SELECT o.chat_id,l.user_id FROM zalo_owners o LEFT JOIN zalo_links l ON l.chat_id=o.chat_id WHERE o.active=1').all<any>()).results;
 return {chats:rows.map(r=>r.chat_id),admins:[...new Set<string>(rows.map(r=>r.user_id).filter(Boolean))]};
}
export async function addOwner(env:XEnv,chat:string,name=''){
 await seed(env);await env.DB.prepare('INSERT INTO zalo_owners(chat_id,name,active,created_at,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(chat_id) DO UPDATE SET active=1,name=CASE WHEN excluded.name<>\'\' THEN excluded.name ELSE name END,updated_at=excluded.updated_at').bind(chat,name.slice(0,100),Date.now(),Date.now()).run();
}
export async function ownerAdmin(req:Request,env:XEnv,sub:string){
 if(sub!=='zalo/owners')return null;await seed(env);
 if(req.method==='GET'){
  const owners=(await env.DB.prepare("SELECT o.chat_id,COALESCE(NULLIF(l.name,''),NULLIF(o.name,''),(SELECT m.sender_name FROM zalo_messages m WHERE m.chat_id=o.chat_id AND m.sender_name<>'' ORDER BY m.received_at DESC LIMIT 1),'Chưa có tên') name,o.active,o.created_at,u.id AS user_id,u.email,COALESCE(s.active,0) AS receives_images FROM zalo_owners o LEFT JOIN zalo_links l ON l.chat_id=o.chat_id LEFT JOIN users u ON u.id=l.user_id LEFT JOIN image_feed_subscribers s ON s.chat_id=o.chat_id ORDER BY o.active DESC,o.created_at").all<any>()).results;
  const links=(await env.DB.prepare('SELECT l.chat_id,l.name,u.email FROM zalo_links l LEFT JOIN users u ON u.id=l.user_id ORDER BY linked_at DESC LIMIT 100').all<any>()).results;
  const messages=(await env.DB.prepare('SELECT chat_id,MAX(sender_name) AS name FROM zalo_messages GROUP BY chat_id ORDER BY MAX(received_at) DESC LIMIT 100').all<any>()).results;
  const candidates=[...links,...messages,...owners].filter((r,n,a)=>a.findIndex(x=>x.chat_id===r.chat_id)===n);
  return json({owners,candidates});
 }
 if(req.method==='POST'){
  const b=await body<any>(req,1000),chat=String(b.chatId||'');
  if(b.action==='remove'){
   await env.DB.batch([env.DB.prepare('UPDATE zalo_owners SET active=0,updated_at=? WHERE chat_id=?').bind(Date.now(),chat),env.DB.prepare("UPDATE zalo_outbox SET status='cancelled',error='Đã gỡ người nhận thông báo chủ web.' WHERE chat_id=? AND status IN ('pending','failed') AND message_id IS NULL AND text LIKE '🔔 %'").bind(chat)]);
   return json({ok:true});
  }
  if(b.action==='add'){
   const known=await env.DB.prepare('SELECT name FROM zalo_links WHERE chat_id=? UNION ALL SELECT sender_name AS name FROM zalo_messages WHERE chat_id=? UNION ALL SELECT name FROM zalo_owners WHERE chat_id=? LIMIT 1').bind(chat,chat,chat).first<any>();
   if(!known)throw new HttpError(400,'Chọn Zalo đã liên kết hoặc đã nhắn bot. Có thể dùng mã CHUWEB để thêm Zalo mới.');
   await addOwner(env,chat,known.name||'');return json({ok:true});
  }
 }
 throw new HttpError(400,'Thao tác chủ web không hợp lệ.');
}
