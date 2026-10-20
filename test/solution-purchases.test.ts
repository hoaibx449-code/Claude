import worker from '../web/src/worker.ts';
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {database} from './support/sqlite.ts';import {defaultConfig,clearCache} from '../web/src/settings.ts';import {startSession} from '../web/src/auth.ts';import {solutionAdmin,solutionPage,solutionDownload,solutionKnowledge} from '../web/src/solutions.ts';import {createOrder,plansAdmin,sepayWebhook} from '../web/src/plans.ts';
const req=(path:string,cookie='',method='GET',body?:any)=>new Request('https://fixture.test'+path,{method,headers:{cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('paid solution gates HTML, code, instructions and files; payment atomically grants ownership once',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'solution-purchase-')),files=new Map<string,string>();const env:any={DB:database(join(dir,'db.sqlite')),ADMIN_EMAIL:'admin@test',BUCKET:{get:async(k:string)=>files.has(k)?{body:files.get(k)}:null}};env.config=defaultConfig(env);env.config.payment.enabled=true;env.config.payment.account='123456';
 const rc:any={log(){},wait(p:Promise<any>){p.catch(()=>{});}},user={id:'buyer',email:'buyer@test',name:'Buyer',picture:null},other={...user,id:'other',email:'other@test'};
 try{
 const buyer=(await startSession(env,user)).split(';')[0],stranger=(await startSession(env,other)).split(';')[0];
 const file='b'.repeat(24);await env.DB.prepare('INSERT INTO solution_files(id,name,bytes,created_at) VALUES(?,?,?,?)').bind(file,'skill.md',6,Date.now()).run();files.set('solutions/'+file,'SECRET');
 const data={title:'Skill trả phí',summary:'Giải pháp mua một lần.',content:'Giới thiệu công khai giải pháp. '.repeat(5),category:'skill-tai-nguyen',status:'published',pricing:'paid',price:'99000',instructions:'PRIVATE-INSTRUCTIONS',resources:[{label:'Skill',fileId:file,kind:'document',format:'MD'},{label:'Code',kind:'code',code:'PRIVATE-CODE',format:'JS'}]};
 const saved:any=await (await solutionAdmin(req('/api/admin/solutions','', 'POST',data),env,rc,'solutions'))!.json();const p=await env.DB.prepare('SELECT * FROM solutions WHERE id=?').bind(saved.id).first<any>();const url='/giai-phap/'+p.slug;
 for(const cookie of ['',buyer,stranger]){const html=await (await solutionPage(req(url,cookie),env))!.text();assert.ok(html.includes('Mua giải pháp'));assert.ok(!html.includes('PRIVATE-CODE'));assert.ok(!html.includes('PRIVATE-INSTRUCTIONS'));}
 assert.ok(!JSON.stringify(await solutionKnowledge(env,'Skill')).includes('PRIVATE-INSTRUCTIONS'));
 await assert.rejects(()=>solutionDownload(req('/api/solution-files/'+file,buyer),env,file),{status:403});
 const order=await createOrder(env,rc,user,'solution:'+saved.id);assert.equal(order.amount,99000);assert.equal((await createOrder(env,rc,user,'solution:'+saved.id)).code,order.code);
 assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE code=?').bind(order.code).first<any>()).status,'pending');
 await plansAdmin(req('/api/admin/orders/'+order.code+'/confirm','', 'POST'),env,'orders/'+order.code+'/confirm','POST',rc);
 assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE code=?').bind(order.code).first<any>()).status,'paid');
 await plansAdmin(req('/api/admin/orders/'+order.code+'/confirm','', 'POST'),env,'orders/'+order.code+'/confirm','POST',rc);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM payment_receipts WHERE order_code=?').bind(order.code).first<any>()).n,1);
 const publicAfter=await (await solutionPage(req(url,buyer),env))!.text();assert.ok(!publicAfter.includes('PRIVATE-CODE'));
 const ctx:any={waitUntil(p:Promise<any>){p.catch(()=>{});}};assert.equal((await worker.fetch(req('/api/solution-view/'+p.slug),env,ctx)).status,401);
 const actual=await worker.fetch(req('/api/solution-view/'+p.slug,buyer),env,ctx);assert.equal(actual.status,200);assert.ok((await actual.text()).includes('PRIVATE-CODE'));
 assert.equal((await worker.fetch(req('/api/solution-files/'+file,buyer),env,ctx)).status,200);
 const unlocked=await solutionPage(req(url,buyer),env,true);const html=await unlocked!.text();assert.ok(html.includes('PRIVATE-CODE'));assert.ok(html.includes('PRIVATE-INSTRUCTIONS'));assert.ok(html.includes('/api/solution-files/'+file));assert.match(unlocked!.headers.get('cache-control')!,/no-store/);
 const anon=await (await solutionPage(req(url),env,true))!.text();assert.ok(!anon.includes('PRIVATE-CODE'));
 assert.equal(await (await solutionDownload(req('/api/solution-files/'+file,buyer),env,file)).text(),'SECRET');
 await assert.rejects(()=>solutionDownload(req('/api/solution-files/'+file,stranger),env,file),{status:403});
 await assert.rejects(()=>solutionDownload(req('/tai-nguyen/'+file,buyer),env,file),{status:403});
 await assert.rejects(()=>createOrder(env,rc,user,'solution:'+saved.id),{status:409});
 env.SEPAY_API_KEY='fixture-key';const order2=await createOrder(env,rc,other,'solution:'+saved.id);
 const hook=async(amount:number,id:string)=>sepayWebhook(new Request('https://fixture.test/api/sepay/webhook',{method:'POST',headers:{authorization:'Apikey fixture-key','content-type':'application/json'},body:JSON.stringify({id,transferType:'in',accountNumber:'123456',content:order2.code,transferAmount:amount})}),env,rc);
 await hook(98000,'transfer-1');assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE code=?').bind(order2.code).first<any>()).status,'pending');
 await hook(99000,'transfer-2');await hook(99000,'transfer-2');assert.equal((await env.DB.prepare('SELECT status FROM orders WHERE code=?').bind(order2.code).first<any>()).status,'paid');
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM payment_receipts WHERE order_code=?').bind(order2.code).first<any>()).n,1);
 await env.DB.prepare('INSERT INTO blocked_users(user_id,blocked_at) VALUES(?,?)').bind(user.id,Date.now()).run();await assert.rejects(()=>solutionDownload(req('/api/solution-files/'+file,buyer),env,file),{status:403});
 }finally{clearCache();rmSync(dir,{recursive:true,force:true});}
});

