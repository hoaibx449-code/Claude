import {test} from 'node:test';import assert from 'node:assert/strict';
import {mountVideoPreviews,libraryPlaceholder} from '../web/public/video-previews.js';
test('library loops muted videos only while visible, pauses on hidden/user pause, and disposes resources',async()=>{
 const oldDoc=globalThis.document,oldIO=globalThis.IntersectionObserver;let callback:any,disconnected=false;
 const events=new Map(),classes=new Map();const root:any={querySelectorAll:()=>[v],classList:{toggle:(k:any,val:any)=>classes.set(k,val)}};
 let plays=0,pauses=0,loads=0;const handlers=new Map(),attrs=new Map();
 const v:any={dataset:{previewSrc:'/api/jobs/real/video'},parentElement:{dataset:{}},getAttribute:(k:any)=>attrs.get(k),set src(x:any){attrs.set('src',x)},play:async()=>{plays++;},pause:()=>{pauses++;},load:()=>{loads++;},removeAttribute:(k:any)=>attrs.delete(k),addEventListener:(k:any,f:any)=>handlers.set(k,f),removeEventListener:(k:any)=>handlers.delete(k)};
 try{
 globalThis.document={hidden:false,addEventListener:(k:any,f:any)=>events.set(k,f),removeEventListener:(k:any)=>events.delete(k)} as any;
 globalThis.IntersectionObserver=class{constructor(cb:any){callback=cb;}observe(){}disconnect(){disconnected=true;}} as any;
 const manager=mountVideoPreviews(root);assert.equal(plays,0);assert.equal(attrs.get('src'),undefined);
 callback([{target:v,isIntersecting:true,intersectionRatio:.8}]);await Promise.resolve();assert.equal(plays,1);assert.equal(v.muted,true);assert.equal(v.loop,true);assert.equal(v.playsInline,true);
 handlers.get('playing')();assert.equal(v.parentElement.dataset.playback,'playing');
 manager.setPaused(true);assert.equal(classes.get('library-paused'),true);assert.ok(pauses>0);manager.setPaused(false);await Promise.resolve();assert.equal(plays,2);
 (document as any).hidden=true;events.get('visibilitychange')();assert.equal(plays,2);
 (document as any).hidden=false;callback([{target:v,isIntersecting:false,intersectionRatio:0}]);assert.equal(plays,2);
 manager.dispose();assert.equal(disconnected,true);assert.equal(events.size,0);assert.equal(handlers.size,0);assert.equal(attrs.has('src'),false);assert.equal(loads,1);
 }finally{globalThis.document=oldDoc;globalThis.IntersectionObserver=oldIO;}
});
test('unrendered projects use honest states and only real running progress is shown',()=>{
 const h=(tag:any,attrs:any,...children:any[])=>({tag,attrs,children}),icon=()=>({});const text=(n:any):string=>typeof n==='string'?n:n?.children?.map(text).join(' ')||'';
 for(const state of ['draft','queued','failed']){const p=libraryPlaceholder({id:'a',title:'Video',last_job:state},h,icon);assert.doesNotMatch(text(p),/Đang dựng/);assert.equal(p.attrs['data-state'],state);}
 const running=libraryPlaceholder({id:'b',title:'Video',last_job:'running',last_progress:42},h,icon);assert.match(text(running),/42%/);assert.match(text(running),/Đang dựng/);
});
