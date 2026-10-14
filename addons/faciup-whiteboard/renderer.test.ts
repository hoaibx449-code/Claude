import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas,GlobalFonts,loadImage } from '@napi-rs/canvas';
import { prepare,renderFrame } from './renderer.ts';
import { cleanWhiteboard } from './faciup-schema.js';
test('isolated Whiteboard draws both ratios and rejects unrelated jobs',async()=>{
 GlobalFonts.registerFromPath('addons/faciup-whiteboard/assets/PatrickHand-Regular.ttf','WB Hand');
 const whiteboardImage=await loadImage('addons/faciup-whiteboard/assets/hand.png');
 const design={title:'Điều thiết yếu',objects:[{kind:'heart',x:.3,y:.4,label:'Gia đình'},{kind:'clock',x:.7,y:.4,label:'Thời gian'}]};
 for(const ratio of ['9:16','16:9']){
  const project={look:'whiteboard',ratio,scenes:[{whiteboard:design}]},timeline={scenes:[{start:0,end:8}],duration:8};
  const m=prepare({project,timeline,dpr:1,hand:{whiteboardImage}}),cv=createCanvas(m.W,m.H),c=cv.getContext('2d');
  for(const t of [0,.8,2,7.9])renderFrame(c,m,t);
  const pixels=c.getImageData(0,0,m.W,m.H).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<230||pixels[i+1]<230||pixels[i+2]<230)ink++;
  assert(ink>1000);assert(m.designs[0].strokes.length>2);
 }
 assert.throws(()=>prepare({project:{look:'act'}}),/máy dựng cũ/);
 assert.equal(cleanWhiteboard({objects:[{kind:'custom',paths:[{points:[[Infinity,0],[0,1]]}]}]}),null);
});
