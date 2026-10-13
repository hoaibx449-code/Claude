import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root,'out/commercial-demo'),{recursive:true});
const base=process.env.NV_API_URL || 'http://127.0.0.1:8787';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('This smoke check is for the local development server only.');
const login=await fetch(base+'/api/auth/dev',{method:'POST',headers:{'content-type':'application/json','x-nv':'1'},body:JSON.stringify({consent:true,email:'smoke-'+Date.now()+'@localhost'})});
assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path, data) {
 const r=await fetch(base+path,{method:data?'POST':'GET',headers:{cookie,'x-nv':'1','content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;
}
const made=await api('/api/projects/generate',{source:'mine-free',topic:'Bắt đầu từ một bước nhỏ. Bạn có thể làm ngay hôm nay.',voiceId:'free-female',intro:false,mode:'hand',style:'whiteboard'});
const {job}=await api('/api/projects/'+made.id+'/render',{});
execFileSync(process.execPath,['--env-file='+join(root,'web/.dev.vars'),'--input-type=module','-e','process.env.RUNNER_TTS="mock"; process.argv.push("--once"); await import("./src/cli/runner.ts")'],{cwd:root,env:{...process.env,NV_API_URL:base},stdio:['ignore','pipe','pipe'],timeout:120000});
const {jobs}=await api('/api/projects/'+made.id+'/jobs');
assert.equal(jobs.find(j=>j.id===job.id).status,'done');
const video=await fetch(base+'/api/jobs/'+job.id+'/video',{headers:{cookie}});assert.equal(video.status,200);assert.equal(video.headers.get('content-type'),'video/mp4');
writeFileSync(join(root,'out/commercial-demo/e2e.mp4'),Buffer.from(await video.arrayBuffer()));
const srt=await fetch(base+'/api/jobs/'+job.id+'/srt',{headers:{cookie}});assert.equal(srt.status,200);assert.match(await srt.text(),/Bắt đầu/);
const privateVideo=await fetch(base+'/api/jobs/'+job.id+'/video');assert.equal(privateVideo.status,401);
const range=await fetch(base+'/api/jobs/'+job.id+'/video?inline=1',{headers:{cookie,range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
const deleted=await fetch(base+'/api/projects/'+made.id,{method:'DELETE',headers:{cookie,'x-nv':'1'}}); assert.equal(deleted.status,200);
await api('/api/auth/logout',{});
console.log('PASS local end-to-end: consent login → free script → queue → server renderer → R2 MP4/SRT → private download and byte ranges');
