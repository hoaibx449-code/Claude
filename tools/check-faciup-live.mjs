import {chromium} from 'playwright';import {readFileSync,existsSync,mkdirSync} from 'node:fs';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
import {defaultConfig,publicConfig} from '../web/src/settings.ts';import {PUBLIC_PAGES} from '../web/src/page-routes.ts';
const root=resolve('web/public'),cfg=defaultConfig({});
const agents=['FACIUP','Chiến lược','Nghiên cứu','Biên kịch','Phản biện','Trợ lý Zalo'].map((name,i)=>({id:'a'+i,name,icon:['spark','target','search','pen','check','zalo'][i],color:['#f97316','#e8336d','#7c3aed','#2563eb','#0d9488','#16a34a'][i],state:i===4?'paused':i===3?'running':'idle',avg:42,since:Date.now()-16000,live:i===5}));
const runtime={enabled:true,agents,sessions:[],handovers:Array.from({length:18},(_,i)=>({agent:i%6,at:Date.now()-i*60000})),running:1,queued:2,review:1,polledAt:Date.now(),kpi:{today:12,yesterday:8,avgToday:42,avgYesterday:50,decided:10,approved:8,series:[1,2,0,4,3,1,2],top:agents.slice(1,4).map((a,i)=>({name:a.name,color:a.color,n:5-i}))}};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});mkdirSync('outputs/live-compact',{recursive:true});
try{for(const [width,height] of [[360,800],[390,844],[800,1000],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});let failed=false;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://fixture.test')return route.abort();
  if(u.pathname==='/api/auth/config')return route.fulfill({json:{ui:publicConfig(cfg)}});
  if(u.pathname==='/api/me')return route.fulfill({status:401,json:{error:'login'}});
  if(u.pathname==='/api/faciup-live')return failed?route.fulfill({status:503,json:{error:'fixture'}}):route.fulfill({json:{runtime,updatedAt:Date.now()}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],videos:[]}});
  const p=resolve(root,'.'+u.pathname),file=existsSync(p)&&extname(p)?p:resolve(root,'index.html');let body=readFileSync(file);const type={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'}[extname(file)]||'application/octet-stream';
  if(extname(file)==='.html')body=Buffer.from(body.toString().replace('</head>','<script type="application/json" id="route-metadata">'+JSON.stringify({pages:PUBLIC_PAGES,brand:'FACIUP'})+'</script></head>'));return route.fulfill({contentType:type,body});
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/faciup-live');await page.locator('.fl-bot').first().waitFor();
 const consent=page.getByRole('button',{name:'Đồng ý',exact:true});if(await consent.isVisible())await consent.click();
 assert.equal(await page.locator('.fl-bot').count(),5);assert.equal(await page.locator('.fl-paused').count(),1);assert.equal(await page.locator('.fl-paused').getAttribute('title'),'Phản biện · Tạm dừng');assert.equal(await page.locator('.fl-paused .fl-body').evaluate(n=>getComputedStyle(n).filter),'none');const robotWidth=await page.locator('.fl-bot').first().evaluate(n=>n.getBoundingClientRect().width);assert.ok(Math.abs(robotWidth-(width<=560?30:42))<.1);assert.equal(await page.locator('.fl-kpi').count(),5);assert.equal(await page.locator('.fl-log li').count(),18);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no overflow '+width);
 if(width>=900){const boxes=await page.evaluate(()=>{const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {top:x.top,bottom:x.bottom,width:x.width,height:x.height};};return {dial:r('.fl-stage'),kpis:r('.fl-kpis'),side:r('.fl-side'),h:innerHeight};});assert.ok(boxes.dial.top>=0,'dial visible from top');assert.ok(boxes.kpis.bottom<=height-12,'whole dial + KPIs fit '+width+': '+JSON.stringify(boxes));assert.ok(boxes.side.bottom<=boxes.dial.bottom+2,'sidebar stays within overview');}
 await page.screenshot({path:`outputs/live-compact/${width}x${height}.png`,fullPage:true});
 await page.evaluate(()=>navigate('/bao-mat'));await page.locator('.fl-live').waitFor({state:'detached'});assert.deepEqual(errors,[]);console.log('PASS '+width+'x'+height+': complete overview, moving robots, bounded handovers and KPIs');await context.close();
 }
}finally{await browser.close();}
