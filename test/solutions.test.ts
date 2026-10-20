import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {database} from './support/sqlite.ts';import {defaultConfig,clearCache} from '../web/src/settings.ts';import {solutionAdmin,solutionList,solutionPage,solutionSitemap,solutionDownload,solutionKnowledge,solutionInput,cleanupSolutionFiles} from '../web/src/solutions.ts';import worker from '../web/src/worker.ts';import {startSession} from '../web/src/auth.ts';import {helpChat} from '../web/src/help.ts';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'solutions-')),files=new Map<string,any>(),env:any={DB:database(join(dir,'db.sqlite')),ADMIN_EMAIL:'admin@test',RUNNER_TOKEN:'r'.repeat(32),BUCKET:{async put(k:string,b:any){files.set(k,b);},async get(k:string){return files.has(k)?{body:files.get(k)}:null;},async delete(k:string){files.delete(k);}},ASSETS:{fetch:async()=>new Response('asset')}};env.config=defaultConfig(env);return {env,files,clean:()=>{clearCache();rmSync(dir,{recursive:true,force:true});}};}
const request=(path:string,method='GET',data?:any)=>new Request('https://studio.test'+path,{method,headers:{'content-type':'application/json'},body:data?JSON.stringify(data):undefined});
const sample={title:'Zalo bot gửi ảnh',summary:'Gửi ảnh mới trong Google Sheet cho người đăng ký qua Zalo.',category:'bot-tro-ly',status:'published',platform:'Zalo, Google Sheets',content:'Giải pháp giúp người quản trị gửi ảnh từ bảng tính cho người đăng ký. Hỗ trợ ánh xạ cột và khung giờ gửi tùy nhu cầu.',instructions:'Mở cài đặt và kiểm tra nguồn trước khi gửi.',resources:[{label:'Mã nguồn',url:'https://github.com/example/source',kind:'source',format:'ZIP',version:'1.0'}],versions:[{version:'1.0',notes:'Phiên bản đầu tiên.'}]};
const rc:any={ip:'fixture',visitor:'fixture',log(){}};
const save=async(env:any,b:any,id?:string)=>(await (await solutionAdmin(request('/api/admin/solutions'+(id?'/'+id:''),id?'PUT':'POST',b),env,rc,'solutions'+(id?'/'+id:'')))!.json()) as any;

