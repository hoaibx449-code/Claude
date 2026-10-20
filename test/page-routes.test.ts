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
 assert.equal(vm.runInContext('currentRoute()',context),'#/prompt-hunter?q=video');
 vm.runInContext("navigate('#/admin/anh-zalo')",context);
 assert.equal(location.pathname,'/admin/anh-zalo');assert.equal(location.hash,'');
 location.href='https://fixture.test/#/goi';context.window.dispatchEvent(new Event('hashchange'));
 assert.equal(location.pathname,'/goi');assert.equal(location.hash,'');
 location.href='https://fixture.test/p/'+'a'.repeat(24);context.window.dispatchEvent(new Event('popstate'));
 assert.equal(vm.runInContext('currentRoute()',context),'#/p/'+'a'.repeat(24));
});
