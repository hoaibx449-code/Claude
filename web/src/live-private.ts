import type {Env} from './util.ts';

/** Caller supplies the authenticated user id, never a client-selected chat or user. */
export async function liveConversation(env:Env,userId:string){
 const link=await env.DB.prepare('SELECT chat_id,linked_at FROM zalo_links WHERE user_id=?').bind(userId).first<{chat_id:string;linked_at:number}>();
 if(!link)return {userId,linked:false,messages:[],processing:false};
 const rows=await env.DB.prepare(`SELECT role,text,at,status FROM (
  SELECT 'user' AS role,CASE WHEN is_text=1 THEN text ELSE '[Ảnh đã gửi qua Zalo]' END AS text,received_at AS at,status FROM zalo_messages WHERE chat_id=? AND received_at>=?
  UNION ALL
  SELECT 'bot',o.text,o.created_at,o.status FROM zalo_outbox o JOIN zalo_messages m ON m.id=o.message_id AND m.chat_id=o.chat_id WHERE o.chat_id=? AND m.received_at>=? AND o.status='sent'
 ) ORDER BY at DESC LIMIT 30`).bind(link.chat_id,link.linked_at,link.chat_id,link.linked_at).all<any>();
 const messages=rows.results.reverse().map(x=>({role:x.role,text:String(x.text||'').replace(/^\u0002H/,'').replace(/<\/?b>/g,'').slice(0,2000),at:x.at}));
 const processing=!!await env.DB.prepare("SELECT 1 FROM zalo_messages WHERE chat_id=? AND received_at>=? AND received_at>? AND status IN ('received','processing') LIMIT 1").bind(link.chat_id,link.linked_at,Date.now()-120000).first();
 return {userId,linked:true,messages,processing};
}
