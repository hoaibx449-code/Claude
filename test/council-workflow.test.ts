import {test} from 'node:test';
import assert from 'node:assert/strict';
import {councilDefaults} from '../web/src/council.ts';
import {councilWorkflow,councilWorkflowText} from '../web/src/council-workflow.ts';

test('workflow follows frozen roles, rounds, approval and explicit human action',()=>{
  const snapshot={...councilDefaults(),rounds:2,sessionTitle:'Lịch sử thế giới'};
  const job={snapshot,brief:'Lập kế hoạch 7 ngày',step:3,status:'running',lease_until:2000,next_at:0,error:''};
  const w=councilWorkflow(job,1000);
  assert.equal(w.total,9);assert.equal(w.completed,3);
  assert.equal(w.current,'Phản biện');assert.equal(w.next,'Chiến lược');
  assert.equal(w.steps[4].state,'working');assert.equal(w.steps[5].round,2);
  const pending=councilWorkflow({...job,step:9,status:'pending'},1000);
  assert.equal(pending.current,'Bạn duyệt nội dung');assert.match(pending.action,/Duyệt nội dung/);
  const approved=councilWorkflow({...job,step:9,status:'approved'},1000);
  assert.equal(approved.steps.at(-1)?.state,'done');assert.match(approved.action,/chưa tự đăng bài/);
});

test('workflow explains quota, disabled processing, failed models and general assistant delegation',()=>{
  const job={snapshot:councilDefaults(),brief:'Kế hoạch',step:0,status:'queued',next_at:5000,error:'Đạt trần lượt AI hôm nay'};
  const cap=councilWorkflow(job,1000);
  assert.equal(cap.phase,'Chờ hạn mức ngày mới');assert.equal(cap.retryAt,5000);assert.match(cap.action,/tự thử lại/);
  assert.equal(councilWorkflow(job,1000,false).phase,'Nhóm AI đang tắt');
  assert.match(councilWorkflow({...job,status:'paused'},1000).action,/Tiếp tục/);
  const delegated=councilWorkflow({...job,snapshot:{...job.snapshot,assistant:true,proposedBrief:'Nội dung'},step:1,status:'delegating'},1000);
  assert.equal(delegated.total,1);assert.equal(delegated.current,'Phân công đội ngũ');
  assert.equal(delegated.steps.at(-1)?.state,'working');
  const card=councilWorkflowText({...job,status:'paused'},1000);
  assert.ok(card.length<3400);assert.ok(!card.includes('***'));assert.match(card,/BẠN CẦN LÀM GÌ/);
});
