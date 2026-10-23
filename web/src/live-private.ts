import type {Env} from './util.ts';

/** Caller supplies the authenticated user id, never a client-selected chat or user. */
/** what this signed-in viewer sees of their own: first name, video count, and the videos being made now */
async function liveMe(env:Env,userId:string){
 const VN=7*3600e3,DAY=864e5,start=Math.floor((Date.now()+VN)/DAY)*DAY-VN;
 const [user,count,jobs,done]=await Promise.all([
  env.DB.prepare('SELECT name FROM users WHERE id=?').bind(userId).first<{name:string|null}>(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id=?').bind(userId).first<{n:number}>(),
  env.DB.prepare(`SELECT j.id,j.status,j.progress,p.title,jp.phase FROM projects p JOIN jobs j ON j.project_id=p.id LEFT JOIN job_progress jp ON jp.job_id=j.id
   WHERE p.user_id=? AND j.status IN ('queued','running') ORDER BY j.created_at LIMIT 3`).bind(userId).all<any>(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM projects p JOIN jobs j ON j.project_id=p.id WHERE p.user_id=? AND j.status='done' AND j.finished_at>=?").bind(userId,start).first<{n:number}>(),
 ]);
 const first=String(user?.name||'').trim().split(/\s+/).pop()||'';
 return {name:first.slice(0,30),videos:Number(count?.n)||0,doneToday:Number(done?.n)||0,
  jobs:jobs.results.map((j:any)=>({id:String(j.id),status:String(j.status),phase:String(j.phase||''),progress:Number(j.progress)||0,title:String(j.title||'Video của bạn').slice(0,60)}))};
}
export async function liveConversation(env:Env,userId:string){
 const [link,me]=await Promise.all([env.DB.prepare('SELECT chat_id,linked_at FROM zalo_links WHERE user_id=?').bind(userId).first<{chat_id:string;linked_at:number}>(),liveMe(env,userId)]);
 if(!link)return {userId,me,linked:false,messages:[],processing:false};
 const rows=await env.DB.prepare(`SELECT role,text,at,status FROM (
  SELECT 'user' AS role,CASE WHEN is_text=1 THEN text ELSE '[Ảnh đã gửi qua Zalo]' END AS text,received_at AS at,status FROM zalo_messages WHERE chat_id=? AND received_at>=?
  UNION ALL
  SELECT 'bot',o.text,o.created_at,o.status FROM zalo_outbox o JOIN zalo_messages m ON m.id=o.message_id AND m.chat_id=o.chat_id WHERE o.chat_id=? AND m.received_at>=? AND o.status='sent'
 ) ORDER BY at DESC LIMIT 30`).bind(link.chat_id,link.linked_at,link.chat_id,link.linked_at).all<any>();
 const messages=rows.results.reverse().map(x=>({role:x.role,text:String(x.text||'').replace(/^\u0002H/,'').replace(/<\/?b>/g,'').slice(0,2000),at:x.at}));
 const processing=!!await env.DB.prepare("SELECT 1 FROM zalo_messages WHERE chat_id=? AND received_at>=? AND received_at>? AND status IN ('received','processing') LIMIT 1").bind(link.chat_id,link.linked_at,Date.now()-120000).first();
 return {userId,me,linked:true,messages,processing};
}
