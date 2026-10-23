import type {Env} from './util.ts';
import type {Config} from './settings.ts';
import {councilPlaces} from './council.ts';
/** Public inventory only. Never expose jobs, messages, schedules, keys or customer data. */
/** a few index-only reads that change whenever the office does: the page polls this every few seconds
 *  and only reloads the full picture when it moves */
export async function livePulse(env:Env){
 const row=await env.DB.prepare(`SELECT (SELECT MAX(created_at) FROM council_turns) AS t,
  (SELECT updated_at FROM council_jobs WHERE status='running' ORDER BY updated_at DESC LIMIT 1) AS r,
  (SELECT updated_at FROM council_jobs WHERE status='queued' ORDER BY updated_at DESC LIMIT 1) AS q,
  (SELECT updated_at FROM council_jobs WHERE status='delegating' ORDER BY updated_at DESC LIMIT 1) AS d,
  (SELECT updated_at FROM council_jobs WHERE status='pending' ORDER BY updated_at DESC LIMIT 1) AS p,
  (SELECT updated_at FROM council_jobs WHERE status='approved' ORDER BY updated_at DESC LIMIT 1) AS a`).first<any>().catch(()=>null);
 const zalo=await env.DB.prepare(`SELECT (SELECT MAX(received_at) FROM zalo_messages) AS m,(SELECT MAX(created_at) FROM zalo_outbox) AS o,
  (SELECT updated_at FROM zalo_messages WHERE status='processing' ORDER BY updated_at DESC LIMIT 1) AS w`).first<any>().catch(()=>null);
 const sig=(o:any)=>o?Object.values(o).map(v=>Number(v)||0).join('.'):'';
 return {jobs:sig(row),zalo:sig(zalo),at:Date.now()};
}
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

