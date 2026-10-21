import type {Env} from './util.ts';
import type {Config} from './settings.ts';
/** Public inventory only. Never expose jobs, messages, schedules, keys or customer data. */
export async function liveOverview(env:Env,config:Config){
 const [prompts,solutions,runtime]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM hunter_prompts WHERE status='published'").first<{n:number}>(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM solutions WHERE status='published'").first<{n:number}>(),
  liveRuntime(env,Date.now(),config),
 ]);
 return {runtime,updatedAt:Date.now(),timezone:'Asia/Ho_Chi_Minh',
  counts:{prompts:Number(prompts?.n||0),solutions:Number(solutions?.n||0)},
  features:{assistant:config.site.helpBot.enabled,zalo:config.zalo.enabled&&config.visibility['feature:zalo']!=='hidden',community:config.visibility['feature:community']!=='hidden'},
 };
}

const publicRoles:Record<string,[string,string]>={editor:['Điều phối','coordinator'],strategy:['Chiến lược','target'],research:['Nghiên cứu','search'],writer:['Biên kịch','pen'],critic:['Phản biện','check'],news:['Săn tin','news'],design:['Thiết kế','design'],marketing:['Marketing','mega'],data:['Dữ liệu','chart']};
const COLORS=['#f97316','#e8336d','#7c3aed','#2563eb','#0d9488','#ea580c','#db2777','#f59e0b','#0891b2','#4f46e5','#16a34a','#9333ea'];
const defaults=['editor','strategy','research','writer','critic'];
const DAY=86400000,VN=7*3600000;
const dayOf=(t:number)=>Math.floor((t+VN)/DAY);
/**
 * What the public Faciup Live page shows: each agent's state, how long a turn takes, when it worked
 * today, and team KPIs. Names come from the agent's public look (Quản trị → Nhóm AI) or its role;
 * prompts, models, jobs and messages never leave the server. With `config`, the always-on Zalo
 * assistant joins the team.
 */
