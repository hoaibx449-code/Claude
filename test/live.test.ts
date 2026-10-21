import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';import {liveOverview,liveRuntime} from '../web/src/live.ts';import {pageSitemap,pageMetadata,publicNavigation} from '../web/src/page-routes.ts';
test('Faciup Live reports only published counts and public feature flags',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'faciup-live-'));try{
  const DB=database(join(dir,'db.sqlite')),config=defaultConfig({});config.site.helpBot.enabled=true;config.zalo.enabled=true;config.visibility['feature:zalo']='hidden';
  await DB.prepare("INSERT INTO hunter_prompts(id,user_id,author,title,description,content,category,tool,status,created_at,updated_at) VALUES('published','secret-user','Author','title','','private-prompt','','','published',1,1),('draft','secret-user','Author','hidden','','private-draft','','','pending',1,1)").run();
  await DB.prepare("INSERT INTO solutions(id,slug,title,summary,content,category,status,pricing,instructions,created_at,updated_at) VALUES('solution','public','public','','public','','published','paid','secret-instructions',1,1),('draft-solution','draft','draft','','private-content','','draft','free','private-file',1,1)").run();
  const result=await liveOverview({DB,OPENAI_API_KEY:'secret-key'} as any,config);
  assert.equal(result.counts.prompts,1);assert.equal(result.counts.solutions,1);assert.equal(result.features.zalo,false);assert.equal(result.features.assistant,true);
  assert.deepEqual(Object.keys(result).sort(),['counts','features','runtime','timezone','updatedAt']);assert.doesNotMatch(JSON.stringify(result),/secret|private|token|chat|user/);
  assert.ok(pageSitemap('https://test').includes('/faciup-live'));assert.equal(pageMetadata('/faciup-live','FACIUP','https://test').noindex,false);
  config.labels.navigation['faciup-live']='Vận hành AI';assert.match(publicNavigation(config),/Vận hành AI/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Live motion state follows durable leases, completed turns and admin review without private content',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'live-runtime-'));try{
  const DB=database(join(dir,'db.sqlite')),now=Date.UTC(2026,9,22,5),agents=[{id:'editor',name:'Private coordinator',prompt:'secret instructions',models:[{provider:'ollama',model:'private-model'}]},{id:'writer',name:'Private writer',prompt:'private prompt',models:[]}];
  const snapshot=JSON.stringify({agents,rounds:1});
  await DB.prepare('INSERT INTO council_settings VALUES(1,?)').bind(JSON.stringify({enabled:true,agents})).run();
  await DB.prepare("INSERT INTO council_jobs(id,user_id,brief,snapshot,status,lease_until,created_at,updated_at) VALUES('job','secret-user','secret-brief',?,'running',?,?,?)").bind(snapshot,now+30000,now,now).run();
  let r=await liveRuntime({DB} as any,now);assert.equal(r.running,1);assert.equal(r.agents[1].state,'running');assert.equal(r.agents[0].state,'idle');assert.doesNotMatch(JSON.stringify(r),/secret|Private|private-model|instructions/);
  r=await liveRuntime({DB} as any,now+31000);assert.equal(r.running,0);assert.equal(r.agents[1].state,'queued');
  await DB.prepare("UPDATE council_jobs SET next_at=? WHERE id='job'").bind(now+120000).run();r=await liveRuntime({DB} as any,now);assert.equal(r.agents[1].state,'retry');assert.equal(r.running,0);assert.deepEqual(r.next,{agent:1,at:now+120000});
  await DB.prepare("UPDATE council_jobs SET status='pending',step=2 WHERE id='job'").run();
  await DB.prepare("INSERT INTO council_turns VALUES('job',0,'writer','ollama','private-model','private result',?)").bind(now).run();
  r=await liveRuntime({DB} as any,now);assert.equal(r.review,1);assert.equal(r.agents[0].state,'review');assert.equal(r.completed,1);assert.equal(r.agents[1].completed,1);assert.deepEqual(r.agents[1].hours,[[12,1]]);assert.equal(r.agents[1].last,now);assert.doesNotMatch(JSON.stringify(r),/private|secret/);
  await DB.prepare('UPDATE council_settings SET config=?').bind(JSON.stringify({enabled:false,agents})).run();r=await liveRuntime({DB} as any,now);assert.equal(r.running,0);assert.ok(r.agents.every(a=>a.state==='disabled'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Faciup Live: turn times, KPIs, public looks and the 24/7 Zalo assistant',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'faciup-live-kpi-'));try{
  const DB=database(join(dir,'db.sqlite')),now=Date.UTC(2026,9,22,5),config=defaultConfig({});config.zalo.enabled=true;
  const agents=[{id:'editor',name:'Secret boss',prompt:'p',models:[]},{id:'research',name:'R',prompt:'p',models:[]},{id:'x1',name:'Private name',prompt:'p',models:[],live:{name:'Săn tin',color:'#ea580c',icon:'news'}}];
  await DB.prepare('INSERT INTO council_settings VALUES(1,?)').bind(JSON.stringify({enabled:true,agents})).run();
  for(const [step,agent,t] of [[0,'research',now-120000],[1,'x1',now-60000],[2,'editor',now-30000]] as const)await DB.prepare("INSERT INTO council_turns VALUES('j',?,?,'p','m','private text',?)").bind(step,agent,t).run();
  await DB.prepare("INSERT INTO council_jobs(id,user_id,brief,snapshot,status,created_at,updated_at) VALUES('d1','u','b','{}','approved',?,?),('d2','u','b','{}','rejected',?,?)").bind(now,now,now,now).run();
  await DB.prepare("INSERT INTO zalo_messages(id,chat_id,text,status,received_at,updated_at) VALUES('m1','c','hi','done',?,?)").bind(now-10000,now).run();
  await DB.prepare("INSERT INTO zalo_outbox(id,chat_id,message_id,text,status,created_at,updated_at) VALUES('o1','c','m1','chào','sent',?,?)").bind(now-7000,now).run();
  const r:any=await liveRuntime({DB} as any,now,config);
  assert.equal(r.agents[2].name,'Săn tin');assert.equal(r.agents[2].color,'#ea580c');assert.equal(r.agents[2].icon,'news');assert.equal(r.agents[2].avg,60);
  assert.equal(r.kpi.today,3);assert.equal(r.kpi.series[6],3);assert.equal(r.kpi.avgToday,45);assert.equal(r.kpi.approved,1);assert.equal(r.kpi.decided,2);
  const z=r.agents.find((a:any)=>a.id==='zalo');assert.equal(z.state,'live24');assert.equal(z.avg,3);assert.equal(z.completed,1);
  assert.doesNotMatch(JSON.stringify(r),/Secret|Private|private|prompt/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
