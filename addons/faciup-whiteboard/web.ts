import {body,HttpError,json,randomId,sha256,timingSafeEqual,type Env} from '../../web/src/util.ts';
import {startRunner} from '../../web/src/gcp.ts';
import {cleanWhiteboard} from './faciup-schema.js';
export const WHITEBOARD_JOB='faciup-whiteboard-runner';
export async function voiceCache(req:Request,env:Env,id:string,index:number){
 const auth=req.headers.get('authorization')||'',lease=req.headers.get('x-nv-lease')||'';
 if(!env.RUNNER_TOKEN||env.RUNNER_TOKEN.length<32||!timingSafeEqual(auth,`Bearer ${env.RUNNER_TOKEN}`))throw new HttpError(401,'Không có quyền.');
 const job=await env.DB.prepare("SELECT user_id,project_id,spec FROM jobs WHERE id=? AND runner=? AND status='running'").bind(id,lease).first<any>();
 if(!job)throw new HttpError(409,'Lượt dựng đã hết hạn.');
 const spec=JSON.parse(job.spec),sc=spec.scenes[index];
 if(spec.look!=='whiteboard'||!sc||!Number.isInteger(index))throw new HttpError(400,'Cảnh không hợp lệ.');
 const hash=await sha256(JSON.stringify({lines:sc.lines,voice:spec.voice}));
 const key=`whiteboard-voice/${job.user_id}/${job.project_id}/${hash}.audio`;
 if(req.method==='GET'){const obj=await env.BUCKET.get(key);return obj?new Response(obj.body):json({missing:true},404);}
 if(req.method!=='PUT')throw new HttpError(405,'Không hỗ trợ.');
 if(Number(req.headers.get('content-length'))>50_000_000)throw new HttpError(413,'Tệp quá lớn.');
 await env.BUCKET.put(key,req.body,{httpMetadata:{contentType:'application/octet-stream'}});return json({ok:true});
}
export async function startWhiteboard(env:Env){return startRunner({...env,GCP_JOB:WHITEBOARD_JOB});}
export function assertWhiteboard(spec:any){
 spec.scenes.forEach((s:any,i:number)=>{if(!cleanWhiteboard(s.whiteboard))throw new HttpError(409,`Cảnh ${i+1} chưa có minh họa Whiteboard. Bấm thiết kế lại hình; kịch bản và tài nguyên vẫn được giữ.`);});
}
// A dedicated claim route uses the existing lease/upload protocol. The old renderer cannot take these jobs.
export async function claimWhiteboard(req:Request,env:Env,rc:any){
 if(req.method!=='POST')throw new HttpError(405,'Không hỗ trợ.');
 const auth=req.headers.get('authorization')||'';
 if(!env.RUNNER_TOKEN||env.RUNNER_TOKEN.length<32||!timingSafeEqual(auth,`Bearer ${env.RUNNER_TOKEN}`))throw new HttpError(401,'Không có quyền.');
 const cb=await body<any>(req,1000),now=Date.now(),lease='lease-'+randomId(16);
 await env.DB.prepare("UPDATE jobs SET status='queued', runner=NULL WHERE status='running' AND json_extract(spec,'$.look')='whiteboard' AND started_at<?").bind(now-45*60000).run();
 const job=await env.DB.prepare(`UPDATE jobs SET status='running', started_at=?, runner=?, progress=0
   WHERE id=(SELECT id FROM jobs WHERE status='queued' AND json_extract(spec,'$.look')='whiteboard' ORDER BY created_at LIMIT 1) AND status='queued'
   RETURNING id,spec,user_id,project_id,created_at`).bind(now,lease).first<any>();
 if(!job){rc.quiet=true;return json({job:null});}
 rc.userId=job.user_id;rc.log('render.start',{projectId:job.project_id,data:{job:job.id,runner:String(cb.runner||'whiteboard').slice(0,60),engine:'faciup-whiteboard'}});
 return json({job:{id:job.id,lease,spec:JSON.parse(job.spec)}});
}
