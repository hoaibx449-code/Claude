import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imagePromptText,clearDown} from '../web/src/ai.ts';
const image={mime:'image/png',data:'fixture'};
const answer=(text='Chữ trong ảnh',finish='stop')=>Response.json({choices:[{message:{content:JSON.stringify({text,uncertain:false})},finish_reason:finish}]});
test('OCR uses current OpenAI token parameter and reaches a fourth configured model',async()=>{
 const original=globalThis.fetch;clearDown();const seen:string[]=[];
 try{
  globalThis.fetch=async(_url,opts:any)=>{const b=JSON.parse(opts.body);seen.push(b.model);assert.equal(b.max_completion_tokens,12000);assert.equal(b.max_tokens,undefined);assert.equal(b.messages[1].content[1].image_url.detail,'high');return seen.length<4?Response.json({error:{message:'image input unsupported'}},{status:400}):answer();};
  const r=await imagePromptText({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'first',OPENAI_TEXT_FALLBACK:'second,third,fourth',AI_ORDER:'openai'} as any,image);
  assert.equal(r.text,'Chữ trong ảnh');assert.deepEqual(seen,['first','second','third','fourth']);
 }finally{globalThis.fetch=original;clearDown();}
});
test('OCR tries another provider before exhausting text-only fallbacks',async()=>{
 const original=globalThis.fetch;clearDown();const seen:string[]=[];
 try{
  globalThis.fetch=async(url,opts:any)=>{seen.push(String(url).includes('openai')?'openai':'gemini');if(seen.at(-1)==='openai')return Response.json({error:{message:'image unsupported'}},{status:400});const b=JSON.parse(opts.body);assert.equal(b.contents[0].parts[1].inlineData.data,'fixture');return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({text:'Đã đọc',uncertain:true})}]},finishReason:'STOP'}]});};
  const r=await imagePromptText({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'text-only',OPENAI_TEXT_FALLBACK:'other1,other2',GEMINI_API_KEY:'fixture',GEMINI_TEXT_MODEL:'vision',AI_ORDER:'openai,gemini'} as any,image);
  assert.equal(r.text,'Đã đọc');assert.deepEqual(seen,['openai','gemini']);
 }finally{globalThis.fetch=original;clearDown();}
});
test('OCR diagnoses failures without echoing provider secrets and skips refused keys',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [status,pattern] of [[401,/Khoá AI/],[429,/hạn mức/],[400,/Model AI/]] as const){
   clearDown();let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'private-key image-content'}},{status});};
   await assert.rejects(imagePromptText({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'one',OPENAI_TEXT_FALLBACK:'two'} as any,image),(e:any)=>{assert.match(e.message,pattern);assert.doesNotMatch(JSON.stringify(e.extra),/private-key|image-content/);assert.equal(e.extra.ocrAttempts[0].status,status);return true;});
   assert.equal(calls,status===401?1:2);
  }
  clearDown();await assert.rejects(imagePromptText({} as any,image),/Chưa cấu hình/);
 }finally{globalThis.fetch=original;clearDown();}
});
test('OCR never accepts truncated output, but accepts a genuine empty image result',async()=>{
 const original=globalThis.fetch;clearDown();
 try{
  globalThis.fetch=async()=>answer('partial','length');await assert.rejects(imagePromptText({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'one'} as any,image),/chưa hoàn chỉnh/);
  globalThis.fetch=async()=>answer('');assert.equal((await imagePromptText({OPENAI_API_KEY:'fixture',OPENAI_TEXT_MODEL:'one'} as any,image)).text,'');
 }finally{globalThis.fetch=original;clearDown();}
});
