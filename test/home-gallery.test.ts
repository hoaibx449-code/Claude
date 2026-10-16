import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryItems, mountGallery } from '../web/public/home-gallery.js';
import { cleanConfig, defaultConfig } from '../web/src/settings.ts';

test('home playlist preserves the legacy hero, deduplicates videos, skips empty entries and accepts signed video URLs',()=>{
 const list=galleryItems({heroMedia:'https://example.com/a.mp4?v=2',heroPoster:'https://example.com/cover.webp',showcase:[
  {video:'https://example.com/a.mp4?v=2',title:'Duplicate'}, {video:'',poster:'https://example.com/p.png'},
  {video:'https://example.com/stream?id=1',title:'Clip two',caption:'Details'}
 ]});
 assert.equal(list.length,2);assert.equal(list[0].video,true);assert.equal(list[1].video,true);
 assert.equal(list[1].title,'Clip two');assert.equal(list[1].caption,'Details');assert.deepEqual(galleryItems(),[]);
});

test('admin uploaded media and slideshow order survive settings save; unsafe addresses are removed',()=>{
 const ref='site:'+'a'.repeat(24)+'.mp4';
 const c=cleanConfig({site:{heroMedia:ref,showcase:[{video:'https://example.com/second.webm',title:'Second'},{video:'javascript:alert(1)',title:'Unsafe'},{video:ref,title:'Duplicate'}]}},defaultConfig({} as any));
 assert.deepEqual(galleryItems(c.site).map(m=>m.src),[ref,'https://example.com/second.webm']);
});


test('carousel waits for video end, restarts on return, pauses, and releases timers/media on route cleanup',()=>{
 const originals={document:globalThis.document,matchMedia:globalThis.matchMedia,IntersectionObserver:globalThis.IntersectionObserver,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 let tick:any,observer:any,cleared=false,disconnected=false;const listeners=new Map();
 class El{
  tagName:string;children:any[]=[];attrs:any={};style:any={};events:any={};paused=true;ended=false;time=0;inert=false;textContent='';
  constructor(tag:string,attrs:any={}){this.tagName=tag.toUpperCase();for(const [k,v] of Object.entries(attrs)){if(k.startsWith('on'))this.events[k.slice(2)]=v;else this.attrs[k]=v;}}
  get currentTime(){return this.time;}set currentTime(n:number){this.time=n;this.ended=false;}
  get src(){return this.attrs.src;}set src(s:string){this.attrs.src=s;}
  append(...els:any[]){this.children.push(...els.filter(Boolean));}
  setAttribute(k:string,v:any){this.attrs[k]=v;}getAttribute(k:string){return this.attrs[k]||null;}removeAttribute(k:string){delete this.attrs[k];}
  addEventListener(k:string,fn:any){this.events[k]=fn;}contains(e:any){return this===e||this.children.some(c=>c?.contains?.(e));}
  classList={toggle:()=>{}};play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}load(){}
 }
 const h=(tag:string,attrs:any={},...kids:any[])=>{const el=new El(tag,attrs);el.append(...kids.flat());return el;};
 const all=(e:any):any[]=>[e,...e.children.filter((x:any)=>x instanceof El).flatMap(all)];
 try{
  globalThis.document={hidden:false,addEventListener:(k:any,f:any)=>listeners.set(k,f),removeEventListener:(k:any)=>listeners.delete(k)} as any;
  globalThis.matchMedia=(()=>({matches:false})) as any;
  globalThis.IntersectionObserver=class{constructor(f:any){observer=f;}observe(){}disconnect(){disconnected=true;}} as any;
  globalThis.setInterval=((f:any)=>{tick=f;return 1;}) as any;globalThis.clearInterval=(()=>{cleared=true;}) as any;
  const gallery=mountGallery(galleryItems({showcase:[{video:'a.mp4',title:'One'},{video:'b.mp4',title:'Two'}]}),{h,siteUrl:(s:string)=>s});
  const nodes=all(gallery.element),videos=nodes.filter(e=>e.tagName==='VIDEO'),track=nodes.find(e=>e.attrs.class==='hero-track');
  observer([{isIntersecting:true}]);assert.equal(videos[0].paused,false);tick();assert.equal(track.style.transform,'translateX(-0%)');
  videos[0].ended=true;videos[0].time=3;tick();assert.equal(track.style.transform,'translateX(-100%)');assert.equal(videos[0].paused,true);assert.equal(videos[1].paused,false);
  videos[1].ended=true;tick();assert.equal(track.style.transform,'translateX(-0%)');assert.equal(videos[0].currentTime,0);assert.equal(videos[0].paused,false);
  const pause=nodes.find(e=>e.attrs['aria-label']==='Tạm dừng trình diễn');pause.events.click();assert.equal(videos[0].paused,true);
  videos[0].ended=true;tick();assert.equal(track.style.transform,'translateX(-0%)');
  gallery.dispose();assert.ok(cleared&&disconnected);assert.equal(listeners.size,0);assert.ok(videos.every(e=>e.paused&&!e.src));
 }finally{Object.assign(globalThis,originals);}
});
