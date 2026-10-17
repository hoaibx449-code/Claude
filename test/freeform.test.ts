import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {cleanSpec} from '../web/src/spec.ts';
import {designIssues} from '../web/src/creation-policy.ts';
import {buildTimeline,estimateVoice} from '../src/engine/timeline.ts';
import {prepare,renderFrame} from '../src/engine/render.ts';
import {defaultConfig,cleanConfig} from '../web/src/settings.ts';
const graphic=()=>({t:'vector',x:50,y:50,w:30,h:30,color:'#ec4899',fill:true,stroke:3,paths:[[[5,95],[50,5],[95,95],[5,95]]],motion:{dx:15,dy:0,rotate:30,scale:.8}});
const project=()=>({title:'Hình riêng',channel:'',ratio:'9:16',style:'whiteboard',mode:'motion',scenes:[{lines:['Một hình do AI thiết kế và tự chuyển động.'],panels:[],diagram:{kind:'sketch',items:[graphic()]}}]});
test('creative graphics survive persistence and render without any bundled icon or image in both ratios',()=>{
 for(const ratio of ['9:16','16:9']){
  const palette={background:'#ffffff',ink:'#112233',accent:'#ec4899',accent2:'#118877'};
  const spec:any=cleanSpec({...project(),ratio,palette},'u','creative');assert.deepEqual(spec.palette,palette);
  assert.deepEqual(spec.scenes[0].diagram.items[0],graphic());
  const timeline=buildTimeline(spec.scenes,spec.scenes.map((s:any)=>estimateVoice(s.lines)));
  const m=prepare({env:{createCanvas:(w,h)=>createCanvas(w,h) as any},project:spec,timeline,images:[[]],hand:{} as any,dpr:.5,icons:{}});
  assert.ok(m.units[0].length>=2);
  const canvas=createCanvas(m.W*.5,m.H*.5),c=canvas.getContext('2d');
  renderFrame(c,m,timeline.duration*.5,{hand:false});const a=canvas.toBuffer('image/png');
  renderFrame(c,m,timeline.duration*.85,{hand:false});const b=canvas.toBuffer('image/png');assert.ok(!a.equals(b));
 }
});
test('invalid geometry and stock assets trigger AI repair instead of disappearing or falling back',()=>{
 for(const paths of [[],[[[NaN,0],[10,10]]],[[[0,0],[101,0]]],Array(25).fill([[0,0],[1,1]])]){
  const p=project();p.scenes[0].diagram.items[0].paths=paths as any;
  assert.match(designIssues(p,undefined,1,true).join(' '),/vector/);assert.throws(()=>cleanSpec(p,'u','creative'));
 }
 const p:any=project();p.scenes[0].diagram.items=[{t:'icon',name:'heart',x:50,y:50}];assert.match(designIssues(p,undefined,1,true).join(' '),/tài nguyên/);
});
test('menu names are bounded, safely stored and unknown routes are ignored',()=>{
 const base=defaultConfig({} as any),c=cleanConfig({...base,labels:{...base.labels,navigation:{home:'Xưởng phim',evil:'x'},adminMenu:{'nguoi-dung':'Khách hàng'}}},base);
 assert.equal(c.labels.navigation.home,'Xưởng phim');assert.equal(c.labels.navigation.evil,undefined);assert.equal(c.labels.adminMenu['nguoi-dung'],'Khách hàng');assert.equal(c.labels.navigation.tao,base.labels.navigation.tao);
});
