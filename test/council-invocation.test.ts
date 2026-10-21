import {test} from 'node:test';
import assert from 'node:assert/strict';
import {councilInvocation} from '../web/src/council-invocation.ts';
test('natural assistant calls open menu locally and preserve explicit questions',()=>{
  for(const phrase of ['Trợ lý ơi!','tro ly oi','Faciup ơi','mở menu trợ lý','Hiện bảng điều khiển nhé','gọi trợ lý','trợ lý ơi, mở menu','trợ lý, cho tôi xem các nút bấm','Trợ lý có đó không?'])
    assert.equal(councilInvocation(phrase).kind,'menu',phrase);
  assert.deepEqual(councilInvocation('Trợ lý ơi, hãy lên kế hoạch 7 ngày.'),{kind:'ask',text:'hãy lên kế hoạch 7 ngày.'});
  for(const report of ['Báo cáo: trợ lý đã hoàn thành tác vụ.','Hôm nay dùng menu trợ lý để xem báo cáo','Doanh số ngày 21/10','/baocao','@Another_bot báo cáo','Trợ lý viên đã gửi báo cáo'])
    assert.equal(councilInvocation(report).kind,'none',report);
});
