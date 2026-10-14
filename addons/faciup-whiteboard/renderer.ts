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
export function renderFrame(c:any,m:any,t:number){
 let i=m.timeline.scenes.findIndex((s:any)=>t<s.end);if(i<0)i=m.timeline.scenes.length-1;
 c.setTransform(m.dpr*.5,0,0,m.dpr*.5,0,0);
 frame(c,m.designs[i],Math.max(0,t-m.timeline.scenes[i].start),{width:m.W*2,height:m.H*2,
  handImage:m.hand.whiteboardImage,handScale:m.W>m.H?.20:.24,handAnchor:[175,157],footer:false});
}
