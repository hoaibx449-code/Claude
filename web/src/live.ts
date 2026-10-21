import type {Env} from './util.ts';
import type {Config} from './settings.ts';
/** Public inventory only. Never expose jobs, messages, schedules, keys or customer data. */
export async function liveOverview(env:Env,config:Config){
 const [prompts,solutions,runtime]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM hunter_prompts WHERE status='published'").first<{n:number}>(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM solutions WHERE status='published'").first<{n:number}>(),
  liveRuntime(env),
 ]);
 return {runtime,updatedAt:Date.now(),timezone:'Asia/Ho_Chi_Minh',
  counts:{prompts:Number(prompts?.n||0),solutions:Number(solutions?.n||0)},
  features:{assistant:config.site.helpBot.enabled,zalo:config.zalo.enabled&&config.visibility['feature:zalo']!=='hidden',community:config.visibility['feature:community']!=='hidden'},
 };
}

const publicRoles:Record<string,[string,string]>={editor:['Điều phối','Tổng hợp, phân công và chốt đề xuất.'],strategy:['Chiến lược','Xác định mục tiêu và hướng tiếp cận.'],research:['Nghiên cứu','Đánh giá dữ kiện được cung cấp và nêu điểm cần kiểm chứng.'],writer:['Biên kịch','Soạn nội dung theo nhiệm vụ.'],critic:['Phản biện','Rà soát chất lượng và đề xuất chỉnh sửa.']};
const defaults=['editor','strategy','research','writer','critic'];
export async function liveRuntime(env:Env,now=Date.now()){
 const row=await env.DB.prepare('SELECT config FROM council_settings WHERE id=1').first<{config:string}>();
 let c:any={enabled:false,agents:defaults.map(id=>({id}))};
 if(row)try{const parsed=JSON.parse(row.config);if(Array.isArray(parsed.agents)&&parsed.agents.length>=2)c=parsed;}catch{}
 const enabled=c.enabled===true;
 const agents=c.agents.slice(0,8).map((a:any,i:number)=>({id:'agent-'+i,name:(publicRoles[a.id]||[i===0?'Điều phối':'Chuyên gia '+i])[0],role:(publicRoles[a.id]||['','Thực hiện nhiệm vụ do quản trị phân công.'])[1],state:enabled?'idle':'disabled',completed:0}));
 const start=Math.floor((now+7*3600000)/86400000)*86400000-7*3600000;
 const [jobs,turns]=await Promise.all([
  env.DB.prepare("SELECT status,step,snapshot,lease_until,next_at FROM council_jobs WHERE status IN ('running','queued','delegating','pending','paused') ORDER BY updated_at DESC LIMIT 100").all<any>(),
  env.DB.prepare('SELECT agent_id,COUNT(*) AS n,MAX(created_at) AS latest FROM council_turns WHERE created_at>=? GROUP BY agent_id').bind(start).all<any>(),
 ]);
 const rank:Record<string,number>={disabled:0,idle:1,review:2,paused:3,queued:4,retry:5,running:6};
 let running=0,queued=0,review=0,paused=0;
 for(const j of jobs.results){
  let snap:any;try{snap=JSON.parse(j.snapshot);}catch{continue;}
  const list=Array.isArray(snap.agents)?snap.agents:[];if(!list.length)continue;
  const experts=list.slice(1),last=snap.assistant?0:experts.length*(Number(snap.rounds)||1);
  const current=j.status==='pending'||snap.assistant||j.step>=last?list[0]:experts[j.step%experts.length];
  const i=c.agents.findIndex((a:any)=>a.id===current?.id);if(i<0||!agents[i])continue;
  const state=j.status==='pending'?'review':j.status==='paused'?'paused':j.next_at>now?'retry':j.status==='running'&&j.lease_until>now?'running':'queued';
  if(state==='running')running++;else if(state==='review')review++;else if(state==='paused')paused++;else queued++;
  if(enabled&&rank[state]>rank[agents[i].state])agents[i].state=state;
 }
 let completed=0,lastActivity=0;
 for(const t of turns.results){completed+=Number(t.n);lastActivity=Math.max(lastActivity,Number(t.latest)||0);const i=c.agents.findIndex((a:any)=>a.id===t.agent_id);if(i>=0)agents[i].completed=Number(t.n);}
 return {enabled,agents,running:enabled?running:0,queued,review,paused,completed,lastActivity,polledAt:now};
}
