import {test} from 'node:test';
import assert from 'node:assert/strict';
import preview from '../web/src/preview.ts';

test('web-demo blocks writes and private routes before contacting production',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected production call');};
  const env={ASSETS:{fetch:async()=>new Response('asset')}} as any;
  try {
    for(const method of ['POST','PUT','PATCH','DELETE']) {
      const response=await preview.fetch(new Request('https://demo.test/api/faciup-live',{method}),env);
      assert.equal(response.status,405);
    }
    for(const path of ['/api/me','/api/admin/settings','/api/faciup-live/mine']) {
      const response=await preview.fetch(new Request('https://demo.test'+path,{headers:{cookie:'session=private',authorization:'Bearer private'}}),env);
      assert.equal(response.status,401);
    }
    assert.equal((await preview.fetch(new Request('https://demo.test/auth/google'),env)).status,405);
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});

test('web-demo serves marked review data without any production request',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Unexpected production call');};
  const env={ASSETS:{fetch:async()=>new Response('asset')}} as any;
  try {
    const response=await preview.fetch(new Request('https://demo.test/api/faciup-live?private=ignored',{headers:{cookie:'session=private',authorization:'Bearer private'}}),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    const body=await response.json() as {preview:boolean;runtime:{agents:unknown[]}};
    assert.equal(body.preview,true);
    assert.equal(body.runtime.agents.length,10);
    const config=await (await preview.fetch(new Request('https://demo.test/api/auth/config'),env)).json() as {clientId:unknown};
    assert.equal(config.clientId,null);
    assert.equal(calls,0);
  } finally {globalThis.fetch=original;}
});
