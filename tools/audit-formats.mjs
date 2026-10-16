import {createCanvas,GlobalFonts,loadImage,Path2D} from '@napi-rs/canvas';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {prepare,renderFrame,SANS} from '../src/engine/render.ts';
import {buildTimeline,estimateVoice} from '../src/engine/timeline.ts';
import {setPeeps} from '../src/engine/act/peeps.ts';
globalThis.Path2D=Path2D;setPeeps(JSON.parse(readFileSync('assets/peeps/peeps.json','utf8')));
GlobalFonts.registerFromPath('assets/fonts/BeVietnamPro-ExtraBold.ttf',SANS);
const demos=JSON.parse(readFileSync('web/public/demos.json','utf8')).filter(d=>d.look&&!['whiteboard','illustrated'].includes(d.look));
const icons=JSON.parse(readFileSync('assets/icons/tabler.json','utf8'));
const output=process.argv[2]||'out/audit';mkdirSync(output,{recursive:true});
const results=[];
for(const ratio of ['9:16','16:9']){
 const cw=ratio==='9:16'?230:360,ch=ratio==='9:16'?435:235;
 const sheet=createCanvas(cw*4,ch*Math.ceil(demos.length/4));const c=sheet.getContext('2d');c.fillStyle='#e5eaf0';c.fillRect(0,0,sheet.width,sheet.height);
 for(const [i,d] of demos.entries()){
  const x=i%4*cw,y=Math.floor(i/4)*ch;c.fillStyle='#17283d';c.font='16px '+SANS;c.fillText(d.look+' · '+ratio,x+10,y+22);
  try{
   const project={...d.spec,ratio};const timeline=buildTimeline(project.scenes,project.scenes.map(s=>estimateVoice(s.lines)));
   const images=await Promise.all(project.scenes.map(s=>Promise.all((s.panels||[]).map(async p=>p.image?.startsWith('doodle:')?loadImage('assets/doodles/'+p.image.slice(7)+'.svg'):null))));
   const model=prepare({project,timeline,env:{createCanvas:(w,h)=>createCanvas(w,h)},dpr:.5,images,icons,hand:{}});
   const frame=createCanvas(Math.round(model.W*.5),Math.round(model.H*.5));for (const scene of timeline.scenes) for (const t of [scene.start, (scene.start+scene.end)/2, scene.end-.05]) renderFrame(frame.getContext('2d'),model,t,{hand:false});
   renderFrame(frame.getContext('2d'),model,timeline.scenes[0].end-.3,{hand:false});
   c.drawImage(frame,x+10,y+32,cw-20,ch-42);results.push({look:d.look,ratio,ok:true,scenes:project.scenes.length});
  }catch(e){c.fillText('ERROR: '+e.message.slice(0,20),x+10,y+70);results.push({look:d.look,ratio,ok:false,error:e.message});}
 }
 writeFileSync(output+'/formats-'+ratio.replace(':','-')+'.png',sheet.toBuffer('image/png'));
}
writeFileSync(output+'/formats.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
