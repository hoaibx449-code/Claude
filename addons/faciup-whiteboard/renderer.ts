// Add-on renderer. It never calls, patches or replaces the application's renderer.
import { compile } from './faciup-design.js';
import { frame } from './faciup-ink.js';
import { cleanWhiteboard } from './faciup-schema.js';
export const SANS='NV Sans';
export function logicalSize(ratio:string){return ratio==='16:9'?{W:960,H:540}:{W:540,H:960};}
export function prepare(o:any){
 if(o.project.look!=='whiteboard')throw new Error('Bộ dựng bổ sung này chỉ nhận Whiteboard; các kiểu khác dùng máy dựng cũ.');
 const {W,H}=logicalSize(o.project.ratio);
 const designs=o.project.scenes.map((s:any,i:number)=>{
  const d=cleanWhiteboard(s.whiteboard||s.x?.whiteboard);
  if(!d)throw new Error(`Cảnh ${i+1} chưa có thiết kế Whiteboard. Tài nguyên được giữ để thử lại.`);
  return compile(d,o.timeline.scenes[i].end-o.timeline.scenes[i].start,W*2,H*2,i);
 });
 return {...o,W,H,designs};
}
export function cuesOf(_m:any):any[]{return [];}
export function renderFrame(c:any,m:any,t:number,opts:any={}){
 let i=m.timeline.scenes.findIndex((s:any)=>t<s.end);if(i<0)i=m.timeline.scenes.length-1;
 c.setTransform(m.dpr*.5,0,0,m.dpr*.5,0,0);
 frame(c,m.designs[i],Math.max(0,t-m.timeline.scenes[i].start),{width:m.W*2,height:m.H*2,
  hand:opts.hand!==false,handImage:m.hand.whiteboardImage,handScale:m.W>m.H?.20:.24,handAnchor:[175,157],footer:false});
 // Only user-selected pictures; never substitute a default character or product.
 const refs=[m.project.character,i===m.project.scenes.length-1?m.project.affiliate?.image:null].filter(Boolean);
 if(t-m.timeline.scenes[i].start>1)refs.forEach((key:string,j:number)=>{
  const im=m.media?.[key];if(!im)return;c.setTransform(m.dpr,0,0,m.dpr,0,0);
  const box=Math.min(m.W*.25,m.H*.22),k=Math.min(box/im.width,box/im.height);
  c.drawImage(im,j?m.W-box-25:25,m.H-box-110,im.width*k,im.height*k);
 });
 if(m.project.subtitles===true){
  const line=m.timeline.scenes[i].lines?.findIndex((l:any)=>t>=l.start&&t<l.end);
  const text=line>=0?m.project.scenes[i].lines[line]:'';
  if(text){c.setTransform(m.dpr,0,0,m.dpr,0,0);c.fillStyle='rgba(255,255,255,.94)';c.fillRect(20,m.H-90,m.W-40,75);
   c.font=`${m.W>m.H?22:24}px WB Hand`;c.fillStyle='#24232b';c.textAlign='center';
   const words=text.split(/\s+/),rows:string[]=[];let row='';for(const word of words){let n=(row?row+' ':'')+word;if(c.measureText(n).width>m.W-60&&row){rows.push(row);row=word;}else row=n;}if(row)rows.push(row);
   rows.slice(0,2).forEach((s,j)=>c.fillText(s,m.W/2,m.H-60+j*28));}
 }
}
