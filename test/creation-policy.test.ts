import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creationChoice, designIssues, RETIRED_LOOKS } from '../web/src/creation-policy.ts';
import { defaultConfig, publicConfig } from '../web/src/settings.ts';
import { writeScript } from '../web/src/ai.ts';
import { createProject } from '../web/src/worker.ts';

test('release policy rejects retired formats and rule based creation before any external work', async () => {
  for (const look of [...RETIRED_LOOKS, 'classic-diagram', 'classic', 'f:unreviewed', 'vox']) {
    await assert.rejects(createProject({} as any, {} as any, {} as any, {source:'mine-ai',look}), {status:409});
  }
  assert.throws(() => creationChoice({source:'mine-free'}), {status:409});
  assert.equal(creationChoice({source:'topic',look:'auto'}).visual, 'sketch');
  assert.equal(creationChoice({look:'kinetic'}).source, 'mine-ai');
  const c = defaultConfig({} as any); c.visibility = {};
  const pub = publicConfig(c);
  for (const k of RETIRED_LOOKS) assert.equal(pub.visibility['look:'+k], 'hidden');
  assert.deepEqual(pub.templates, []);
  assert.ok(!pub.enabledSources.includes('mine-free'));
});

const scene = () => ({lines:['Bắt đầu nhỏ.'],diagram:{kind:'sketch',items:[{t:'text',text:'Bắt đầu'},{t:'icon',name:'calendar'}]}});
test('missing imagery, duplicate designs and wrong scene counts cannot become successful AI projects', () => {
  assert.ok(designIssues({scenes:[{lines:['Nội dung.']}]}).length);
  assert.ok(designIssues({scenes:[scene(),scene()]}).some(s=>s.includes('lặp')));
  assert.ok(designIssues({scenes:[scene()]},undefined,2).length);
  assert.deepEqual(designIssues({scenes:[scene()]},undefined,1),[]);
  assert.ok(designIssues({scenes:[{lines:['Bắt đầu nhỏ.'],x:{keys:['không có trong lời']}}]},'kinetic').length);
});

test('AI missing credentials or incomplete output fails instead of manufacturing rule based images', async () => {
  const req = {topic:'Thói quen',seconds:15,tone:'',ratio:'9:16',visual:'sketch' as const};
  await assert.rejects(writeScript({} as any,'openai',req),{status:503});
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({choices:[{message:{content:JSON.stringify({scenes:[{lines:['Bắt đầu nhỏ.']}]})}}]});
  try {
    await assert.rejects(writeScript({OPENAI_API_KEY:'fixture-only',OPENAI_TEXT_MODEL:'test'} as any,'openai',req),{status:502});
  } finally { globalThis.fetch = original; }
});