const publicRoles:Record<string,[string,string]>={editor:['FACIUP','coordinator'],hr:['Nhân sự','spark'],accounting:['Kế toán','chart'],strategy:['Chiến lược','target'],research:['Nghiên cứu','search'],writer:['Biên kịch','pen'],critic:['Phản biện','check'],news:['Săn tin','news'],design:['Thiết kế','design'],marketing:['Marketing','mega'],data:['Dữ liệu','chart']};
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
 // every agent sits at a desk in a room of the office (rooms and desks are set in Quản trị → Nhóm AI)
 councilPlaces(c);
 const enabled=c.enabled===true;
 const agents=c.agents.slice(0,12).map((a:any,i:number)=>{const role=publicRoles[a.id];return {id:'agent-'+i,seat:Number(a.seat)||0,room:String(a.room||''),name:a.live?.name||role?.[0]||(i===0?'Điều phối':'Chuyên gia '+i),icon:a.live?.icon||role?.[1]||'spark',
  color:a.live?.color||COLORS[i%COLORS.length],state:enabled?'idle':'disabled',completed:0,last:0,hours:[] as number[][],avg:0,since:0,live:false};});
 const today=dayOf(now),start=today*DAY-VN;
 const [jobs,turns,hourly,decided,recentTurns]=await Promise.all([
  env.DB.prepare("SELECT status,step,snapshot,lease_until,next_at,created_at,(SELECT MAX(created_at) FROM council_turns t WHERE t.job_id=council_jobs.id) AS last_turn FROM council_jobs WHERE status IN ('running','queued','delegating','pending','paused') ORDER BY updated_at DESC LIMIT 100").all<any>(),
  // turns per agent per Vietnam day for 8 days, with how long each turn took (time since the turn before it)
  env.DB.prepare(`WITH t AS (SELECT agent_id,created_at,created_at-COALESCE(LAG(created_at) OVER (PARTITION BY job_id ORDER BY step),(SELECT j.created_at FROM council_jobs j WHERE j.id=council_turns.job_id)) AS dur FROM council_turns WHERE created_at>=?)
   SELECT agent_id,CAST((created_at+${VN})/${DAY} AS INTEGER) AS day,COUNT(*) AS n,MAX(created_at) AS latest,AVG(CASE WHEN dur>0 AND dur<3600000 THEN dur END) AS avg,SUM(CASE WHEN dur>0 AND dur<3600000 THEN 1 ELSE 0 END) AS timed FROM t GROUP BY agent_id,day`).bind(start-7*DAY).all<any>(),
  // when each agent worked today (Vietnam hour → turns), for the activity marks; times only, never content
  env.DB.prepare(`SELECT agent_id,CAST(((created_at+${VN})%${DAY})/3600000 AS INTEGER) AS hour,COUNT(*) AS n FROM council_turns WHERE created_at>=? GROUP BY agent_id,hour`).bind(start).all<any>(),
  env.DB.prepare("SELECT status,COUNT(*) AS n FROM council_jobs WHERE status IN ('approved','rejected','revision') AND updated_at>=? GROUP BY status").bind(now-30*DAY).all<any>(),
  // the latest handovers: which role finished a turn and when
  env.DB.prepare('SELECT agent_id,created_at FROM council_turns WHERE created_at>=? ORDER BY created_at DESC LIMIT 6').bind(now-DAY).all<any>(),
 ]);
 const rank:Record<string,number>={disabled:0,idle:1,review:2,paused:3,queued:4,retry:5,running:6};
 let running=0,queued=0,review=0,paused=0,nextAt=0,nextAgent:number|null=null;
 // meetings: who sits at the table, whose turn it is (positions in the public list, never content)
 const sessions:{n:number;members:number[];current:number;state:string;step:number;since:number}[]=[];
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
  if(!snap.assistant){const members=experts.map((a:any)=>c.agents.findIndex((x:any)=>x.id===a?.id)).filter((k:number)=>k>0&&k<agents.length);
   if(members.length)sessions.push({n:0,members,current:i,state,step:Number(j.step)||0,since:Math.max(Number(j.last_turn)||0,Number(j.created_at)||0),created:Number(j.created_at)||0} as any);}
 }
 // oldest first, numbered for the page; working sessions lead
 sessions.sort((a:any,b:any)=>a.created-b.created).forEach((x:any,k)=>{x.n=k+1;delete x.created;});
 sessions.sort((a,b)=>rank[b.state]-rank[a.state]);
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
   env.DB.prepare(`SELECT (SELECT COUNT(*) FROM zalo_messages WHERE received_at>=?) AS received,(SELECT COUNT(*) FROM zalo_outbox WHERE status='sent' AND message_id IS NOT NULL AND created_at>=?) AS replies,(SELECT COUNT(*) FROM zalo_outbox WHERE status='sent' AND created_at>=?) AS n,(SELECT MAX(created_at) FROM zalo_outbox WHERE status='sent') AS last,
    (SELECT AVG(d) FROM (SELECT MIN(o.created_at)-m.received_at AS d FROM zalo_outbox o JOIN zalo_messages m ON m.id=o.message_id WHERE m.received_at>=? GROUP BY m.id) WHERE d>=0 AND d<600000) AS avg`).bind(start,start,start,now-DAY).first<any>(),
   env.DB.prepare("SELECT MIN(received_at) AS since FROM zalo_messages WHERE status IN ('received','processing') AND received_at>?").bind(now-120000).first<any>(),
   env.DB.prepare(`SELECT CAST(((received_at+${VN})%${DAY})/3600000 AS INTEGER) AS hour,COUNT(*) AS n FROM zalo_messages WHERE received_at>=? GROUP BY hour`).bind(start).all<any>(),
  ]);
  agents.push({id:'zalo',name:c.office?.zaloName||'Zalo Bot',icon:'zalo',color:c.office?.zaloColor||'#0068ff',state:busy?.since?'running':'live24',completed:Number(z?.n)||0,last:Number(z?.last)||0,received:Number(z?.received)||0,replies:Number(z?.replies)||0,
   hours:zh.results.map((r:any)=>[Number(r.hour),Number(r.n)]),avg:Math.round((Number(z?.avg)||0)/1000),since:Number(busy?.since)||0,seat:10,room:'admin',live:true});
 }catch{/* Zalo tables not set up yet */}
 // continuous operation needs the Zalo desk even before Zalo is connected
 const simulate=c.simulate?.enabled===true?{level:String(c.simulate.level||'high'),...(Array.isArray(c.simulate.script)&&c.simulate.script.length?{script:c.simulate.script}:{})}:null;
 if(simulate&&!agents.some((a:any)=>a.id==='zalo'))agents.push({id:'zalo',name:c.office?.zaloName||'Zalo Bot',icon:'zalo',color:c.office?.zaloColor||'#0068ff',state:'live24',completed:0,last:0,received:0,replies:0,hours:[],avg:0,since:0,seat:10,room:'admin',live:true} as any);
 const top=agents.filter((a:any)=>a.completed).map((a:any)=>({name:a.name,color:a.color,n:a.completed})).sort((a:any,b:any)=>b.n-a.n).slice(0,4);
 // the wall board: how far the running session is, today against the last six days, approvals, Zalo
 // replies, and how much of today's work the admin room did
 const run=sessions.find(x=>x.state==='running')||sessions[0],runSnap=run?jobs.results.map((j:any)=>{try{return JSON.parse(j.snapshot);}catch{return null;}}):[];
 const progress=run?(()=>{const snap=runSnap.find((x:any)=>x&&!x.assistant&&Array.isArray(x.agents));const total=snap?(snap.agents.length-1)*(Number(snap.rounds)||1)+1:run.members.length+1;return Math.min(100,Math.round(run.step/Math.max(1,total)*100));})():0;
 const week=series.slice(0,6).reduce((a,b)=>a+b,0)/6,za=agents.find((a:any)=>a.id==='zalo') as any;
 const adminTurns=turns.results.filter((t:any)=>Number(t.day)===today&&c.agents.find((a:any)=>a.id===t.agent_id)?.room==='admin').reduce((n:number,t:any)=>n+Number(t.n),0);
 const board={progress,efficiency:week?Math.min(100,Math.round(completed/week*100)):completed?100:0,quality:(dec.approved||0)+(dec.rejected||0)+(dec.revision||0)?Math.round((dec.approved||0)/((dec.approved||0)+(dec.rejected||0)+(dec.revision||0))*100):0,
  support:za?.received?Math.min(100,Math.round(za.replies/za.received*100)):0,internal:completed?Math.round(adminTurns/completed*100):0};
 const rooms=(c.rooms||[]).map((r:any)=>({id:r.id,name:String(r.name||'')}));
 const handovers=recentTurns.results.map((t:any)=>({agent:c.agents.findIndex((a:any)=>a.id===t.agent_id),at:Number(t.created_at)})).filter((x:any)=>x.agent>=0&&x.agent<12);
 const office={title:c.office?.title||'Faciup Live',subtitle:c.office?.subtitle||'Văn phòng vận hành của đội AI'};
 return {enabled,simulate,rooms,office,board,sessions:enabled?sessions.slice(0,6):[],handovers,agents,running:enabled?running:0,queued,review,paused,completed,lastActivity,polledAt:now,next:enabled&&nextAgent!==null?{agent:nextAgent,at:nextAt||0}:null,
  kpi:{series,today:completed,yesterday:series[5],avgToday:avgOf(today),avgYesterday:avgOf(today-1),approved:dec.approved||0,decided:(dec.approved||0)+(dec.rejected||0)+(dec.revision||0),top}};
}
