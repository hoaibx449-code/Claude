import {chromium} from 'playwright';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {defaultConfig,publicConfig} from '../web/src/settings.ts';
import {PUBLIC_PAGES} from '../web/src/page-routes.ts';
const cfg=defaultConfig({});const root=resolve('web/public');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='https://fixture.test')return route.abort();
  if(u.pathname==='/api/auth/config')return route.fulfill({json:{ui:publicConfig(cfg)}});
  if(u.pathname==='/api/me')return route.fulfill({status:401,json:{error:'login'}});
  if(u.pathname==='/api/legal')return route.fulfill({json:{terms:'Điều khoản thử',privacy:'Bảo mật thử',refund:'Hoàn tiền thử'}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],results:[],total:0,categories:[],videos:[]}});
  const p=resolve(root,'.'+u.pathname);const file=existsSync(p)&&extname(p)?p:resolve(root,'index.html');
  let body=readFileSync(file);const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'}[extname(file)]||'application/octet-stream';
  if(extname(file)==='.html')body=Buffer.from(body.toString().replace('</head>','<script type="application/json" id="route-metadata">'+JSON.stringify({pages:PUBLIC_PAGES,brand:'Nét Vẽ Studio'})+'</script></head>'));
  return route.fulfill({contentType:type,body});
 });
 for(const width of [390,800,1440]){
  const page=await context.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/#/dieu-khoan');await page.locator('#view h1').waitFor();
  assert.equal(new URL(page.url()).pathname,'/dieu-khoan');assert.equal(new URL(page.url()).hash,'');
  await page.locator('#view').getByText('Điều khoản thử',{exact:true}).waitFor();
  await page.evaluate(()=>navigate('#/bao-mat'));await page.locator('#view').getByText('Bảo mật thử',{exact:true}).waitFor();
  assert.ok((await page.title()).includes('Chính sách bảo mật'));
  await page.goBack();await page.locator('#view').getByText('Điều khoản thử',{exact:true}).waitFor();
  await page.reload();await page.locator('#view').getByText('Điều khoản thử',{exact:true}).waitFor();
  assert.equal(await page.locator('a[href^="#/"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS clean routes, legacy bookmark, back/reload, metadata, header and overflow at '+width+'px');await page.close();
 }
 const old=await context.newPage();await old.route('**/navigation.js*',route=>route.abort());await old.goto('https://fixture.test/#/bao-mat');await old.locator('#view').getByText('Bảo mật thử',{exact:true}).waitFor();assert.equal(new URL(old.url()).pathname,'/bao-mat');console.log('PASS cached shell loads bundled router when navigation script is absent');await old.close();
}finally{await browser.close();}