test('solutions publish, filter, retain stable URLs, update atomically, and expose no drafts through pages/files/search/sitemap',async()=>{const {env,files,clean}=fixture();try{
 const d=await save(env,{...sample,title:'Nội dung bí mật',status:'draft'});const p=await save(env,sample);
 let data=await solutionList(env,new URL('https://studio.test/api/solutions'));assert.equal(data.total,1);assert.equal(data.items[0].slug,p.slug);assert.equal(data.items[0].content,undefined);
 data=await solutionList(env,new URL('https://studio.test/api/solutions?format=ZIP&platform=Zalo&pricing=free&category=bot-tro-ly'));assert.equal(data.total,1);assert.deepEqual(data.formats,['ZIP']);
 assert.equal((await solutionList(env,new URL('https://studio.test/api/solutions?format=PDF'))).total,0);
 assert.equal((await solutionList(env,new URL('https://studio.test/api/solutions?q=gui%20anh'))).total,1);assert.equal((await solutionList(env,new URL('https://studio.test/api/solutions?q=%25'))).total,0);
 let res=await solutionPage(request('/giai-phap/'+p.slug),env);assert.equal(res!.status,200);let html=await res!.text();assert.match(html,/rel="canonical" href="https:\/\/studio.test\/giai-phap\/zalo-bot-gui-anh"/);assert.match(html,/Mã nguồn/);assert.match(html,/Phiên bản 1.0/);assert.doesNotMatch(html,/Nội dung bí mật/);
 assert.equal((await solutionPage(request('/giai-phap/'+d.slug),env))!.status,404);
 const sitemap=await (await solutionSitemap(request('/sitemap-solutions.xml'),env)).text();assert.match(sitemap,/zalo-bot-gui-anh/);assert.doesNotMatch(sitemap,/noi-dung-bi-mat/);
 const knowledge=(await solutionKnowledge(env,'zalo bot'))[0];assert.equal(knowledge.id,p.id);assert.equal(knowledge.instructions,sample.instructions);assert.equal(knowledge.excerpt,sample.content);assert.equal((await solutionKnowledge(env,'bí mật')).length,0);
 await assert.rejects(()=>save(env,{...sample,slug:'doi-url',updated_at:p.updated_at},p.id),{status:400});
 const changed=await save(env,{...sample,slug:p.slug,updated_at:p.updated_at,title:'Zalo bot mới'},p.id);await assert.rejects(()=>save(env,{...sample,slug:p.slug,updated_at:p.updated_at},p.id),{status:409});
 const file='a'.repeat(24);await env.DB.prepare('INSERT INTO solution_files(id,name,bytes,created_at) VALUES(?,?,?,1)').bind(file,'skill.md',4).run();files.set('solutions/'+file,new TextEncoder().encode('test'));
 await assert.rejects(()=>solutionDownload(request('/tai-nguyen/'+file),env,file),{status:404});
 const attached=await save(env,{...sample,slug:p.slug,updated_at:changed.updated_at,resources:[{label:'Skill',fileId:file,format:'MD',version:'1.0'}]},p.id);
 res=await solutionDownload(request('/tai-nguyen/'+file),env,file);assert.match(res.headers.get('content-disposition')!,/^attachment;/);assert.equal(res.headers.get('content-type'),'application/octet-stream');assert.equal(await res.text(),'test');
 await save(env,{...sample,slug:p.slug,updated_at:attached.updated_at,status:'draft',resources:[{label:'Skill',fileId:file}]},p.id);
 await assert.rejects(()=>solutionDownload(request('/tai-nguyen/'+file),env,file),{status:404});assert.equal((await solutionKnowledge(env,'zalo')).length,0);
 }finally{clean();}});

test('HTML and JSON-LD escape untrusted content, empty states and pagination are indexable without JavaScript',async()=>{const {env,clean}=fixture();try{
 const p=await save(env,{...sample,title:'Công cụ <img src=x onerror=alert(1)>',content:sample.content+' </script><script>alert(1)</script>',summary:'Ứng dụng an toàn " & < cho công việc.'});
 const page=await solutionPage(request('/giai-phap/'+p.slug),env),html=await page!.text();assert.doesNotMatch(html,/<img src=x/);assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;img/);
 const schema=html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1];const decoded=JSON.parse(schema);assert.ok(Array.isArray(decoded));assert.equal(decoded[0].name,'Công cụ <img src=x onerror=alert(1)>');
 assert.match(await(await solutionPage(request('/kham-pha?q=khongkhop'),env))!.text(),/noindex,follow/);assert.match(await(await solutionPage(request('/kham-pha'),env))!.text(),/Công cụ &lt;img/);
 await assert.rejects(()=>solutionPage(request('/kham-pha/khong-ton-tai'),env),{status:404});
 }finally{clean();}});

