import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});mkdirSync('outputs/select-overlay',{recursive:true});
try{for(const fallback of [false,true])for(const width of [390,800,1440]){
 const page=await browser.newPage({viewport:{width,height:800}});page.setDefaultTimeout(5000);
 await page.setContent('<div class="stage"><label>Chi phí<select aria-label="Chi phí"><option value="">Tất cả</option><option value="free">Miễn phí</option><option value="paid">Trả phí</option></select></label></div><div class="cover">Các thẻ phân loại</div><dialog><label>Trong popup<select aria-label="Trong popup"><option>A</option><option>B</option></select></label></dialog>');
 await page.addStyleTag({content:readFileSync('web/public/app.css','utf8')+' .stage{transform:translateY(0);margin:80px 16px 0;padding:20px;max-width:380px}.cover{position:relative;z-index:500;background:#eee;height:80px;margin:0 16px;transform:translateY(-4px)}dialog{width:320px}'});
 if(fallback)await page.evaluate(()=>Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined,configurable:true}));
 await page.addScriptTag({content:readFileSync('web/public/ui-select.js','utf8')});
 const button=page.getByRole('button',{name:'Chi phí',exact:true});const normal=await button.evaluate(el=>getComputedStyle(el).backgroundColor);await button.click();assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),normal,'hover/open must retain a readable field background');
 const free=page.getByRole('option',{name:'Miễn phí',exact:true});await free.waitFor();
 assert.equal(await free.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit||el.contains(hit);}),true,'option must receive clicks above later stacking contexts');
 await page.screenshot({path:'outputs/select-overlay/'+width+'-'+fallback+'.png'});await free.click();assert.equal(await page.locator('select[aria-label="Chi phí"]').inputValue(),'free');
 await button.click();await button.press('ArrowDown');await button.press('Enter');assert.equal(await page.locator('select[aria-label="Chi phí"]').inputValue(),'paid');
 await button.click();await button.press('Escape');assert.equal(await page.locator('.nv-list').count(),0);
 await button.click();await page.getByText('Các thẻ phân loại',{exact:true}).click();assert.equal(await page.locator('.nv-list').count(),0);
 await page.evaluate(()=>document.querySelector('dialog').showModal());await page.getByRole('button',{name:'Trong popup',exact:true}).click();await page.getByRole('option',{name:'B',exact:true}).click();assert.equal(await page.locator('select[aria-label="Trong popup"]').inputValue(),'B');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('PASS '+width+'px '+(fallback?'portal fallback':'native top layer')+': overlap, pointer, keyboard, dismissal and modal');await page.close();
}}finally{await browser.close();}
