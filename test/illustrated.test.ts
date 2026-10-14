import test from 'node:test';import assert from 'node:assert/strict';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {cleanIllustrated,planIllustrated} from '../addons/faciup-illustrated/schema.ts';
import {prepare,renderFrame,cueAt,boxesOf} from '../addons/faciup-illustrated/renderer.ts';
import {composeLook} from '../web/src/compose.ts';import {cleanSpec} from '../web/src/spec.ts';
test('layer prompt/image edits survive cleaning, without copying reference brand or character',()=>{
 const c=composeLook({look:'illustrated',scenes:[{lines:['Nỗi sợ giữ bạn lại.'],x:{illustrated:{headline:'Nỗi sợ',layers:[{role:'metaphor',prompt:'a closed door',cue:'giữ bạn',line:0}]}}}]});
 c.scenes[0].panels[0].prompt='my edited image';c.scenes[0].panels[0].image='r2:img/u/'+ 'a'.repeat(24)+'.png';
 const s=cleanSpec({...c,ratio:'9:16'},'u');assert.equal(s.scenes[0].panels[0].prompt,'my edited image');assert.equal(s.scenes[0].panels[0].image,c.scenes[0].panels[0].image);assert.equal(s.scenes[0].illustrated.headline,'Nỗi sợ');assert(!s.character);assert(!s.channel);assert.equal(s.look,'illustrated');
 assert.equal(cleanIllustrated({layers:[{prompt:''}]}),undefined);assert(!('code' in cleanIllustrated({layers:[{prompt:'door'}],code:'alert(1)'})!));
});
test('cue follows its narration line, layouts stay in frame in both ratios, separate renderer rejects old styles',()=>{
 const d=planIllustrated(['Đừng để nỗi sợ giữ bạn lại.'])!;const sc={lines:['Đừng để nỗi sợ giữ bạn lại.']},st={start:0,end:8,lines:[{start:1,end:7}]};
 assert(cueAt(sc,st,{line:0,cue:'nỗi sợ'})>1);assert.equal(cueAt(sc,st,{line:0,cue:'không có'}),1);
 GlobalFonts.registerFromPath('assets/fonts/BeVietnamPro-ExtraBold.ttf','NV Sans');
 for(const ratio of ['9:16','16:9']){const image=createCanvas(400,400);image.getContext('2d').fillRect(90,30,220,340);const m=prepare({env:{createCanvas},project:{look:'illustrated',ratio,scenes:[{...sc,illustrated:d}],subtitles:true},timeline:{scenes:[st]},images:[[image]],media:{},dpr:1});const cv=createCanvas(m.W,m.H);for(const t of [0,1,4,7.9])renderFrame(cv.getContext('2d'),m,t);assert(cv.toBuffer('image/png').length>1000);for(const b of boxesOf(d,m.W,m.H)){assert(b.x-b.w/2>=0);assert(b.x+b.w/2<=m.W);assert(b.y-b.h/2>=0);assert(b.y+b.h/2<=m.H);}}
 assert.throws(()=>prepare({project:{look:'whiteboard'}}),/chỉ nhận/);
});