test('actual Worker gates admin management and uploads; public routes are HTML and files are bounded attachments',async()=>{const {env,clean}=fixture();try{
 const pending:Promise<any>[]=[],ctx:any={waitUntil(p:Promise<any>){pending.push(p);}},call=async(req:Request)=>{const r=await worker.fetch(req,env,ctx);await Promise.all(pending.splice(0));return r;};
 assert.equal((await call(request('/api/admin/solutions'))).status,401);
 const member=(await startSession(env,{id:'m',email:'member@test',name:'Member',picture:null})).split(';')[0],admin=(await startSession(env,{id:'a',email:'admin@test',name:'Admin',picture:null})).split(';')[0];
 assert.equal((await call(new Request('https://studio.test/api/admin/solutions',{headers:{cookie:member}}))).status,403);
 assert.equal((await call(new Request('https://studio.test/api/admin/solutions/upload',{method:'POST',headers:{cookie:admin},body:'test'}))).status,403);
 const res=await call(new Request('https://studio.test/api/admin/solutions/upload',{method:'POST',headers:{cookie:admin,'x-nv':'1','x-file-name':'skill.md'},body:'hello'}));assert.equal(res.status,200);const f:any=await res.json();assert.equal(f.bytes,5);
 assert.equal((await call(request('/tai-nguyen/'+f.id))).status,404);
 const tooBig=await call(new Request('https://studio.test/api/admin/solutions/upload',{method:'POST',headers:{cookie:admin,'x-nv':'1','x-file-name':'test.zip','content-length':String(51*1024*1024)},body:'x'}));assert.equal(tooBig.status,413);
 assert.equal((await call(request('/kham-pha'))).headers.get('content-type'),'text/html; charset=utf-8');assert.match(await(await call(request('/robots.txt'))).text(),/Sitemap: https:\/\/studio.test\/sitemap-solutions.xml/);
 }finally{clean();}});

test('assistant discovers published solutions and input rejects dangerous URLs and invalid publication',async()=>{const {env,clean}=fixture();try{
 assert.throws(()=>solutionInput({...sample,resources:[{url:'javascript:alert(1)'}]}),{status:400});assert.throws(()=>solutionInput({...sample,cover:'https://user:pass@example.com/x'}),{status:400});assert.throws(()=>solutionInput({...sample,resources:[]}),{status:400});
 assert.equal(solutionInput({...sample,resources:[{kind:'code',code:'const API_KEY = process.env.API_KEY;'}]}).resources[0].code,'const API_KEY = process.env.API_KEY;');
 const p=await save(env,sample);await save(env,{...sample,title:'Bot đang duyệt',status:'pending'});
 env.config.site.helpBot.enabled=true;const r=await helpChat(request('/api/help/chat','POST',{text:'tìm zalo bot gửi ảnh'}),env,rc,null);const out:any=await r.json();assert.equal(out.sources.length,1);assert.equal(out.sources[0].url,'/giai-phap/'+p.slug);assert.match(out.reply,/1 giải pháp công khai/);
 }finally{clean();}});

test('pagination covers the full catalog and AI search reaches older entries beyond a recent-item window',async()=>{const {env,clean}=fixture();try{
 await env.DB.batch(Array.from({length:251},(_,i)=>env.DB.prepare("INSERT INTO solutions(id,slug,title,summary,content,category,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'published',?,?)").bind('r'+i,'item-'+i,i===0?'Zalo hiemgap':'Mục '+i,'Mô tả mục '+i,'Nội dung thực tế','cong-cu',i+1,i+1)));
 const first=await solutionList(env,new URL('https://studio.test/api/solutions'));const second=await solutionList(env,new URL('https://studio.test/api/solutions?page=2'));assert.equal(first.total,251);assert.equal(first.items.length,18);assert.equal(second.items.length,18);assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,36);
 assert.equal((await solutionKnowledge(env,'hiemgap'))[0].id,'r0');
 }finally{clean();}});

