import {body,HttpError,json,randomId,useQuota} from './util.ts';
import {isAdmin} from './settings.ts';
import {hunterMetadata} from './ai.ts';
import {requireBudget} from './budget.ts';
import {aiCost} from './log.ts';
import type {XEnv,Rc} from './worker.ts';
import type {User} from './auth.ts';
export const HUNTER_CATEGORIES=['Viết & nội dung','Hình ảnh','Video','Lập trình','Học tập','Công việc','Khác'];
const text=(v:any,max:number)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max):'';
export function hunterInput(v:any){
 if(typeof v?.content==='string'&&v.content.length>16000)throw new HttpError(400,'Prompt tối đa 16.000 ký tự; hãy chia thành các bài có ý nghĩa độc lập.');
 const content=text(v?.content,16000);if(content.length<20)throw new HttpError(400,'Prompt cần ít nhất 20 ký tự.');
 const source=text(v.source,500);if(source&&!/^https?:\/\/[^\s<>"']+$/.test(source))throw new HttpError(400,'Nguồn phải là đường dẫn http hoặc https.');
 return {content,title:text(v.title,100)||'Prompt chưa đặt tên',description:text(v.description,300),category:HUNTER_CATEGORIES.includes(v.category)?v.category:'Khác',tool:text(v.tool,60),source};
}
// Publication gate is deterministic and independent from instructions embedded in submitted prompts.
export function hunterRisk(content:string){
 if(/(?:sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:password|mật khẩu|api[_ -]?key)\s*[:=]\s*[^\s{}[\]]{8,})/i.test(content))return 'Có thể chứa thông tin bí mật; hãy thay bằng biến mẫu trước khi chia sẻ.';
 return '';
}
async function suggest(env:XEnv,rc:Rc,data:ReturnType<typeof hunterInput>){
 await requireBudget(env,'AI phân loại prompt');const r=await hunterMetadata(env,data.content);
 rc.log('hunter.ai',{cost:aiCost(env.config,r._usage)});
 return {...data,title:r.title,description:r.description,category:r.category,tool:r.tool};
}
export async function createHunter(env:XEnv,rc:Rc,user:{id:string;name?:string|null;email?:string},input:any,admin:boolean,dedupe?:string){
 if(dedupe){const old=await env.DB.prepare('SELECT id,status FROM hunter_prompts WHERE dedupe=?').bind(dedupe).first<any>();if(old)return old;}
 let data=hunterInput(input),ai='none';const risk=hunterRisk(data.content);if(risk)throw new HttpError(400,risk);
 await useQuota(env,user.id,'hunter',admin?100:5);
 if(input.ai!==false)try{data=await suggest(env,rc,data);ai='ready';}catch{ai='failed';}
 const setting=await env.DB.prepare('SELECT auto_approve FROM hunter_settings WHERE id=1').first<any>();
 // Auto approval is opt-in; suspicious content always remains in the queue.
 const flagged=/(?:phishing|ransomware|đánh cắp|lừa đảo|tự sát|xâm hại|bypass safety|ignore (?:all |previous )?instructions)/i.test(data.content);
 const status=admin?'published':setting?.auto_approve&&!flagged?'published':'pending',id=randomId(12),now=Date.now();
 await env.DB.prepare('INSERT INTO hunter_prompts(id,user_id,author,title,content,category,tool,description,source,status,ai_state,dedupe,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,user.name||'Thành viên',data.title,data.content,data.category,data.tool,data.description,data.source,status,ai,dedupe||null,now,now).run();
 rc.log('hunter.submit',{data:{id,status,ai}});return {id,status,ai};
}
export async function hunterPublic(req:Request,env:XEnv,rc:Rc,path:string,user:User|null){
 const u=new URL(req.url),method=req.method;
 if(path==='/api/hunter'&&method==='GET'){
  const mine=u.searchParams.get('mine')==='1';if(mine&&!user)throw new HttpError(401,'Bạn cần đăng nhập.');
  const where=[mine?'user_id=?':"status='published'"],args:any[]=mine?[user!.id]:[];
  const q=text(u.searchParams.get('q'),120),category=text(u.searchParams.get('category'),50);if(q){where.push('(title LIKE ? OR content LIKE ? OR description LIKE ? OR tool LIKE ?)');args.push(...Array(4).fill('%'+q+'%'));}if(category){where.push('category=?');args.push(category);}
  const before=u.searchParams.get('before')?.split(':');if(before&&/^\d+$/.test(before[0])&&/^[a-f0-9]{24}$/.test(before[1]||'')){where.push('(created_at<? OR (created_at=? AND id<?))');args.push(Number(before[0]),Number(before[0]),before[1]);}
  const rows=await env.DB.prepare(`SELECT id,author,title,content,category,tool,description,source,status,ai_state,created_at,updated_at${mine?',note':''} FROM hunter_prompts WHERE ${where.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 31`).bind(...args).all<any>();
  const prompts=rows.results.slice(0,30);return json({prompts,categories:HUNTER_CATEGORIES,next:rows.results.length>30?prompts.at(-1)?.created_at+':'+prompts.at(-1)?.id:null});
 }
 if(!path.startsWith('/api/hunter'))return null;
 if(!user)throw new HttpError(401,'Bạn cần đăng nhập.');
 if(await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').bind(user.id).first())throw new HttpError(403,'Tài khoản đang bị khoá.');
 if(path==='/api/hunter'&&method==='POST')return json(await createHunter(env,rc,user,await body(req,20000),await isAdmin(env,env.config,user)));
 const report=path.match(/^\/api\/hunter\/([a-f0-9]{24})\/report$/);
 if(report&&method==='POST'){
  const b=await body<any>(req,1500),reason=text(b.reason,600);if(reason.length<5)throw new HttpError(400,'Hãy mô tả lý do báo cáo.');
  if(!await env.DB.prepare("SELECT id FROM hunter_prompts WHERE id=? AND status='published'").bind(report[1]).first())throw new HttpError(404,'Không tìm thấy prompt.');
  await useQuota(env,user.id,'hunter-report',10);await env.DB.prepare('INSERT INTO hunter_reports(prompt_id,user_id,reason,created_at) VALUES(?,?,?,?) ON CONFLICT(prompt_id,user_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at').bind(report[1],user.id,reason,Date.now()).run();return json({ok:true});
 }
 throw new HttpError(404,'Không tìm thấy thao tác.');
}
export async function hunterAdmin(req:Request,env:XEnv,rc:Rc,sub:string){
 if(!sub.startsWith('hunter'))return null;const u=new URL(req.url);
 if(sub==='hunter'&&req.method==='GET'){
  const status=u.searchParams.get('status')||'pending',cursor=u.searchParams.get('before')?.split(':'),before=cursor&&/^\d+$/.test(cursor[0])?Number(cursor[0]):Date.now()+1,beforeId=cursor&&/^[a-f0-9]{24}$/.test(cursor[1]||'')?cursor[1]:'ffffffffffffffffffffffff';
  const where=[status==='reported'?"EXISTS(SELECT 1 FROM hunter_reports r WHERE r.prompt_id=p.id)":'status=?'],args:any[]=status==='reported'?[]:[status];
  const q=text(u.searchParams.get('q'),120),category=text(u.searchParams.get('category'),50);
  if(q){where.push('(title LIKE ? OR content LIKE ? OR tool LIKE ? OR description LIKE ?)');args.push(...Array(4).fill('%'+q+'%'));}if(category){where.push('category=?');args.push(category);}
  where.push('(created_at<? OR (created_at=? AND id<?))');args.push(before,before,beforeId);
  const rows=await env.DB.prepare(`SELECT p.*,(SELECT COUNT(*) FROM hunter_reports r WHERE r.prompt_id=p.id) AS reports FROM hunter_prompts p WHERE ${where.join(' AND ')} ORDER BY created_at DESC,id DESC LIMIT 51`).bind(...args).all<any>();
  const config=await env.DB.prepare('SELECT auto_approve FROM hunter_settings WHERE id=1').first<any>();return json({prompts:rows.results.slice(0,50),next:rows.results.length>50?rows.results[49].created_at+':'+rows.results[49].id:null,autoApprove:!!config?.auto_approve,categories:HUNTER_CATEGORIES});
 }
 if(sub==='hunter/settings'&&req.method==='PUT'){const b=await body<any>(req,500);await env.DB.prepare('UPDATE hunter_settings SET auto_approve=? WHERE id=1').bind(b.autoApprove===true?1:0).run();rc.log('hunter.settings',{data:{autoApprove:b.autoApprove===true}});return json({ok:true});}
 const m=sub.match(/^hunter\/([a-f0-9]{24})(?:\/(analyze))?$/);if(!m)throw new HttpError(404,'Không tìm thấy prompt.');
 const old=await env.DB.prepare('SELECT * FROM hunter_prompts WHERE id=?').bind(m[1]).first<any>();if(!old)throw new HttpError(404,'Không tìm thấy prompt.');
 if(m[2]&&req.method==='POST'){await useQuota(env,'admin-hunter','hunter-ai',100);return json(await suggest(env,rc,hunterInput(old)));}
 if(req.method==='GET'){const reports=await env.DB.prepare('SELECT reason,created_at FROM hunter_reports WHERE prompt_id=? ORDER BY created_at DESC LIMIT 100').bind(m[1]).all();return json({prompt:old,reports:reports.results});}
 if(req.method==='PUT'){
  const b=await body<any>(req,22000),data=hunterInput(b),status=['pending','published','rejected'].includes(b.status)?b.status:old.status;
  const risk=hunterRisk(data.content);if(status==='published'&&risk)throw new HttpError(400,risk);
  const r=await env.DB.prepare('UPDATE hunter_prompts SET title=?,content=?,category=?,tool=?,description=?,source=?,status=?,note=?,updated_at=? WHERE id=? AND updated_at=?').bind(data.title,data.content,data.category,data.tool,data.description,data.source,status,text(b.note,600),Date.now(),m[1],b.updated_at).run();
  if(!r.meta.changes)throw new HttpError(409,'Bài đã thay đổi. Mở lại để tránh ghi đè.');
  if(b.resolveReports===true)await env.DB.prepare('DELETE FROM hunter_reports WHERE prompt_id=?').bind(m[1]).run();
  rc.log('hunter.moderate',{data:{id:m[1],status}});return json({ok:true});
 }
 throw new HttpError(405,'Thao tác không hỗ trợ.');
}
