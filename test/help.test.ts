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
 for(const q of ['tìm prompt','tìm promt','cho mình xem danh sách prompt','Prompt Hunter'])assert.deepEqual((await promptKnowledge(env,q,[])).map(p=>p.id),['public'],q);
 await env.DB.prepare("UPDATE hunter_prompts SET status='rejected' WHERE id='public'").run();
 assert.equal((await promptKnowledge(env,'bài giảng',[])).length,0);
 await env.DB.prepare("UPDATE hunter_prompts SET status='published' WHERE id='private'").run();
 rows=await promptKnowledge(env,'giúp tôi', [{role:'user',text:'bài giảng'}]);assert.equal(rows[0].id,'private');
 await env.DB.prepare("DELETE FROM hunter_prompts WHERE id='private'").run();assert.equal((await promptKnowledge(env,'bài giảng',[])).length,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('generic prompt chat reads live publication state, survives unavailable AI and corrects false empty-library answers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'help-live-')),original=globalThis.fetch;
 try{
 const {defaultConfig}=await import('../web/src/settings.ts');
 const env:any={DB:database(join(dir,'db.sqlite'))};env.config=defaultConfig(env);env.config.site.helpBot.enabled=true;
 const ask=async(text:string)=>await (await helpChat(new Request('https://test/api/help/chat',{method:'POST',body:JSON.stringify({text})}),env,{ip:'test',visitor:'live',log(){}} as any,null)).json() as any;
 await env.DB.prepare("INSERT INTO hunter_prompts(id,user_id,author,title,content,category,status,created_at,updated_at) VALUES('live','u','Author','Ảnh sản phẩm','Tạo ảnh sản phẩm','Hình ảnh','published',1,1)").run();
 let out=await ask('tìm promt');assert.equal(out.ai,false);assert.equal(out.sources.length,1);assert.match(out.reply,/Ảnh sản phẩm/);
 env.OPENAI_API_KEY='fixture';env.OPENAI_TEXT_MODEL='fixture';env.config.models.order=['openai'];
 let sys='';globalThis.fetch=async(_url,opts:any)=>{sys=JSON.parse(opts.body).messages[0].content;return Response.json({choices:[{message:{content:JSON.stringify({reply:'Hiện không có dữ liệu prompt sẵn có.',intent:'chat',sourceIds:[]})}}]});};
 out=await ask('tìm prompt');assert.match(sys,/"published":1/);assert.match(out.reply,/Ảnh sản phẩm/);assert.equal(out.sources.length,1);
 await env.DB.prepare("UPDATE hunter_prompts SET title='Tên vừa cập nhật',updated_at=2 WHERE id='live'").run();
 out=await ask('tìm prompt');assert.match(out.reply,/Tên vừa cập nhật/);assert.equal(out.sources[0].title,'Tên vừa cập nhật');
 env.OPENAI_API_KEY=undefined;
 out=await ask('tìm prompt thiên văn');assert.equal(out.sources.length,0);assert.match(out.reply,/1 prompt đã công khai/);assert.match(out.reply,/chưa tìm thấy bài khớp/);
 await env.DB.prepare("UPDATE hunter_prompts SET status='pending' WHERE id='live'").run();
 out=await ask('tìm prompt');assert.equal(out.sources.length,0);assert.match(out.reply,/chưa có bài được công khai/);
 }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
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