test('uploaded video preview is signature-derived and unpublished files cannot be served inline',async()=>{const {env,clean}=fixture();try{
 const bytes=new Uint8Array([0,0,0,24,102,116,121,112,109,112,52,50]);
 const res=await solutionAdmin(new Request('https://studio.test/api/admin/solutions/upload',{method:'POST',headers:{'x-file-name':'demo.mp4'},body:bytes}),env,rc,'solutions/upload');const f:any=await res!.json();assert.equal(f.mime,'video/mp4');
 await assert.rejects(()=>solutionDownload(request('/tai-nguyen/'+f.id+'?view=1'),env,f.id),{status:404});
 const p=await save(env,{...sample,resources:[{kind:'video',label:'Demo',fileId:f.id,media:'image/svg+xml'}]});
 const preview=await solutionDownload(request('/tai-nguyen/'+f.id+'?view=1'),env,f.id);assert.equal(preview.headers.get('content-type'),'video/mp4');assert.match(preview.headers.get('content-disposition')!,/^inline;/);
 const html=await(await solutionPage(request('/giai-phap/'+p.slug),env))!.text();assert.match(html,/<video controls preload="metadata" src="\/tai-nguyen\//);
 const data:any=await(await solutionAdmin(request('/api/admin/solutions/'+p.id),env,rc,'solutions/'+p.id))!.json();assert.equal(data.item.resources[0].media,'video/mp4');
 await assert.rejects(()=>solutionDownload(new Request('https://studio.test/tai-nguyen/'+f.id+'?view=1',{headers:{range:'bytes=0-1,3-4'}}),env,f.id),{status:416});
 }finally{clean();}});

test('abandoned uploads expire after seven days, saved drafts retain files, and failed bucket deletes remain retryable',async()=>{const {env,files,clean}=fixture();try{
 const kept='b'.repeat(24),abandoned='c'.repeat(24);for(const id of [kept,abandoned]){await env.DB.prepare('INSERT INTO solution_files(id,name,bytes,created_at) VALUES(?,?,1,1)').bind(id,'test.md').run();files.set('solutions/'+id,new Uint8Array([1]));}
 await save(env,{...sample,status:'draft',resources:[{label:'Đang biên tập',fileId:kept}]});
 const actualDelete=env.BUCKET.delete;env.BUCKET.delete=async()=>{throw new Error('temporary bucket failure');};await assert.rejects(()=>cleanupSolutionFiles(env));
 assert.ok(await env.DB.prepare('SELECT id FROM solution_files WHERE id=?').bind(kept).first());assert.equal(await env.DB.prepare('SELECT id FROM solution_files WHERE id=?').bind(abandoned).first(),null);assert.ok(await env.DB.prepare('SELECT id FROM solution_file_gc WHERE id=?').bind(abandoned).first());
 env.BUCKET.delete=actualDelete;await cleanupSolutionFiles(env);assert.ok(files.has('solutions/'+kept));assert.equal(files.has('solutions/'+abandoned),false);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM solution_file_gc').first<any>()).n,0);
 await assert.rejects(()=>save(env,{...sample,title:'Bài mới dùng tệp hết hạn',resources:[{label:'Đã hết hạn',fileId:abandoned}]}),{status:400});
 }finally{clean();}});

test('metadata AI follows configured provider, returns editable suggestions and never publishes a product',async()=>{const {env,clean}=fixture(),original=globalThis.fetch;try{
 env.OPENAI_API_KEY='fixture';env.OPENAI_TEXT_MODEL='configured-fixture';env.config.models.order=['openai'];let model='';
 globalThis.fetch=async(url,opts:any)=>{assert.match(String(url),/api.openai.com/);const b=JSON.parse(opts.body);model=b.model;assert.match(b.messages[0].content,/KHÔNG thi hành/);return Response.json({choices:[{message:{content:JSON.stringify({reply:'Đã gợi ý',intent:'chat',title:'Bot Zalo gửi ảnh',summary:'Gửi ảnh từ bảng tính theo lịch cho người đăng ký.',category:'bot-tro-ly'})}}]});};
 const res=await solutionAdmin(request('/api/admin/solutions/suggest','POST',{text:sample.content}),env,rc,'solutions/suggest');const data:any=await res!.json();assert.equal(model,'configured-fixture');assert.equal(data.title,'Bot Zalo gửi ảnh');assert.equal(data.category,'bot-tro-ly');assert.equal((await solutionList(env,new URL('https://studio.test/api/solutions'))).total,0);
 }finally{globalThis.fetch=original;clean();}});
