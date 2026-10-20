// Isolated browser regression: emulate Google's unstyled, oversized pre-iframe DOM.
import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('web/public/app.js','utf8'),css=readFileSync('web/public/app.css','utf8');
const helper=source.slice(source.indexOf('function h('),source.indexOf('// line icons'));
const mount=source.slice(source.indexOf('function mountGoogleButton('),source.indexOf('function openLogin('));
const icon=source.slice(source.indexOf('const GOOGLE_G'),source.indexOf('/** Installed app'));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
mkdirSync('outputs/login-ui',{recursive:true});
try {
 for(const width of [390,800,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent('<main style="width:min(360px,calc(100vw - 64px));margin:30px auto"><div class="gslot"></div></main>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:helper+icon+mount+`
    window.delayed=[];const originalTimeout=window.setTimeout;
    window.setTimeout=(fn,ms)=>ms===7000?(window.delayed.push(fn),123):originalTimeout(fn,ms);
    window.google={accounts:{id:{initialize(){},renderButton(host){
      const giant=document.createElementNS('http://www.w3.org/2000/svg','svg');
      giant.setAttribute('width','2000');giant.setAttribute('height','2000');host.append(giant);
    }}}};
    window.start=()=>mountGoogleButton(document.querySelector('.gslot'),h('a',{class:'gbtn',href:'/api/auth/google/start'},GOOGLE_G(),'Tiếp tục với Google'),{clientId:'fixture',nonce:'fixture'},()=>{});
    start();`});
  const measure=()=>page.evaluate(()=>{const s=document.querySelector('.gslot'),r=s.getBoundingClientRect();return {height:r.height,width:r.width,overflow:document.documentElement.scrollWidth>innerWidth,hidden:getComputedStyle(document.querySelector('.gsi-host')).visibility,fallback:!document.querySelector('.gbtn').hidden,icon:document.querySelector('.gbtn svg').getBoundingClientRect().width};});
  const before=await measure();assert.equal(before.height,44);assert.ok(before.width<=300);assert.equal(before.overflow,false);assert.equal(before.hidden,'hidden');assert.equal(before.fallback,true);assert.equal(before.icon,20);
  await page.screenshot({path:`outputs/login-ui/loading-${width}.png`});
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.srcdoc='<button style="height:40px">Google ready</button>';document.querySelector('.gsi-host').replaceChildren(frame);});
  await page.waitForFunction(()=>document.querySelector('.gsi-host').classList.contains('ready'));
  const after=await measure();assert.equal(after.height,before.height);assert.equal(after.width,before.width);assert.equal(after.overflow,false);assert.equal(after.hidden,'visible');assert.equal(after.fallback,false);
  await page.evaluate(()=>{start();window.delayed.at(-1)();});
  assert.equal(await page.locator('.gsi-host').count(),0);assert.equal(await page.locator('.gbtn').isVisible(),true);
  console.log(`PASS ${width}px: oversized SDK DOM hidden, layout stable, iframe ready and timeout fallback`);
  await page.close();
 }
}finally{await browser.close();}
