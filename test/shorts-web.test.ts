import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { defaultConfig } from '../web/src/settings.ts';
import { createInk, inkRunner, inkUser } from '../web/src/ink.ts';

test('Shorts uses the existing quota/ownership queue without Pixabay; older machines cannot claim it', async () => {
  const dir=mkdtempSync(join(tmpdir(),'shorts-web-'));
  try {
    const DB=database(join(dir,'db.sqlite'));
    const env:any={DB,RUNNER_TOKEN:'r'.repeat(32),DAILY_RENDERS:'5',BUCKET:{async head(){return null;}}};env.config=defaultConfig(env);
    await DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('ink:voicechecks',?,1)").bind(JSON.stringify({'microsoft:vi-VN-HoaiMyNeural':{ok:true,at:Date.now()}})).run();
    const pending:Promise<any>[]=[];
    const rc:any={userId:null,quiet:false,log(){},wait(p:Promise<any>){pending.push(p);}};
    const user:any={id:'shorts-user',email:'viewer@example.com'};
    const id=await createInk(env,rc,user,{format:'shorts3d',topic:'Bắt đầu từ những việc nhỏ',seconds:30,browser:true,rid:'shorts-web-123456'});
    const j:any=await DB.prepare('SELECT * FROM ink_jobs WHERE id=?').bind(id).first();
    assert.equal(j.user_id,user.id);assert.equal(JSON.parse(j.input).format,'shorts3d');assert.equal(JSON.parse(j.input).browser,false);
    assert.equal(await createInk(env,rc,user,{format:'shorts3d',topic:'Bắt đầu từ những việc nhỏ',seconds:30,rid:'shorts-web-123456'}),id);
    await assert.rejects(()=>inkUser(new Request('https://test/api/ink/jobs/'+id),env,rc,{id:'someone-else',email:'other@example.com'} as any,'/api/ink/jobs/'+id),/tìm thấy/);
    await assert.rejects(()=>createInk(env,rc,user,{format:'shorts3d',topic:'Test',seconds:180}),/2 phút|tối đa/);
    const req=(cap=false)=>new Request('https://test/api/ink-runner/claim',{method:'POST',headers:{authorization:'Bearer '+env.RUNNER_TOKEN,'content-type':'application/json'},body:JSON.stringify({runner:'test',kind:'github',shorts3d:cap})});
    assert.equal((await (await inkRunner(req(),env,'claim',rc)).json()).job,null);
    const job:any=(await (await inkRunner(req(true),env,'claim',rc)).json()).job;
    assert.equal(job.id,id);assert.equal(job.input.format,'shorts3d');
    assert.equal(job.config.env.PIXABAY_API_KEY,undefined);
    await inkRunner(new Request('https://test',{method:'POST',headers:{authorization:'Bearer '+env.RUNNER_TOKEN,'content-type':'application/json','x-nv-lease':job.lease},body:JSON.stringify({error:'test failure'})}),env,'jobs/'+id+'/fail',rc);
    assert.equal((await DB.prepare('SELECT state FROM ink_ledger WHERE job_id=?').bind(id).first<any>()).state,'refunded');
    const longId='b'.repeat(24),now=Date.now();
    await DB.prepare("INSERT INTO ink_jobs(id,user_id,title,input,stage,status,created_at,updated_at) VALUES(?,?,'Two minutes',?,'plan','queued',?,?)").bind(longId,user.id,JSON.stringify({format:'shorts3d',seconds:120,voice:'hoaimy'}),now,now).run();
    assert.equal((await (await inkRunner(req(true),env,'claim',rc)).json()).job,null,'old 90-second machines must leave 120-second jobs alone');
    const newReq=new Request('https://test',{method:'POST',headers:{authorization:'Bearer '+env.RUNNER_TOKEN,'content-type':'application/json'},body:JSON.stringify({runner:'new',kind:'github',shorts3d:true,shortsMaxSeconds:120})});
    assert.equal((await (await inkRunner(newReq,env,'claim',rc)).json()).job.id,longId);
    await assert.rejects(()=>inkRunner(new Request('https://test',{method:'POST'}),env,'claim',rc),/quyền/);
    await Promise.allSettled(pending);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
