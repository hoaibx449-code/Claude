import {councilTitle,councilPlain} from './council-present.ts';

type StepState='done'|'working'|'waiting'|'blocked'|'rejected';
const icons:Record<StepState,string>={done:'✅',working:'🔄',waiting:'⏳',blocked:'🔴',rejected:'⛔'};
export function councilWorkflow(job:any,now=Date.now(),enabled=true){
  const c=typeof job.snapshot==='string'?JSON.parse(job.snapshot):job.snapshot;
  const assistant=!!c.assistant,experts=c.agents.slice(1),stages:any[]=[];
  if(assistant)stages.push({label:'Trợ lý chung',description:'Trả lời, hỏi thêm hoặc đề xuất phân công đội ngũ.'});
  else{
    for(let round=1;round<=c.rounds;round++)for(const a of experts)stages.push({label:a.name,description:a.prompt,
      ...(c.rounds>1?{round}: {})});
    stages.push({label:c.agents[0].name,description:'Hoàn thiện bản cuối, kiểm tra đủ yêu cầu và trình bạn duyệt.'});
  }
  const completed=Math.min(job.step,stages.length),deferred=Number(job.next_at)>now;
  const terminal=['approved','rejected','revision','cancelled','answered'].includes(job.status);
  const working=job.status==='running'&&Number(job.lease_until)>now;
  const phase=!enabled&&!terminal?'Nhóm AI đang tắt':({pending:'Chờ bạn duyệt',approved:'Đã duyệt và lưu',rejected:'Đã từ chối',revision:'Chờ yêu cầu chỉnh sửa',
    cancelled:'Đã hủy',answered:'Trợ lý đã trả lời',delegating:'Đang mở phiên cho đội ngũ',paused:'Tạm dừng'} as Record<string,string>)[job.status]||
    (deferred?(job.error?.includes('trần lượt AI')?'Chờ hạn mức ngày mới':'Chờ thử lại'):working?'Đang làm':'Đang xếp hàng');
  const stopped=job.status==='paused'||!enabled||job.status==='cancelled';
  const steps:{label:string;description:string;state:StepState;icon:string;round?:number}[]=[{label:'Tiếp nhận yêu cầu',description:'Đã lưu nhiệm vụ trên máy chủ.',state:'done',icon:icons.done}];
  stages.forEach((s,i)=>{
    const state:StepState=i<completed?'done':i===completed&&stopped?'blocked':i===completed&&working&&!deferred?'working':'waiting';
    steps.push({...s,state,icon:icons[state]});
  });
  if(assistant&&c.proposedBrief){
    const state:StepState=job.status==='answered'?'done':stopped?'blocked':job.status==='delegating'?'working':'waiting';
    steps.push({label:'Phân công đội ngũ',description:'Mở phiên thảo luận riêng; kết quả vẫn chờ bạn duyệt.',state,icon:icons[state]});
  }else if(!assistant){
    const state:StepState=job.status==='approved'?'done':['rejected','revision'].includes(job.status)?'rejected':job.status==='pending'?'working':'waiting';
    steps.push({label:'Bạn duyệt nội dung',description:'Chốt và lưu bản đề xuất; chưa tự đăng bài hoặc thực thi bên ngoài.',state,icon:icons[state]});
  }
  let action='Bạn chưa cần thao tác. Máy chủ sẽ tiếp tục xử lý.';
  if(!enabled&&!terminal)action='Bật nhóm AI và lưu cấu hình trên FACIUP để tiếp tục.';
  else if(job.status==='pending')action='Chọn Duyệt nội dung, Yêu cầu sửa hoặc Từ chối.';
  else if(job.status==='paused')action=job.error?.includes('chất lượng')?'Chọn Làm lại từ yêu cầu gốc trên web; giữ lịch sử cũ để đối chiếu.':'Kiểm tra cấu hình, khóa và hạn mức trên web, rồi bấm Tiếp tục với cấu hình hiện tại.';
  else if(job.status==='revision')action='Gửi yêu cầu chỉnh sửa để mở phiên bản tiếp.';
  else if(job.status==='approved')action='Bản đã được lưu. Bạn có thể tải nội dung hoặc yêu cầu phiên bản tiếp; chưa tự đăng bài.';
  else if(job.status==='answered')action=c.proposedBrief?'Đã mở phiên cho đội ngũ. Chọn Phiên gần đây để theo dõi phiên mới.':'Bạn có thể trả lời tiếp để trò chuyện với trợ lý chung.';
  else if(job.status==='cancelled'||job.status==='rejected')action='Phiên đã kết thúc. Giao nhiệm vụ mới nếu bạn muốn tiếp tục.';
  else if(deferred)action='Bạn chưa cần thao tác. Hệ thống sẽ tự thử lại sau thời điểm chờ, theo lịch xử lý của máy chủ.';
  const current=job.status==='pending'?'Bạn duyệt nội dung':job.status==='delegating'?'Phân công đội ngũ':terminal?'':stages[completed]?.label||'';
  const next=terminal?'':job.status==='pending'?'Chốt bản đã duyệt hoặc mở phiên sửa':job.status==='delegating'?'Các chuyên gia bắt đầu thảo luận':stages[completed+1]?.label||(!assistant?'Bạn duyệt nội dung':'Trả lời bạn');
  return {title:councilTitle(job),phase,completed,total:stages.length,current,next,steps,action,
    blocker:!enabled&&!terminal?'Nhóm AI đang tắt.':job.error||'',retryAt:!terminal&&deferred?Number(job.next_at):0};
}

export function councilWorkflowText(job:any,now=Date.now(),enabled=true){
  const w=councilWorkflow(job,now,enabled),c=typeof job.snapshot==='string'?JSON.parse(job.snapshot):job.snapshot;
  const fresh=job.step===0&&job.status==='queued'&&!job.error;
  const heading=fresh?(c.assistant?'TRỢ LÝ CHUNG ĐÃ NHẬN TIN':'ĐÃ NHẬN NHIỆM VỤ'):'THẺ QUY TRÌNH';
  return councilPlain(`${heading}\nPhiên: ${w.title}\n\nYÊU CẦU\n${job.brief.slice(0,180)}\n\nPHÂN CÔNG VÀ QUY TRÌNH\n`+
    w.steps.map(s=>`${s.icon} ${s.round?'Vòng '+s.round+' · ':''}${s.label.slice(0,52)}`).join('\n')+
    `\n\nTÌNH TRẠNG\n${w.phase} · hoàn tất ${w.completed}/${w.total} lượt AI`+
    (w.current?'\nĐang ở bước: '+w.current:'')+(w.next?'\nTiếp theo: '+w.next:'')+
    (w.blocker?'\nLý do: '+w.blocker.slice(0,450):'')+
    (w.retryAt?'\nThử lại sau: '+new Date(w.retryAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'')+
    '\n\nBẠN CẦN LÀM GÌ\n'+w.action+'\n\nChú thích: ✅ Xong · 🔄 Đang làm · ⏳ Chờ · 🔴 Bị dừng.');
}
