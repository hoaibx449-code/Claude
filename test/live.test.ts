import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig} from '../web/src/settings.ts';import {liveOverview} from '../web/src/live.ts';import {pageSitemap,pageMetadata,publicNavigation} from '../web/src/page-routes.ts';
test('Faciup Live reports only published counts and public feature flags',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'faciup-live-'));try{
  const DB=database(join(dir,'db.sqlite')),config=defaultConfig({});config.site.helpBot.enabled=true;config.zalo.enabled=true;config.visibility['feature:zalo']='hidden';
  await DB.prepare("INSERT INTO hunter_prompts(id,user_id,author,title,description,content,category,tool,status,created_at,updated_at) VALUES('published','secret-user','Author','title','','private-prompt','','','published',1,1),('draft','secret-user','Author','hidden','','private-draft','','','pending',1,1)").run();
  await DB.prepare("INSERT INTO solutions(id,slug,title,summary,content,category,status,pricing,instructions,created_at,updated_at) VALUES('solution','public','public','','public','','published','paid','secret-instructions',1,1),('draft-solution','draft','draft','','private-content','','draft','free','private-file',1,1)").run();
  const result=await liveOverview({DB,OPENAI_API_KEY:'secret-key'} as any,config);
  assert.equal(result.counts.prompts,1);assert.equal(result.counts.solutions,1);assert.equal(result.features.zalo,false);assert.equal(result.features.assistant,true);
  assert.deepEqual(Object.keys(result).sort(),['counts','features','timezone','updatedAt']);assert.doesNotMatch(JSON.stringify(result),/secret|private|token|chat|user/);
  assert.ok(pageSitemap('https://test').includes('/faciup-live'));assert.equal(pageMetadata('/faciup-live','FACIUP','https://test').noindex,false);
  config.labels.navigation['faciup-live']='Vận hành AI';assert.match(publicNavigation(config),/Vận hành AI/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
