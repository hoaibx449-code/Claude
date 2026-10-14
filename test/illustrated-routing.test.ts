import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {runner} from '../web/src/worker.ts';
import {claimWhiteboard} from '../addons/faciup-whiteboard/web.ts';
import {claimIllustrated,voiceCache,assertIllustrated} from '../addons/faciup-illustrated/web.ts';
test('three renderers cannot take each others jobs; narration survives retry and rejects obsolete leases',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'illustrated-'));try{
  const DB=database(join(dir,'test.db')),RUNNER_TOKEN='x'.repeat(32),files=new Map();
  const env:any={DB,RUNNER_TOKEN,BUCKET:{async put(k:any,b:any){files.set(k,new Uint8Array(await new Response(b).arrayBuffer()));},async get(k:any){return files.has(k)?{body:files.get(k)}:null;}}};
  await DB.prepare("INSERT INTO users(id,email,created_at) VALUES('u','test@example.com',0)").run();
  await DB.prepare("INSERT INTO projects(id,user_id,title,spec,created_at,updated_at) VALUES('p','u','Test','{}',0,0)").run();
  for(const [id,look] of [['1'.repeat(24),'illustrated'],['2'.repeat(24),'whiteboard'],['3'.repeat(24),'act']])await DB.prepare("INSERT INTO jobs(id,project_id,user_id,status,spec,created_at) VALUES(?,'p','u','queued',?,0)").bind(id,JSON.stringify({look,voice:{voiceId:'original'},scenes:[{lines:['Lời kể được lưu']}]})).run();
  const req=()=>new Request('https://test/api/claim',{method:'POST',headers:{authorization:`Bearer ${RUNNER_TOKEN}`,'content-type':'application/json'},body:'{}'}),rc:any={log(){},wait(){}};
  assert.equal((await(await runner(req(),env,'claim',rc)).json() as any).job.spec.look,'act');
  assert.equal((await(await claimWhiteboard(req(),env,rc)).json() as any).job.spec.look,'whiteboard');
  const job=(await(await claimIllustrated(req(),env,rc)).json() as any).job;assert.equal(job.spec.look,'illustrated');
  assert.equal((await(await claimIllustrated(req(),env,rc)).json() as any).job,null);
  const vr=(method:string,lease=job.lease)=>new Request('https://test/voice',{method,headers:{authorization:`Bearer ${RUNNER_TOKEN}`,'x-nv-lease':lease},...(method==='PUT'?{body:'VOICE_ORIGINAL'}:{})});
  await voiceCache(vr('PUT'),env,job.id,0);assert.equal(await(await voiceCache(vr('GET'),env,job.id,0)).text(),'VOICE_ORIGINAL');
  await assert.rejects(()=>voiceCache(vr('PUT','lease-expired'),env,job.id,0),/hết hạn/);
  await assert.rejects(()=>claimIllustrated(new Request('https://test',{method:'POST'}),env,rc),/quyền/);
  assert.throws(()=>assertIllustrated({scenes:[{illustrated:{layers:[{prompt:'valid'}]},panels:[]}]}),/Cảnh 1/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
