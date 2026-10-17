import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {database} from './support/sqlite.ts';
import {creativeBrief,creativeResult,storedCreative} from '../web/src/creative.ts';
import {defaultConfig} from '../web/src/settings.ts';
import {createProject} from '../web/src/worker.ts';
import {writeScript} from '../web/src/ai.ts';
import {cleanSpec} from '../web/src/spec.ts';

const creative={direction:'Whiteboard pha nhịp VOX',wish:'Giải thích bằng ít chữ, bắt đầu bằng một tình huống và kết bằng một hành động nhỏ.'};
const output=()=>({title:'Bắt đầu nhỏ',mode:'motion',style:'cosmos',approach:'Một câu hỏi mở đầu, rồi làm rõ từng ý bằng chữ ngắn và khoảng trống.',limitations:['Không dùng cảnh quay tư liệu.'],scenes:[{lines:['Bắt đầu nhỏ.'],diagram:{kind:'sketch',items:[{t:'text',text:'Bắt đầu nhỏ',x:50,y:50,size:'xl'}]}}]});
test('creative brief is bounded and its chosen direction does not fix a rendering template',async()=>{
  assert.throws(()=>creativeBrief({wish:'ngắn'}),{status:400});
  assert.equal(creativeBrief({wish:'x'.repeat(3000),direction:'y'.repeat(500)})!.wish.length,2400);
  const dir=mkdtempSync(join(tmpdir(),'creative-')),original=globalThis.fetch;
  try{
    const env:any={DB:database(join(dir,'db.sqlite')),OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'test'};env.config=defaultConfig(env);
    let sys='';globalThis.fetch=async(_url:any,opt:any)=>{sys=JSON.parse(opt.body).messages[0].content;return Response.json({choices:[{message:{content:JSON.stringify(output())}}]});};
    const made=await createProject(env,{log(){}} as any,{id:'u'} as any,{source:'mine-ai',topic:'Bắt đầu nhỏ.',creative,look:'auto'});
    assert.match(sys,/Whiteboard pha nhịp VOX/);assert.ok(sys.includes(creative.wish));
    assert.equal(made.spec.look,undefined);assert.equal(made.spec.mode,'motion');assert.equal(made.spec.style,'cosmos');
    assert.deepEqual(made.spec.scenes[0].lines,['Bắt đầu nhỏ.']);
    const row=await env.DB.prepare('SELECT spec FROM projects WHERE id=?').bind(made.id).first();
    assert.equal(JSON.parse(row.spec).creative.wish,creative.wish);
    assert.equal(cleanSpec(made.spec,'u').creative?.approach,output().approach);
  }finally{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
test('unsupported wishes return an explicit refusal and cannot be turned into a successful fallback',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({cannotFulfill:'Bộ dựng chưa có phim 3D; có thể dùng sơ đồ giải thích.'})}}]});
  try{
    await assert.rejects(writeScript({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'test'} as any,'openai',{topic:'Video',seconds:30,tone:'',ratio:'9:16',visual:'sketch',creative}),{status:422});
  }finally{globalThis.fetch=original;}
  assert.throws(()=>creativeResult({...output(),mode:'real-footage'}),{status:502});
});
test('saved creative instructions and feedback survive normalization without unbounded model metadata',()=>{
  const c=storedCreative({...creative,approach:'Cách dựng',feedback:Array.from({length:9},(_,i)=>'Góp ý '+i),secret:'not stored'});
  assert.equal(c?.feedback.length,5);assert.equal((c as any).secret,undefined);
  assert.equal(c?.feedback[0],'Góp ý 4');
});

test('creative graph mistakes get one AI correction pass rather than a template fallback',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url:any,opt:any)=>{
    calls++;
    if(calls===2)assert.match(JSON.parse(opt.body).messages[1].content,/diagram.kind=sketch/);
    const out=output();
    if(calls===1)(out.scenes[0].diagram as any)={kind:'steps',items:['Bắt đầu']};
    return Response.json({choices:[{message:{content:JSON.stringify(out)}}]});
  };
  try{
    const out=await writeScript({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'test'} as any,'openai',{topic:'Thói quen',seconds:20,tone:'',ratio:'9:16',visual:'sketch',creative});
    assert.equal(calls,2);assert.equal(out.scenes[0].diagram.kind,'sketch');
  }finally{globalThis.fetch=original;}
});
