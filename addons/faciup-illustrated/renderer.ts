import {cleanIllustrated} from './schema.ts';
export const SANS='NV Sans';
export function logicalSize(ratio:string){return ratio==='16:9'?{W:960,H:540}:{W:540,H:960};}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>1-Math.pow(1-clamp(x),3);
function contentBox(env:any,img:any){
 const cv=env.createCanvas(160,160),c=cv.getContext('2d');c.drawImage(img,0,0,160,160);const data=c.getImageData(0,0,160,160).data;let x0=160,y0=160,x1=-1,y1=-1;
 for(let y=0;y<160;y++)for(let x=0;x<160;x++){const k=(y*160+x)*4;if(data[k+3]>32&&(data[k]<235||data[k+1]<235||data[k+2]<235)){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
 if(x1<x0)return {x:0,y:0,w:img.width,h:img.height};
 x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(159,x1+3);y1=Math.min(159,y1+3);
 return {x:x0*img.width/160,y:y0*img.height/160,w:(x1-x0+1)*img.width/160,h:(y1-y0+1)*img.height/160};
}
function wrapped(c:any,text:string,max:number){const rows:string[]=[];let row='';for(const w of text.split(/\s+/)){const s=row?row+' '+w:w;if(row&&c.measureText(s).width>max){rows.push(row);row=w;}else row=s;}if(row)rows.push(row);return rows;}
export function prepare(o:any){
 if(o.project.look!=='illustrated')throw new Error('Bộ minh họa nhiều lớp chỉ nhận phong cách illustrated.');
 const designs=o.project.scenes.map((s:any,i:number)=>{const d=cleanIllustrated(s.illustrated||s.x?.illustrated);if(!d)throw new Error(`Cảnh ${i+1} chưa có bố cục nhiều lớp. Kịch bản và hình đã lưu vẫn được giữ.`);if(o.images[i].length!==d.layers.length)throw new Error(`Cảnh ${i+1}: số ảnh không khớp số lớp.`);return d;});
 const crop=o.images.map((row:any[])=>row.map(img=>contentBox(o.env,img)));
 return {...o,...logicalSize(o.project.ratio),designs,crop};
}
export function cuesOf(_m:any):any[]{return [];}
export function boxesOf(d:any,W:number,H:number){
 const wide=W>H,n=d.layers.length;
 if(wide){if(n===1)return [{x:W*.5,y:H*.57,w:W*.7,h:H*.64}];const xs=d.layout==='reverse'?[.68,.27]:[.32,.73];return n===3?[{x:W*.5,y:H*.58,w:W*.3,h:H*.63},{x:W*.18,y:H*.57,w:W*.25,h:H*.48},{x:W*.82,y:H*.57,w:W*.25,h:H*.48}]:xs.map(x=>({x:W*x,y:H*.58,w:W*.38,h:H*.63}));}
 if(n===1)return [{x:W*.5,y:H*.53,w:W*.87,h:H*.54}];
 const xs=d.layout==='reverse'?[.29,.73]:[.71,.27];
 return n===3?[{x:W*.5,y:H*.54,w:W*.62,h:H*.43},{x:W*.24,y:H*.76,w:W*.38,h:H*.19},{x:W*.77,y:H*.31,w:W*.35,h:H*.20}]:[{x:W*xs[0],y:H*.57,w:W*.52,h:H*.51},{x:W*xs[1],y:H*.48,w:W*.42,h:H*.37}];
}
export function cueAt(sc:any,st:any,layer:any){
 const k=Math.min(layer.line,sc.lines.length-1),span=st.lines[k]||st,words=String(sc.lines[k]||'').split(/\s+/),cue=String(layer.cue||'').toLocaleLowerCase('vi');
 const full=words.join(' ').toLocaleLowerCase('vi'),at=cue?full.indexOf(cue):-1;
 const frac=at>=0?full.slice(0,at).trim().split(/\s+/).filter(Boolean).length/Math.max(1,words.length):0;
 return span.start+frac*(span.end-span.start);
}
export function renderFrame(c:any,m:any,t:number,opts:any={}){
 let i=m.timeline.scenes.findIndex((s:any)=>t<s.end);if(i<0)i=m.timeline.scenes.length-1;
 const st=m.timeline.scenes[i],sc=m.project.scenes[i],d=m.designs[i],{W,H}=m,wide=W>H;
 c.setTransform(m.dpr,0,0,m.dpr,0,0);c.clearRect(0,0,W,H);c.fillStyle='#ffffff';c.fillRect(0,0,W,H);
 // Camera never shifts the board or exposes its edges. Each contained layer moves inside its box.
 const boxes=boxesOf(d,W,H);
 d.layers.forEach((layer:any,k:number)=>{
  const chosen=m.project.character&&layer.role==='character'?m.media?.[m.project.character]:null;
  const img=chosen||m.images[i]?.[k];if(!img||img.width<=4)return;
  const since=t-cueAt(sc,st,layer),p=opts.still?1:smooth(since/.42);if(p<=0)return;
  const b=boxes[k],idle=opts.still?0:layer.idle==='breathe'?Math.sin(since*2.4)*.008:0;
  const crop=chosen?{x:0,y:0,w:img.width,h:img.height}:m.crop[i][k];
  const scale=(layer.enter==='pop'?.86+.14*p:1)+idle,fit=Math.min(b.w/crop.w,b.h/crop.h)*scale;
  const dx=layer.enter==='slide'?(1-p)*b.w*.12:0,dy=(layer.enter==='rise'?(1-p)*b.h*.12:0)+(layer.idle==='float'&&!opts.still?Math.sin(since*1.8)*3:0);
  c.save();c.globalAlpha=p;c.beginPath();c.rect(18,wide?H*.2:H*.24,W-36,wide?H*.69:H*.61);c.clip();
  c.drawImage(img,crop.x,crop.y,crop.w,crop.h,b.x-crop.w*fit/2+dx,b.y-crop.h*fit/2+dy,crop.w*fit,crop.h*fit);c.restore();
 });
 // Draw text last so opaque illustration backgrounds never cover accents/diacritics.
 c.textAlign='center';c.textBaseline='middle';let fs=wide?34:37;c.font=`${fs}px ${SANS}`;
 let rows=wrapped(c,d.headline,W-54);while(rows.length>3&&fs>24){fs-=2;c.font=`${fs}px ${SANS}`;rows=wrapped(c,d.headline,W-54);}
 const y=wide?H*.13:H*.12,lh=fs*1.28;
 rows.forEach((row:string,k:number)=>{const ry=y+(k-(rows.length-1)/2)*lh;if(d.emphasis&&row.toLocaleLowerCase('vi').includes(d.emphasis.toLocaleLowerCase('vi'))){const tw=c.measureText(row).width;c.fillStyle=d.accent;c.fillRect(W/2-tw/2-9,ry-fs*.57,tw+18,fs*1.15);}c.fillStyle='#111827';c.fillText(row,W/2,ry);});
 if(m.project.subtitles===true){
  const li=st.lines.findIndex((s:any)=>t>=s.start&&t<s.end),line=li>=0?sc.lines[li]:'';
  if(line){c.font=`${wide?21:25}px ${SANS}`;let chunks=wrapped(c,line,W-70);const span=st.lines[li],total=chunks.length,p=clamp((t-span.start)/(span.end-span.start));const start=Math.min(Math.floor(p*Math.ceil(total/2))*2,Math.max(0,total-2));chunks=chunks.slice(start,start+2);const base=wide?H*.88:H*.91;c.fillStyle='#fff';c.fillRect(22,base-30,W-44,chunks.length*32+18);c.fillStyle='#111827';chunks.forEach((s:string,k:number)=>c.fillText(s,W/2,base+k*32));}
 }
}
