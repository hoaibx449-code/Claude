import {chromium} from 'playwright';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {defaultConfig,publicConfig} from '../web/src/settings.ts';
import {PUBLIC_PAGES} from '../web/src/page-routes.ts';
const cfg=defaultConfig({});const root=resolve('web/public');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 let failLive=false;
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='https://fixture.test')return route.abort();
  if(u.pathname==='/api/auth/config')return route.fulfill({json:{ui:publicConfig(cfg)}});
  if(u.pathname==='/api/me')return route.fulfill({status:401,json:{error:'login'}});
  if(u.pathname==='/api/faciup-live'&&failLive)return route.fulfill({status:503,json:{error:'test failure'}});
  if(u.pathname==='/api/faciup-live')return route.fulfill({json:{updatedAt:Date.now(),counts:{prompts:57,solutions:3},features:{assistant:true,zalo:false,community:true}}});
  if(u.pathname==='/api/legal')return route.fulfill({json:{terms:'Điều khoản thử',privacy:'Bảo mật thử',refund:'Hoàn tiền thử'}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],results:[],total:0,categories:[],videos:[]}});
  const p=resolve(root,'.'+u.pathname);const file=existsSync(p)&&extname(p)?p:resolve(root,'index.html');
  let body=readFileSync(file);const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'}[extname(file)]||'application/octet-stream';
  if(extname(file)==='.html')body=Buffer.from(body.toString().replace('</head>','<script type="application/json" id="route-metadata">'+JSON.stringify({pages:PUBLIC_PAGES,brand:'Nét Vẽ Studio'})+'</script></head>'));
  return route.fulfill({contentType:type,body});
 });

 mkdirSync('outputs/faciup-live',{recursive:true});
 for(const width of [360,390,800,1440]){
  const page=await context.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/faciup-live');await page.locator('.fl-node').first().waitFor();await page.getByText('57 prompt',{exact:true}).waitFor();const consent=page.getByRole('button',{name:'Đồng ý',exact:true});if(await consent.isVisible())await consent.click();
  assert.equal(await page.locator('.fl-node').count(),6);
  await page.getByRole('button',{name:'Prompt Hunter',exact:true}).click();assert.equal(await page.locator('.fl-detail h2').textContent(),'Prompt Hunter');
  await page.getByRole('button',{name:'Kết nối Zalo',exact:true}).click();assert.equal(await page.locator('.fl-detail .fl-action').count(),0);assert.ok((await page.locator('.fl-detail').textContent()).includes('chưa được bật'));
  await page.getByRole('button',{name:'Trợ lý AI',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow '+width);
  const bounds=await page.locator('.fl-node').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'nodes must not overlap '+width);}
  await page.mouse.move(0,0);await page.waitForTimeout(650);
  await page.screenshot({path:'outputs/faciup-live/'+width+'.png',fullPage:true});
  failLive=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.locator('.fl-stale').waitFor();failLive=false;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.locator('.fl-stale').waitFor({state:'detached'});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.fl-scanner').evaluate(n=>getComputedStyle(n).animationName),'none');
  await page.evaluate(()=>navigate('/bao-mat'));await page.locator('.fl-page').waitFor({state:'detached'});await page.goBack();await page.locator('.fl-page').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS Faciup Live '+width+'px: nodes, data, disabled feature, routes, reduced motion, overflow');await page.close();
 }
}finally{await browser.close();}
