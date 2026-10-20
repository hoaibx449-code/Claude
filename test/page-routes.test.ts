import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isAppPage,pageMetadata,pageSitemap} from '../web/src/page-routes.ts';
test('clean addresses keep public/private indexing boundaries and exclude unknown pages',()=>{
 assert.ok(isAppPage('/prompt-hunter'));assert.ok(isAppPage('/admin/anh-zalo'));
 assert.ok(isAppPage('/p/'+'a'.repeat(24)));assert.ok(!isAppPage('/missing'));
 assert.equal(pageMetadata('/admin','FACIUP','https://test').noindex,true);
 assert.equal(pageMetadata('/prompt-hunter','FACIUP','https://test').noindex,false);
 assert.equal(pageMetadata('/prompt-hunter','FACIUP','https://test','?q=test').noindex,true);
 assert.ok(!pageSitemap('https://test').includes('/admin'));
});
test('legacy bookmarks, clean navigation, search and browser history resolve the same routes',()=>{
 const location=new URL('https://fixture.test/#/prompt-hunter?q=video');
 const listeners=new Map();const history={state:null,replaceState(_s,_t,u){location.href=new URL(u,location).href;},pushState(_s,_t,u){location.href=new URL(u,location).href;}};
 const document={documentElement:{},querySelectorAll:()=>[],getElementById:()=>null,querySelector:()=>null,addEventListener(){}};
 const context=vm.createContext({location,history,document,URL,Event,MutationObserver:class{observe(){}},window:{addEventListener(t,fn){listeners.set(t,[...(listeners.get(t)||[]),fn]);},dispatchEvent(e){for(const fn of listeners.get(e.type)||[])fn(e);}}});
 vm.runInContext(readFileSync('web/public/navigation.js','utf8'),context);
 assert.equal(location.pathname,'/prompt-hunter');assert.equal(location.hash,'');assert.equal(location.search,'?q=video');
 assert.equal(vm.runInContext('window.currentRoute()',context),'#/prompt-hunter?q=video');
 vm.runInContext("window.navigate('#/admin/anh-zalo')",context);
 assert.equal(location.pathname,'/admin/anh-zalo');assert.equal(location.hash,'');
 location.href='https://fixture.test/#/goi';context.window.dispatchEvent(new Event('hashchange'));
 assert.equal(location.pathname,'/goi');assert.equal(location.hash,'');
 location.href='https://fixture.test/p/'+'a'.repeat(24);context.window.dispatchEvent(new Event('popstate'));
 assert.equal(vm.runInContext('window.currentRoute()',context),'#/p/'+'a'.repeat(24));
});
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from './support/sqlite.ts';
import {clearCache} from '../web/src/settings.ts';
import worker from '../web/src/worker.ts';
test('Worker serves public deep links through the canonical root asset without redirect loops',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'page-route-'));const paths:string[]=[];
 const previous=(globalThis as any).HTMLRewriter;
 (globalThis as any).HTMLRewriter=class {on(){return this;}transform(r:Response){return r;}};
 const env:any={DB:database(join(dir,'db.sqlite')),ASSETS:{async fetch(req:Request){const p=new URL(req.url).pathname;paths.push(p);return p==='/index.html'?Response.redirect('https://fixture.test/',307):new Response('<html><head></head><body><main id="view"></main></body></html>',{headers:{'content-type':'text/html'}});}}};
 try{
  for(const path of ['/','/prompt-hunter','/bao-mat','/admin/giai-phap']){
   const res=await worker.fetch(new Request('https://fixture.test'+path),env,{waitUntil(){}} as any);
   assert.equal(res.status,200,path);assert.equal(res.headers.get('location'),null);
  }
  assert.deepEqual(paths,['/','/','/','/']);
  const unknown=await worker.fetch(new Request('https://fixture.test/missing'),env,{waitUntil(){}} as any);assert.equal(unknown.status,404);
 }finally{clearCache();(globalThis as any).HTMLRewriter=previous;rmSync(dir,{recursive:true,force:true});}
});
