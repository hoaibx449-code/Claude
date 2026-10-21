// Private data comes only from authenticated admin endpoints. All model text uses textContent.
// icons and ready-made agents for Faciup Live (the page shows name, colour and icon, never the prompt)
const LIVE_ICONS=[['','Theo vai trò'],['coordinator','Điều phối'],['target','Mục tiêu'],['search','Kính lúp'],['pen','Bút'],['check','Duyệt'],['news','Radar tin'],['design','Bảng màu'],['mega','Loa'],['chart','Biểu đồ'],['video','Máy quay'],['spark','Tia sáng'],['zalo','Tin nhắn']];
const PRESETS=[
 ['news','Săn tin','news','#ea580c','Săn tin và xu hướng từ dữ kiện được cung cấp: chọn tin đáng làm nội dung, nêu góc khai thác, độ nóng và điểm cần kiểm chứng. Không tự nhận đã tra cứu web, không bịa nguồn.'],
 ['design','Thiết kế','design','#db2777','Đề xuất hình ảnh cho nội dung: bố cục, màu, phong cách, ý tưởng thumbnail và mô tả ảnh cho từng cảnh/kênh; giữ đúng nhận diện thương hiệu.'],
];
export async function showCouncil({h,api,body,toast,fail}) {
  const data=await api('/api/admin/council'),c=data.config;
  const section=(title,...children)=>h('section',{class:'card'},h('h2',{},title),...children);
  const field=(title,node)=>h('label',{class:'field'},h('span',{},title),node);
  const input=(value,set,attrs={})=>h('input',{value,...attrs,oninput:e=>set(e.target.value)});
  const area=(value,set,rows=4)=>h('textarea',{value,rows,oninput:e=>set(e.target.value)});
  const toggle=(label,value,set)=>h('label',{class:'check'},h('input',{type:'checkbox',checked:value,onchange:e=>set(e.target.checked)}),label);
  const action=(label,fn)=>h('button',{type:'button',class:'ghost small',onclick:async e=>{
    e.currentTarget.disabled=true;
    try{await fn();}catch(error){fail(error);}finally{e.target.disabled=false;}
  }},label);
  const reload=()=>showCouncil({h,api,body,toast,fail});
  const call=(path,body={})=>api('/api/admin/council'+path,{method:'POST',body});
  const state={answered:'Trợ lý đã trả lời',delegating:'Đang phân công đội ngũ',queued:'Đang xếp hàng',running:'Đang làm',pending:'Chờ duyệt',approved:'Đã duyệt',revision:'Chờ chỉnh sửa',rejected:'Đã từ chối',paused:'Tạm dừng',cancelled:'Đã hủy'};
  const plainText=value=>String(value).replace(/\*{3,}/g,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^#{1,6}\s+/gm,'');
  const explanation=h('p',{class:'muted'},'Nhóm chỉ thảo luận và đề xuất. Duyệt không tự đăng bài hay thực hiện. Máy chủ tiếp tục từng lượt khi bạn đóng web hoặc tắt máy. Mỗi lượt AI khoảng một phút; có thể chậm hơn khi dự phòng/hết hạn mức.');
  const agentsBox=h('div',{});
  function renderAgents(){
    agentsBox.replaceChildren(...c.agents.map((agent,index)=>{
      const models=area(agent.models.map(m=>m.provider+':'+m.model).join('\n'),value=>{
        agent.models=value.split('\n').filter(x=>x.trim()).map(x=>{const split=x.indexOf(':');return{provider:x.slice(0,split).trim(),model:x.slice(split+1).trim()};});
      },3);
      models.setAttribute('aria-label','Mô hình của '+agent.name);
      models.disabled=agent.routing!=='custom';
      const effective=(data.routing||[]).find(r=>r.agent===agent.id);
      const token=input('',()=>{}, {type:'password',autocomplete:'new-password',placeholder:data.secrets['bot:'+agent.id]?'Đã lưu token — để trống để giữ':'Token bot riêng (không bắt buộc với chuyên gia)'});
      return section((index===0?'Điều phối · ':'Chuyên gia · ')+agent.name,
        field('Tên trợ lý',input(agent.name,v=>agent.name=v)),
        h('div',{class:'row'},
          field('Tên hiện trên Faciup Live',input(agent.live?.name||'',v=>{agent.live={...agent.live,name:v.trim()||undefined};},{maxlength:40,placeholder:'Để trống: tên theo vai trò'})),
          field('Màu',input(agent.live?.color||'#7c3aed',v=>{agent.live={...agent.live,color:v};},{type:'color',style:'width:56px;min-width:56px;height:46px;padding:3px;cursor:pointer'})),
          field('Biểu tượng',h('select',{onchange:e=>{agent.live={...agent.live,icon:e.target.value||undefined};}},...LIVE_ICONS.map(([k,t])=>h('option',{value:k,selected:(agent.live?.icon||'')===k},t))))),
        field('Hướng dẫn riêng',area(agent.prompt,v=>agent.prompt=v)),
        toggle('Theo thứ tự và mô hình trong cài đặt API & token',agent.routing!=='custom',v=>{agent.routing=v?'global':'custom';models.disabled=v;}),
        field('Danh sách riêng khi bỏ chọn tùy chọn trên — mỗi dòng provider:model',models),
        h('p',{class:'muted'},'Mặc định dùng thứ tự chung, ví dụ Ollama → Gemini. Khóa thiếu, Ollama cục bộ và lựa chọn bị chính sách miễn phí chặn sẽ được bỏ qua. Danh sách riêng chỉ áp dụng khi bạn bỏ chọn.'),
        effective?h('div',{},h('p',{},'Thứ tự đang áp dụng sau lần lưu gần nhất: '+(effective.plan.map(m=>m.provider+'/'+m.model).join(' → ')||'Chưa có mô hình sẵn sàng.')),
          ...effective.skipped.map(m=>h('p',{class:'muted'},'Bỏ qua '+m.provider+(m.model?'/'+m.model:'')+': '+m.reason))):null,
        h('p',{class:'muted'},'Provider: gemini, ollama, openai. Mỗi trợ lý tối đa 4 mô hình. Chỉ mô hình được chính sách miễn phí cho phép mới được gọi.'),
        field('Token Telegram riêng',token),
        action('Lưu token',async()=>{if(!token.value.trim())return toast('Nhập token mới.');await api('/api/admin/council/token',{method:'PUT',body:{agent:agent.id,token:token.value.trim()}});token.value='';toast('Token đã mã hóa và lưu.');await reload();}),
        action('Xóa token',async()=>{await api('/api/admin/council/token',{method:'PUT',body:{agent:agent.id,token:null}});await reload();}),
        index>0?action('Bỏ trợ lý',async()=>{if(c.agents.length<=2)return toast('Cần ít nhất 2 trợ lý.');c.agents.splice(index,1);renderAgents();}):null);
    }));
  }
  renderAgents();
  const status=h('div',{}),pair=h('div',{}),connection=h('div',{});
  const settings=section('Cài đặt nhóm riêng',explanation,
    toggle('Bật nhóm AI',c.enabled,v=>c.enabled=v),
    toggle('Chỉ dùng lựa chọn miễn phí — chặn OpenAI và mô hình Gemini ngoài danh sách',c.freeOnly,v=>c.freeOnly=v),
    toggle('Tôi đã kiểm tra tài khoản Gemini/Ollama dùng hạn mức miễn phí, không tự nạp tiền',c.freeConfirmed,v=>c.freeConfirmed=v),
    h('p',{class:'muted'},'Tên mô hình không chứng minh tài khoản được miễn phí. Nếu dùng khóa thuộc tài khoản bật tính phí, nhà cung cấp vẫn có thể tính tiền. Không xác nhận khi chưa kiểm tra.'),
    h('p',{},'Danh sách Gemini miễn phí được kiểm tra 21/10/2026: '+data.freeModels.join(', ')+'. Cần thử bằng tài khoản thực tế; quyền truy cập và hạn mức có thể đổi.'),
    field('Trần lượt AI mỗi ngày UTC (gồm lần lỗi)',input(c.dailyCalls,v=>c.dailyCalls=Number(v),{type:'number',min:1,max:100})),
    field('Số vòng thảo luận',input(c.rounds,v=>c.rounds=Number(v),{type:'number',min:1,max:3})),
    field('Kiến thức và giọng thương hiệu',area(c.brand,v=>c.brand=v,6)),
    h('p',{},`Đã gọi ${data.calls}/${c.dailyCalls} lượt hôm nay. Hết trần sẽ chờ ngày UTC kế tiếp.`),
    action('Lưu cấu hình nhóm',async()=>{await api('/api/admin/council/config',{method:'PUT',body:{config:c}});toast('Đã lưu.');await reload();}),
    ...PRESETS.map(([id,name,icon,color,prompt])=>action('Thêm '+name,async()=>{if(c.agents.length>=12)return toast('Tối đa 12 trợ lý.');if(c.agents.some(a=>a.id===id))return toast(name+' đã có trong nhóm.');c.agents.push({id,name,routing:'global',prompt,live:{icon,color},models:[{provider:'gemini',model:data.freeModels[0]}]});renderAgents();toast('Đã thêm '+name+'. Bấm Lưu cấu hình nhóm để áp dụng.');})),
    action('Thêm trợ lý',async()=>{if(c.agents.length>=12)return toast('Tối đa 12 trợ lý.');c.agents.push({id:'agent_'+crypto.randomUUID().slice(0,8),name:'Trợ lý mới',routing:'global',prompt:'Phân tích và phản biện theo chuyên môn được giao.',models:[{provider:'gemini',model:data.freeModels[0]}]});renderAgents();}),
    h('p',{},'Khóa Gemini, OpenAI và Ollama được dùng từ mục API & token hiện có. Nội dung, tài liệu và các ý kiến trước sẽ được gửi đến nhà cung cấp được chọn; không nhập bí mật không được phép chia sẻ.'));
  const telegram=section('Kết nối Telegram',
    h('ol',{},
      h('li',{},'Mở Telegram, tìm @BotFather có dấu xác minh, gửi /newbot và làm theo hướng dẫn. Đặt tên và username kết thúc bằng bot.'),
      h('li',{},'Dán token vào ô của Tổng biên tập bên dưới rồi Lưu token. Không gửi token trong nhóm hoặc chat này.'),
      h('li',{},'Tạo nhóm riêng chỉ có quản trị tin cậy và thêm bot. Ai ở trong nhóm cũng có thể đọc nội dung, dù không được giao nhiệm vụ.'),
      h('li',{},'Bấm Kết nối webhook, rồi Tạo mã ghép quản trị. Sao chép nguyên lệnh được tạo sẵn đúng tên bot và gửi vào nhóm trong 10 phút. Mã chỉ dùng một lần; bot sẽ báo kết quả.'),
      h('li',{},'Tùy chọn: tạo thêm bot cho từng chuyên gia, nhập token tương ứng và thêm vào nhóm. Nếu chưa có, bot điều phối hiển thị tên vai trò.'),
      h('li',{},'Bật nhóm, xác nhận tài khoản miễn phí và lưu cấu hình. Gửi /brief@username_bot yêu cầu sáng tạo.')),
    action('Kết nối webhook',async()=>{await call('/connect');toast('Đã kết nối webhook.');}),
    action('Kiểm tra kết nối Telegram',async()=>{
      const r=await api('/api/admin/council/telegram-status');
      connection.replaceChildren(h('p',{},!r.configured?'Chưa lưu token bot tổng biên tập.':
        `Bot: @${r.username}. ${r.webhookMatches&&r.secretConfigured?'Webhook trỏ đúng Faciup.':'Webhook chưa sẵn sàng — bấm Kết nối webhook.'} Tin đang chờ: ${r.pendingUpdates}.`),
        r.configured?h('p',{},r.naturalMessagesReady?'Bot có quyền nhận tin nhắn thường trong nhóm.':
          'Chưa xác nhận bot nhận được tin thường. Tạm thời dùng Trả lời (Reply) vào tin của bot. Để trò chuyện tự nhiên: mở @BotFather → /setprivacy → chọn bot → Disable; sau đó xóa bot khỏi nhóm và thêm lại theo hướng dẫn Telegram. Không cần cấp quyền quản trị nhóm.' ):null,
        r.configured?h('p',{},r.lastReceivedAt?'Lần cuối web nhận tin của bạn: '+new Date(r.lastReceivedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa ghi nhận tin nhắn quản trị sau bản cập nhật. Nếu gửi mà thời gian này không đổi, Telegram chưa chuyển tin tới web.'):null,
        r.hasDeliveryError?h('p',{class:'muted'},'Telegram ghi nhận lỗi giao tin gần đây. Bấm Kết nối webhook rồi gửi lại một lệnh mới; lỗi cũ có thể vẫn còn trong lịch sử Telegram.'):null);
    }),
    action('Tạo mã ghép quản trị',async()=>{const r=await call('/pair');pair.replaceChildren(h('p',{},'Sao chép nguyên lệnh này, gửi vào nhóm riêng đã thêm bot trong 10 phút:'),h('code',{style:'display:block;overflow-wrap:anywhere;white-space:pre-wrap'},r.command),h('p',{},'Tên bot thật đã điền sẵn. Không thay bằng chữ username_bot. Mã ghép là bí mật tạm thời; chỉ dùng một lần.'));}),
    action('Ngắt ghép tài khoản của tôi',async()=>{await call('/unlink');await reload();}),
    connection,pair,
    h('p',{},data.links.length?`${data.links.length} tài khoản quản trị đã ghép Telegram.`:'Chưa có tài khoản ghép Telegram.'),
    h('p',{class:'muted'},'Chỉ tài khoản Telegram đã ghép với quản trị còn quyền mới được dùng lệnh hoặc nút duyệt. Đổi token điều phối sẽ xóa các liên kết; cần kết nối và ghép lại.'));
  let brief='',title='';
  let selectedJob='',poll=null;
  const jobsList=h('div',{});
  function renderJobs(){
    jobsList.replaceChildren(...data.jobs.map(j=>h('div',{class:'row'},h('div',{},h('strong',{},j.title||j.brief.slice(0,90)),h('p',{class:'muted'},
      `${j.progress?.phase||state[j.status]||j.status} · ${new Date(j.created_at||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`),j.error?h('p',{class:'bad'},j.error):null),action('Xem phiên',()=>detail(j.id)))));
  }
  const create=section('Giao nhiệm vụ',
    h('p',{class:'muted'},'Trong Telegram, nhắn “trợ lý ơi” hoặc “mở menu trợ lý” để hiện nút thao tác. Hỏi trực tiếp bằng “trợ lý, …” hoặc Trả lời (Reply) tin bot. Các tin khác trong nhóm được bỏ qua. Nếu muốn cả đội thảo luận ngay, chọn Mở phiên thảo luận.'),
    field('Tên phiên (có thể để trống để tự đặt)',input('',v=>title=v,{placeholder:'Ví dụ: Cà phê văn phòng — Tuần 1',maxlength:90})),
    field('Yêu cầu sáng tạo nội dung đa kênh',area('',v=>brief=v,4)),
    action('Mở phiên thảo luận',async()=>{const r=await call('/jobs',{brief,title});toast('Đã nhận nhiệm vụ.');await detail(r.id);status.scrollIntoView({block:'start',behavior:'smooth'});}),
    action('Hỏi trợ lý chung',async()=>{const r=await call('/jobs',{brief,title,mode:'assistant'});toast('Trợ lý đã nhận tin.');await detail(r.id);status.scrollIntoView({block:'start',behavior:'smooth'});}),
    action('Mở menu Telegram',async()=>{const r=await call('/menu');toast(r.pinned?'Đã gửi và ghim menu Telegram.':'Đã gửi menu và đăng ký /menu. Bạn có thể tự ghim tin menu trong nhóm.');}));
  async function detail(id){
    selectedJob=id;clearTimeout(poll);
    const r=await api('/api/admin/council/jobs/'+id),job=r.job;
    if(selectedJob!==id||!body.isConnected)return;
    const listed=data.jobs.find(j=>j.id===id);
    if(listed)Object.assign(listed,{title:job.title,brief:job.brief,status:job.status,error:job.error,progress:r.progress});
    else data.jobs.unshift({id,title:job.title,brief:job.brief,status:job.status,created_at:job.created_at});
    renderJobs();
    const controls=[];
    if(job.status==='pending')for(const [label,decision] of [['Duyệt','approved'],['Yêu cầu sửa','revision'],['Từ chối','rejected']])controls.push(action(label,async()=>{await call('/jobs/'+id+'/decision',{action:decision});await detail(id);}));
    if(job.status==='paused')controls.push(action('Tiếp tục với cấu hình hiện tại',async()=>{await call('/jobs/'+id+'/resume');await detail(id);}));
    if(r.deliveries.some(x=>x.sent===0&&x.attempts>=4))controls.push(action('Thử gửi lại tin Telegram bị lỗi',async()=>{await call('/jobs/'+id+'/retry-delivery');await detail(id);}));
    if(['paused','queued','running','delegating'].includes(job.status))controls.push(action('Hủy phiên',async()=>{await call('/jobs/'+id+'/cancel');await detail(id);}));
    if(job.error?.includes('chất lượng')||r.turns.some(t=>(t.warnings||[]).length))controls.push(action('Làm lại từ yêu cầu gốc',async()=>{const next=await call('/jobs/'+id+'/restart');await detail(next.id);}));
    let feedback='';
    if(['revision','approved'].includes(job.status))controls.push(
      job.status==='approved'?h('p',{},'Bản này đã được chốt và lưu. Bạn có thể tải nội dung hoặc làm phiên bản tiếp. Hệ thống chưa tự dựng video hay đăng bài.'):null,
      field(job.status==='approved'?'Yêu cầu cho phiên bản tiếp':'Yêu cầu chỉnh sửa',area('',v=>feedback=v)),action(job.status==='approved'?'Làm phiên bản tiếp':'Mở phiên sửa',async()=>{const next=await call('/jobs/'+id+'/revise',{feedback});await detail(next.id);}));
    const name=job.title||job.brief.slice(0,90),rename=input(name,()=>{},{maxlength:90,'aria-label':'Tên phiên mới'});
    if(job.status==='approved')controls.push(action('Tải nội dung đã duyệt',async()=>{
      const latest=plainText(r.turns.at(-1)?.displayText||r.turns.at(-1)?.text||''),url=URL.createObjectURL(new Blob([name+'\n\n'+latest],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'-')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    if(job.chat_id)controls.push(action('Cập nhật thẻ Telegram',async()=>{await call('/jobs/'+id+'/progress');toast('Đã cập nhật thẻ quy trình Telegram.');await detail(id);}));
    const agents=job.snapshot?.agents||[],ordered=job.snapshot?.assistant?agents.slice(0,1).map(a=>({...a,name:'Trợ lý chung',prompt:'Hỏi đáp, tư vấn, hỏi thêm khi cần và điều phối chuyên gia.'})):agents.length?[...agents.slice(1),agents[0]]:[];
    status.replaceChildren(section(name,h('p',{},r.progress?.summary||state[job.status]||job.status),
      h('details',{},h('summary',{},'Đổi tên phiên'),rename,action('Lưu tên phiên',async()=>{await call('/jobs/'+id+'/rename',{title:rename.value});await detail(id);})),
      h('h3',{},'Nhiệm vụ'),h('p',{},job.brief),
      r.workflow?section('Quy trình vận hành',
        h('p',{},r.workflow.phase+' · Hoàn tất '+r.workflow.completed+'/'+r.workflow.total+' lượt AI'),
        h('progress',{value:r.workflow.completed,max:r.workflow.total,'aria-label':'Số lượt AI hoàn tất',style:'width:100%;accent-color:#16835b'}),
        h('ol',{style:'padding-left:24px'},...r.workflow.steps.map(s=>h('li',{style:'margin:10px 0;padding:10px;border-left:4px solid '+({done:'#16835b',working:'#2563eb',waiting:'#a86b00',blocked:'#c53030',rejected:'#c53030'}[s.state]||'#777')},
          h('strong',{},s.icon+' '+(s.round?'Vòng '+s.round+' · ':'')+s.label),h('p',{class:'muted'},({done:'Đã xong',working:'Đang thực hiện',waiting:'Đang chờ',blocked:'Bị dừng',rejected:'Cần thay đổi'}[s.state])+' · '+s.description)))),
        r.workflow.current?h('p',{},'Đang ở bước: '+r.workflow.current):null,
        r.workflow.next?h('p',{},'Tiếp theo: '+r.workflow.next):null,
        r.workflow.retryAt?h('p',{},'Tự thử lại sau: '+new Date(r.workflow.retryAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})):null,
        h('h3',{},'Bạn cần làm gì'),h('p',{},r.workflow.action),
        r.card?.failures>=4?h('p',{class:'bad'},'Thẻ Telegram gửi thất bại nhiều lần. Kiểm tra kết nối rồi bấm Cập nhật thẻ Telegram.'):null,
        h('p',{class:'muted'},'Thẻ Telegram được cập nhật tại chỗ; từng lần sửa không tạo thông báo mới. Lỗi có thông báo riêng.')):null,
      section('Phân công trong phiên',h('ol',{},...ordered.map(a=>h('li',{},h('strong',{},a.name+': '),a.prompt.replace(/\s+/g,' ').slice(0,190)))),
        h('p',{},job.snapshot?.assistant?'Trợ lý chung hỏi đáp, tư vấn và phân công khi cần. Chưa thực thi bên ngoài.':`${job.snapshot?.rounds||1} vòng thảo luận, sau đó tổng biên tập trình quản trị duyệt.`)),
      job.error?h('p',{class:'bad'},job.error):null,
      h('details',{},h('summary',{},'Chẩn đoán mô hình'),section('Thứ tự mô hình và các lựa chọn bị bỏ qua',
        h('p',{class:'muted'},'Mô hình được gọi theo thứ tự bên dưới. Tiếp tục sẽ cập nhật cấu hình mô hình của trợ lý, giữ nguyên các lượt đã hoàn tất.'),
        ...(r.routing||[]).map(route=>h('div',{},h('strong',{},(agents.find(a=>a.id===route.agent)?.name||route.agent)+' · '+(route.routing==='global'?'Theo cài đặt chung':'Danh sách riêng')),
          h('p',{},route.plan.length?route.plan.map(m=>m.provider+'/'+m.model).join(' → '):'Chưa có mô hình sẵn sàng.'),
          ...route.skipped.map(m=>h('p',{class:'muted'},'Bỏ qua '+m.provider+(m.model?'/'+m.model:'')+': '+m.reason)))))),
      (r.attempts||[]).length?section('Lịch sử lỗi mô hình',...(r.attempts||[]).map(a=>h('p',{},new Date(a.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' · Lượt '+(a.step+1)+' · '+a.provider+'/'+a.model+' — '+a.reason))):null,
      ...r.turns.map(t=>h('article',{style:'margin-top:18px;padding-top:12px;border-top:1px solid var(--line,#ddd)'},h('details',{open:t===r.turns.at(-1)},h('summary',{},`${agents.find(a=>a.id===t.agent_id)?.name||t.agent_id} · Lượt ${(t.step??r.turns.indexOf(t))+1}`),
        h('p',{class:'muted'},`${t.provider} · ${t.model}`),...(t.warnings||[]).map(w=>h('p',{class:'bad'},'Cần rà soát nội dung lịch sử: '+w)),h('div',{class:'council-text',style:'white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:16px;line-height:1.75;letter-spacing:normal'},t.displayText??plainText(t.text))))),
      h('p',{},'Tin Telegram đã gửi: '+r.deliveries.filter(x=>x.sent===1).length+'/'+r.deliveries.length+
        (r.deliveries.some(x=>x.sent===0&&x.attempts>=4)?' · Có tin gửi thất bại sau 4 lần. Kiểm tra token, quyền gửi tin và dùng nút Thử gửi lại.':'')+
        (r.deliveries.some(x=>x.sent===-1)?' · Có tin đã hủy do ngắt ghép/thu hồi quyền.':'')),
      h('details',{},h('summary',{},'Nhật ký gửi Telegram'),...(r.deliveries||[]).map((d,i)=>h('div',{},h('p',{class:'muted'},'Tin '+(i+1)+' · '+(d.sent===1?'Đã gửi':d.sent===-1?'Đã hủy':d.attempts>=4?'Gửi thất bại':'Đang chờ')+' · '+d.attempts+' lần thử'),h('div',{style:'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7'},plainText(d.text||''))))),
      ...controls,action('Cập nhật phiên',()=>detail(id))));
    const refresh=()=>{
      if(!body.isConnected||selectedJob!==id)return;
      if(status.contains(document.activeElement)&&['INPUT','TEXTAREA'].includes(document.activeElement.tagName))poll=setTimeout(refresh,12000);
      else detail(id).catch(fail);
    };
    if(['queued','running','pending','delegating'].includes(job.status))poll=setTimeout(refresh,12000);
  }
  renderJobs();
  const jobs=section('Lịch sử thảo luận',action('Làm mới danh sách',reload),jobsList);
  const setup=h('details',{open:!c.enabled},h('summary',{},'Kết nối và cài đặt nhóm AI'),settings,telegram,agentsBox);
  body.replaceChildren(create,jobs,status,setup);
}
