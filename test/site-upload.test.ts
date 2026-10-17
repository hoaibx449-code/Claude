import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync('web/public/admin.js','utf8');
const source=script.slice(script.indexOf('function uploadSiteFile('),script.indexOf('/** A home page picture/video:'));
test('showcase upload infers missing MIME, reports progress and accepts valid completion',async()=>{
 let xhr:any;class Fake{headers:any={};upload:any={};status=200;responseText=JSON.stringify({ref:'site:example.mp4'});open(){}setRequestHeader(k:string,v:string){this.headers[k]=v;}send(){xhr=this;this.upload.onprogress({lengthComputable:true,loaded:5,total:10});this.onload();}}
 const fn=runInNewContext(source+';uploadSiteFile',{XMLHttpRequest:Fake});let progress=0;const result=await fn({size:1000,name:'VIDEO.MP4',type:''},(p:number)=>progress=p);assert.equal(result.ref,'site:example.mp4');assert.equal(xhr.headers['content-type'],'video/mp4');assert.equal(progress,50);assert.equal(xhr.timeout,180000);
});
test('showcase upload rejects oversize files and terminates stalled or malformed responses',async()=>{
 for(const mode of ['timeout','bad']){class Fake{upload={};status=502;responseText='<html>error</html>';open(){}setRequestHeader(){}send(){if(mode==='timeout')(this as any).ontimeout();else(this as any).onload();}}
 const fn=runInNewContext(source+';uploadSiteFile',{XMLHttpRequest:Fake});await assert.rejects(fn({size:1000,name:'a.mp4'}),mode==='timeout'?/3 phút/:/502/);await assert.rejects(fn({size:61*1024*1024,name:'a.mp4'}),/60 MB/);}
});
