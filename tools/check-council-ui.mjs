import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import {councilDefaults} from '../web/src/council.ts';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const app=readFileSync('web/public/app.js','utf8');
const helper=app.slice(app.indexOf('function h(tag,'),app.indexOf('// line icons'));
const module=readFileSync('web/public/council-admin.js','utf8').replace('export async function showCouncil','async function showCouncil');
mkdirSync('outputs/council',{recursive:true});
try{
  for(const width of [390,800,1440]){
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.route('https://studio.test/**',r=>r.fulfill({contentType:'text/html',body:'<main class="wrap"><div class="admin"><div class="admin-main"><div id="body" class="admin-body"></div></div></div></main>'}));
    await page.goto('https://studio.test/');
    await page.addStyleTag({content:readFileSync('web/public/app.css','utf8')+readFileSync('web/public/admin-layout.css','utf8')});
    await page.addScriptTag({content:helper+'\n'+module});
    await page.evaluate(async(config)=>{
      const jobs=[{id:'a'.repeat(24),brief:'Ý tưởng cà phê đa kênh',status:'pending'}];
      window.saved=null;window.errors=[];
      const api=async(path,opts={})=>{
        if(path.endsWith('/config')){window.saved=opts.body;return{ok:true};}
        if(path.endsWith('/pair'))return{command:'/link@Faciup_bot '+'b'.repeat(32)};
        if(path.endsWith('/telegram-status'))return{configured:true,username:'Faciup_bot',webhookMatches:true,secretConfigured:true,pendingUpdates:0};
        if(path.endsWith('/jobs/'+'a'.repeat(24)))return{job:{...jobs[0],brief:'Brief',error:''},turns:[{agent_id:'editor',provider:'gemini',model:'free',text:'<img src=x onerror="window.pwned=true"> Đề xuất đa kênh'}],deliveries:[]};
        return {config:JSON.parse(JSON.stringify(config)),secrets:{},links:[],jobs,calls:0,freeModels:['gemini-3.5-flash-lite']};
      };
      await showCouncil({h,api,body:document.getElementById('body'),toast:()=>{},fail:e=>window.errors.push(e.message)});
    },councilDefaults());
    assert.equal(await page.getByLabel('Bật nhóm AI',{exact:true}).isChecked(),false);
    assert.equal(await page.getByLabel('Chỉ dùng lựa chọn miễn phí',{exact:false}).isChecked(),true);
    await page.getByRole('button',{name:'Thêm trợ lý',exact:true}).click();
    assert.equal(await page.getByLabel('Tên trợ lý',{exact:true}).count(),6);
    await page.getByRole('button',{name:'Lưu cấu hình nhóm',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.saved.config.agents.length),6);
    await page.getByRole('button',{name:'Tạo mã ghép quản trị',exact:true}).click();
    assert.match(await page.locator('code').innerText(),/^\/link@Faciup_bot /);
    await page.getByRole('button',{name:'Kiểm tra kết nối Telegram',exact:true}).click();
    await page.getByText('Bot: @Faciup_bot.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Xem phiên',exact:true}).click();
    await page.getByRole('button',{name:'Duyệt',exact:true}).waitFor();
    assert.equal(await page.locator('#body img').count(),0,'AI text never becomes executable markup');
    assert.equal(await page.evaluate(()=>!!window.pwned),false);
    assert.deepEqual(await page.evaluate(()=>window.errors),[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`outputs/council/${width}.png`,fullPage:true});
    console.log(`PASS ${width}px: configuration, pairing, session, XSS and layout`);
    await page.close();
  }
}finally{await browser.close();}
