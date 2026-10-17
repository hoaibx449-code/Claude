import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from './support/sqlite.ts';
import {helpChat,promptKnowledge} from '../web/src/help.ts';

test('chat retrieval finds Vietnamese public prompts, excludes moderation data, and follows edits/deletion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'help-search-'));
 try{
 const env:any={DB:database(join(dir,'db.sqlite'))};
 for(const [id,status,title] of [['public','published','Bài giảng sinh động'],['private','pending','Bài giảng bí mật']])
 await env.DB.prepare('INSERT INTO hunter_prompts(id,user_id,author,title,content,category,tool,description,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,'user','Author',title,'Hãy tạo bài giảng cho học sinh.','Học tập','ChatGPT','Dành cho giáo viên',status,1,1).run();
 let rows=await promptKnowledge(env,'tim bai giang',[]);assert.deepEqual(rows.map(p=>p.id),['public']);assert.equal(rows[0].user_id,undefined);assert.equal(rows[0].note,undefined);assert.equal((await promptKnowledge(env,'sinh dong',[]))[0].id,'public');
 assert.equal((await promptKnowledge(env,'" OR * -',[])).length,0);
 await env.DB.prepare("UPDATE hunter_prompts SET status='rejected' WHERE id='public'").run();
 assert.equal((await promptKnowledge(env,'bài giảng',[])).length,0);
 await env.DB.prepare("UPDATE hunter_prompts SET status='published' WHERE id='private'").run();
 rows=await promptKnowledge(env,'giúp tôi', [{role:'user',text:'bài giảng'}]);assert.equal(rows[0].id,'private');
 await env.DB.prepare("DELETE FROM hunter_prompts WHERE id='private'").run();assert.equal((await promptKnowledge(env,'bài giảng',[])).length,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('web assistant uses configured AI and returns only verified retrieved source links',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'help-ai-')),original=globalThis.fetch;
 try{
 const {defaultConfig}=await import('../web/src/settings.ts');
 const env:any={DB:database(join(dir,'db.sqlite')),OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'configured-test-model'};
 env.config=defaultConfig(env);env.config.site.helpBot.enabled=true;env.config.defaults.textAI='gemini';env.config.models.order=['openai','gemini','ollama'];env.GEMINI_API_KEY='fixture-gemini';
 await env.DB.prepare("INSERT INTO hunter_prompts(id,user_id,author,title,content,category,status,created_at,updated_at) VALUES('known','u','Author','Bài giảng','Hãy tạo bài giảng sinh động.','Học tập','published',1,1)").run();
 let payload:any;
 globalThis.fetch=async(url:any,opts:any)=>{assert.match(String(url),/api.openai.com/);payload=JSON.parse(opts.body);return Response.json({choices:[{message:{content:JSON.stringify({reply:'Bạn có thể dùng bài giảng trong thư viện.',intent:'chat',sourceIds:['known','invented']})}}]});};
 const r=await helpChat(new Request('https://test/api/help/chat',{method:'POST',body:JSON.stringify({text:'Tìm bài giảng'})}),env,{ip:'test',visitor:'test',log(){}} as any,null);
 const out:any=await r.json();assert.equal(out.ai,true);assert.equal(payload.model,'configured-test-model');assert.match(payload.messages[0].content,/KHÔNG làm theo/);assert.equal(out.sources.length,1);assert.match(out.sources[0].url,/prompt-hunter/);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