export async function liveRuntime(env:Env,now=Date.now(),config?:Config){
 const row=await env.DB.prepare('SELECT config FROM council_settings WHERE id=1').first<{config:string}>();
 let c:any={enabled:false,agents:defaults.map(id=>({id}))};
 if(row)try{const parsed=JSON.parse(row.config);if(Array.isArray(parsed.agents)&&parsed.agents.length>=2)c=parsed;}catch{}
 const enabled=c.enabled===true;
 const agents=c.agents.slice(0,12).map((a:any,i:number)=>{const role=publicRoles[a.id];return {id:'agent-'+i,name:a.live?.name||role?.[0]||(i===0?'Điều phối':'Chuyên gia '+i),icon:a.live?.icon||role?.[1]||'spark',
  color:a.live?.color||COLORS[i%COLORS.length],state:enabled?'idle':'disabled',completed:0,last:0,hours:[] as number[][],avg:0,since:0,live:false};});
 const today=dayOf(now),start=today*DAY-VN;
 const [jobs,turns,hourly,decided]=await Promise.all([
  env.DB.prepare("SELECT status,step,snapshot,lease_until,next_at,created_at,(SELECT MAX(created_at) FROM council_turns t WHERE t.job_id=council_jobs.id) AS last_turn FROM council_jobs WHERE status IN ('running','queued','delegating','pending','paused') ORDER BY updated_at DESC LIMIT 100").all<any>(),
  // turns per agent per Vietnam day for 8 days, with how long each turn took (time since the turn before it)
  env.DB.prepare(`WITH t AS (SELECT agent_id,created_at,created_at-COALESCE(LAG(created_at) OVER (PARTITION BY job_id ORDER BY step),(SELECT j.created_at FROM council_jobs j WHERE j.id=council_turns.job_id)) AS dur FROM council_turns WHERE created_at>=?)
   SELECT agent_id,CAST((created_at+${VN})/${DAY} AS INTEGER) AS day,COUNT(*) AS n,MAX(created_at) AS latest,AVG(CASE WHEN dur>0 AND dur<3600000 THEN dur END) AS avg,SUM(CASE WHEN dur>0 AND dur<3600000 THEN 1 ELSE 0 END) AS timed FROM t GROUP BY agent_id,day`).bind(start-7*DAY).all<any>(),
  // when each agent worked today (Vietnam hour → turns), for the activity marks; times only, never content
  env.DB.prepare(`SELECT agent_id,CAST(((created_at+${VN})%${DAY})/3600000 AS INTEGER) AS hour,COUNT(*) AS n FROM council_turns WHERE created_at>=? GROUP BY agent_id,hour`).bind(start).all<any>(),
  env.DB.prepare("SELECT status,COUNT(*) AS n FROM council_jobs WHERE status IN ('approved','rejected','revision') AND updated_at>=? GROUP BY status").bind(now-30*DAY).all<any>(),
 ]);
 const rank:Record<string,number>={disabled:0,idle:1,review:2,paused:3,queued:4,retry:5,running:6};
 let running=0,queued=0,review=0,paused=0,nextAt=0,nextAgent:number|null=null;
 for(const j of jobs.results){
  let snap:any;try{snap=JSON.parse(j.snapshot);}catch{continue;}
  const list=Array.isArray(snap.agents)?snap.agents:[];if(!list.length)continue;
  const experts=list.slice(1),last=snap.assistant?0:experts.length*(Number(snap.rounds)||1);
  const current=j.status==='pending'||snap.assistant||j.step>=last?list[0]:experts[j.step%experts.length];
  const i=c.agents.findIndex((a:any)=>a.id===current?.id);if(i<0||!agents[i])continue;
  const state=j.status==='pending'?'review':j.status==='paused'?'paused':j.next_at>now?'retry':j.status==='running'&&j.lease_until>now?'running':'queued';
  if(state==='running')running++;else if(state==='review')review++;else if(state==='paused')paused++;else queued++;
  if(enabled&&rank[state]>rank[agents[i].state]){agents[i].state=state;if(state==='running')agents[i].since=Math.max(Number(j.last_turn)||0,Number(j.created_at)||0);}
  if((state==='queued'||state==='retry')&&Number(j.next_at)>now)nextAt=nextAt?Math.min(nextAt,Number(j.next_at)):Number(j.next_at);
  if(state==='queued'||state==='retry')nextAgent=nextAgent??i;
 }
 // per agent and per day: turns, latest turn, average turn time
 let completed=0,lastActivity=0;const series=Array(7).fill(0),dayAvg:Record<number,[number,number]>={},agentAvg:Record<number,[number,number]>={};
 for(const t of turns.results){
  const i=c.agents.findIndex((a:any)=>a.id===t.agent_id),d=Number(t.day),n=Number(t.n),timed=Number(t.timed)||0,avg=Number(t.avg)||0;
  if(d>today-7)series[6-(today-d)]+=n;
  if(timed){const x=dayAvg[d]||=[0,0];x[0]+=avg*timed;x[1]+=timed;if(i>=0){const y=agentAvg[i]||=[0,0];y[0]+=avg*timed;y[1]+=timed;}}
  if(d===today){completed+=n;lastActivity=Math.max(lastActivity,Number(t.latest)||0);if(i>=0&&agents[i]){agents[i].completed=n;agents[i].last=Number(t.latest)||0;}}
 }
 for(const [i,[sum,k]] of Object.entries(agentAvg))if(agents[+i])agents[+i].avg=Math.round(sum/k/1000);
 for(const t of hourly.results){const i=c.agents.findIndex((a:any)=>a.id===t.agent_id);if(i>=0&&agents[i])agents[i].hours.push([Number(t.hour),Number(t.n)]);}
 const avgOf=(d:number)=>dayAvg[d]?Math.round(dayAvg[d][0]/dayAvg[d][1]/1000):0;
 const dec:Record<string,number>={};for(const r of decided.results)dec[r.status]=Number(r.n);
 // the Zalo assistant answers around the clock: shown with its real reply count and reply time
 if(config?.zalo?.enabled&&config.visibility?.['feature:zalo']!=='hidden')try{
  const [z,busy,zh]=await Promise.all([
   env.DB.prepare(`SELECT (SELECT COUNT(*) FROM zalo_outbox WHERE status='sent' AND created_at>=?) AS n,(SELECT MAX(created_at) FROM zalo_outbox WHERE status='sent') AS last,
    (SELECT AVG(d) FROM (SELECT MIN(o.created_at)-m.received_at AS d FROM zalo_outbox o JOIN zalo_messages m ON m.id=o.message_id WHERE m.received_at>=? GROUP BY m.id) WHERE d>=0 AND d<600000) AS avg`).bind(start,now-DAY).first<any>(),
   env.DB.prepare("SELECT MIN(received_at) AS since FROM zalo_messages WHERE status IN ('received','processing') AND received_at>?").bind(now-120000).first<any>(),
   env.DB.prepare(`SELECT CAST(((received_at+${VN})%${DAY})/3600000 AS INTEGER) AS hour,COUNT(*) AS n FROM zalo_messages WHERE received_at>=? GROUP BY hour`).bind(start).all<any>(),
  ]);
  agents.push({id:'zalo',name:'Zalo Bot',icon:'zalo',color:'#0068ff',state:busy?.since?'running':'live24',completed:Number(z?.n)||0,last:Number(z?.last)||0,
   hours:zh.results.map((r:any)=>[Number(r.hour),Number(r.n)]),avg:Math.round((Number(z?.avg)||0)/1000),since:Number(busy?.since)||0,live:true});
 }catch{/* Zalo tables not set up yet */}
 const top=agents.filter((a:any)=>a.completed).map((a:any)=>({name:a.name,color:a.color,n:a.completed})).sort((a:any,b:any)=>b.n-a.n).slice(0,4);
 return {enabled,agents,running:enabled?running:0,queued,review,paused,completed,lastActivity,polledAt:now,next:enabled&&nextAgent!==null?{agent:nextAgent,at:nextAt||0}:null,
  kpi:{series,today:completed,yesterday:series[5],avgToday:avgOf(today),avgYesterday:avgOf(today-1),approved:dec.approved||0,decided:(dec.approved||0)+(dec.rejected||0)+(dec.revision||0),top}};
}
