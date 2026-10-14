import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from './support/sqlite.ts';
import {runner} from '../web/src/worker.ts';
import {claimWhiteboard,assertWhiteboard,voiceCache} from '../addons/faciup-whiteboard/web.ts';
import {composeLook} from '../web/src/compose.ts';
import {cleanSpec} from '../web/src/spec.ts';
test('old machine and additive Whiteboard machine can only claim their own format',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wb-routing-'));try{
  const DB=database(join(dir,'test.db')),RUNNER_TOKEN='a'.repeat(32),env:any={DB,RUNNER_TOKEN};
  await DB.prepare("INSERT INTO users(id,email,created_at) VALUES('u','test@example.com',0)").run();
  await DB.prepare("INSERT INTO projects(id,user_id,title,spec,created_at,updated_at) VALUES('p','u','Test','{}',0,0)").run();
  for(const [id,look,at] of [['1'.repeat(24),'whiteboard',1],['2'.repeat(24),'act',2]])await DB.prepare("INSERT INTO jobs(id,project_id,user_id,status,spec,created_at) VALUES(?,'p','u','queued',?,?)").bind(id,JSON.stringify({look,scenes:[]}),at).run();
  const req=()=>new Request('https://test/api/runner/claim',{method:'POST',headers:{authorization:`Bearer ${RUNNER_TOKEN}`,'content-type':'application/json'},body:'{}'});
  const rc:any={log(){},wait(){}};
  const old=await (await runner(req(),env,'claim',rc)).json() as any;
  assert.equal(old.job.spec.look,'act');
  const wb=await (await claimWhiteboard(req(),env,rc)).json() as any;assert.equal(wb.job.spec.look,'whiteboard');
  assert.equal((await (await claimWhiteboard(req(),env,rc)).json() as any).job,null);
  await assert.rejects(()=>claimWhiteboard(new Request('https://test',{method:'POST'}),env,rc),/quyền/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('saved voice is reused only for the same user, script and voice settings; expired lease rejected',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'wb-cache-'));try{
  const DB=database(join(dir,'test.db')),RUNNER_TOKEN='b'.repeat(32),files=new Map<string,Uint8Array>();
  const env:any={DB,RUNNER_TOKEN,BUCKET:{async put(k:string,data:any){files.set(k,new Uint8Array(await new Response(data).arrayBuffer()));},async get(k:string){return files.has(k)?{body:files.get(k)}:null;}}};
  await DB.prepare("INSERT INTO users(id,email,created_at) VALUES('u','u@example.com',0)").run();
  await DB.prepare("INSERT INTO projects(id,user_id,title,spec,created_at,updated_at) VALUES('p','u','Test','{}',0,0)").run();
  const id='3'.repeat(24),lease='lease-'+ '1'.repeat(32),spec={look:'whiteboard',voice:{voiceId:'tri-dung',speed:1},scenes:[{lines:['Lời gốc']}]};
  await DB.prepare("INSERT INTO jobs(id,project_id,user_id,status,spec,created_at,runner) VALUES(?,'p','u','running',?,0,?)").bind(id,JSON.stringify(spec),lease).run();
  const req=(method:string,token=lease)=>new Request('https://test',{method,headers:{authorization:`Bearer ${RUNNER_TOKEN}`,'x-nv-lease':token},...(method==='PUT'?{body:'REAL_AUDIO_BYTES'}:{})});
  await voiceCache(req('PUT'),env,id,0);assert.equal(await(await voiceCache(req('GET'),env,id,0)).text(),'REAL_AUDIO_BYTES');
  spec.voice.speed=1.2;await DB.prepare('UPDATE jobs SET spec=? WHERE id=?').bind(JSON.stringify(spec),id).run();
  assert.equal((await voiceCache(req('GET'),env,id,0)).status,404);
  await assert.rejects(()=>voiceCache(req('PUT','lease-wrong'),env,id,0),/hết hạn/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Whiteboard generated and edited data survives validation; unsupported drawings fail before queue',()=>{
 const c=composeLook({look:'whiteboard',scenes:[{lines:['Đọc sách và dành thời gian cho gia đình.']}]});
 const s=cleanSpec({...c,ratio:'9:16',subtitles:false},'u');assert.equal(s.look,'whiteboard');assert.equal(s.subtitles,false);assertWhiteboard(s);
 s.scenes[0].whiteboard.objects[0].label='Ý của tôi';
 assert.equal(cleanSpec(s,'u').scenes[0].whiteboard.objects[0].label,'Ý của tôi');
 assert.throws(()=>assertWhiteboard({scenes:[{lines:['Chưa có hình']}]}),/Cảnh 1/);
});
