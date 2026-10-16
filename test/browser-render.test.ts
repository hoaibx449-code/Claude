import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordingType,fittedVoice,subtitleFile} from '../web/public/browser-render.js';
import {estimateVoice,buildTimeline} from '../src/engine/timeline.ts';
import {defaultConfig,cleanConfig,publicConfig} from '../web/src/settings.ts';

test('renderer choice round trips through settings/public config; existing installs remain cloud',()=>{
 const base=defaultConfig({} as any);assert.equal(base.rendering.mode,'cloud');
 for(const mode of ['cloud','local','browser'])assert.equal(publicConfig(cleanConfig({rendering:{mode}},base)).rendering.mode,mode);
 assert.equal(cleanConfig({rendering:{mode:'invalid'}},base).rendering.mode,'cloud');
});
test('browser codec selection never labels WebM as MP4',()=>{
 assert.equal(recordingType(t=>t.includes('webm')),'video/webm;codecs=vp9,opus');
 assert.equal(recordingType(t=>t==='video/mp4'),'video/mp4');
 assert.equal(recordingType(()=>false),'');
});
test('narration timing and SRT follow decoded audio duration instead of preview estimates',()=>{
 const lines=['Đầu tiên đọc sách.','Tiếp theo thực hành.'];const voice=fittedVoice(lines,10,estimateVoice);
 assert.equal(voice.duration,10);assert.ok(voice.lines[1].end>9&&voice.lines[1].end<10);
 const spec={scenes:[{lines,panels:[]}]};const timeline=buildTimeline(spec.scenes,[voice]);
 const srt=subtitleFile(spec,timeline);assert.match(srt,/00:00:00,300/);assert.match(srt,/Đầu tiên đọc sách/);assert.match(srt,/Tiếp theo thực hành/);
 assert.ok(timeline.duration>10);
});


test('browser mode refuses cloud queuing and uploaded audio cannot cross account ownership',async()=>{
 const {queueRender}=await import('../web/src/worker.ts');const {browserVoice}=await import('../web/src/voices.ts');
 const env:any={config:defaultConfig({} as any),DB:{prepare(){throw new Error('must not touch queue');}}};env.config.rendering.mode='browser';
 await assert.rejects(queueRender(env,{} as any,{id:'u'} as any,'p',{}),{status:409});
 await assert.rejects(browserVoice(env,{} as any,{id:'u'} as any,'p',{audio:{voice:'upload',voiceFile:'r2:voice/other/aaa.mp3'}},0),{status:403});
});
