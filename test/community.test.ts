import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database } from './support/sqlite.ts';
import { communityPublic } from '../web/src/media.ts';
import { defaultConfig } from '../web/src/settings.ts';

test('community filters before the page limit, preserves top sorting and excludes moderated videos', async () => {
 const dir=mkdtempSync(join(tmpdir(),'gallery-'));
 try {
  const DB=database(join(dir,'db.sqlite')), env:any={DB,config:defaultConfig({} as any)};
  for(let i=0;i<26;i++) await DB.prepare("INSERT INTO community(job_id,user_id,project_id,title,ratio,created_at,likes,hidden) VALUES(?,'u','p','Test',?,?,?,?)").bind(String(i), i<24?'9:16':'16:9', 1000-i, i, i===25?1:0).run();
  await DB.prepare("INSERT INTO community(job_id,user_id,project_id,title,ratio,created_at) VALUES('legacy','u','p','Old',NULL,900)").run();
  const list=async(q:string)=>{
   const res=await communityPublic(new Request('https://test/api/community?'+q),env,{} as any,'/api/community',null);
   return (await res!.json() as any).videos;
  };
  assert.deepEqual((await list('ratio=16%3A9')).map((v:any)=>v.job_id),['24']);
  const vertical=await list('ratio=9%3A16&sort=top');
  assert.equal(vertical[0].job_id,'23');assert.ok(vertical.every((v:any)=>v.ratio!=='16:9'));
  assert.ok((await list('ratio=9%3A16&before=901')).some((v:any)=>v.job_id==='legacy'));
  assert.equal((await list('')).length,24);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
