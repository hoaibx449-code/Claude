// Private data comes only from authenticated admin endpoints. All model text uses textContent.
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
  const explanation=h('p',{class:'muted'},'Nhóm chỉ thảo luận và đề xuất. Duyệt không tự đăng bài hay thực hiện. Máy chủ tiếp tục từng lượt khi bạn đóng web hoặc tắt máy. Mỗi lượt AI khoảng một phút; có thể chậm hơn khi dự phòng/hết hạn mức.');
  const agentsBox=h('div',{});
  function renderAgents(){
    agentsBox.replaceChildren(...c.agents.map((agent,index)=>{
      const models=area(agent.models.map(m=>m.provider+':'+m.model).join('\n'),value=>{
        agent.models=value.split('\n').filter(x=>x.trim()).map(x=>{const split=x.indexOf(':');return{provider:x.slice(0,split).trim(),model:x.slice(split+1).trim()};});
      },3);
      models.setAttribute('aria-label','Mô hình của '+agent.name);
      const token=input('',()=>{}, {type:'password',autocomplete:'new-password',placeholder:data.secrets['bot:'+agent.id]?'Đã lưu token — để trống để giữ':'Token bot riêng (không bắt buộc với chuyên gia)'});
      return section((index===0?'Điều phối · ':'Chuyên gia · ')+agent.name,
        field('Tên trợ lý',input(agent.name,v=>agent.name=v)),
        field('Hướng dẫn riêng',area(agent.prompt,v=>agent.prompt=v)),
        field('Mô hình theo thứ tự dự phòng — mỗi dòng provider:model',models),
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
    action('Thêm trợ lý',async()=>{if(c.agents.length>=8)return toast('Tối đa 8 trợ lý.');c.agents.push({id:'agent_'+crypto.randomUUID().slice(0,8),name:'Trợ lý mới',prompt:'Phân tích và phản biện theo chuyên môn được giao.',models:[{provider:'gemini',model:data.freeModels[0]}]});renderAgents();}),
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
        r.hasDeliveryError?h('p',{class:'muted'},'Telegram ghi nhận lỗi giao tin gần đây. Bấm Kết nối webhook rồi gửi lại một lệnh mới; lỗi cũ có thể vẫn còn trong lịch sử Telegram.'):null);
    }),
    action('Tạo mã ghép quản trị',async()=>{const r=await call('/pair');pair.replaceChildren(h('p',{},'Sao chép nguyên lệnh này, gửi vào nhóm riêng đã thêm bot trong 10 phút:'),h('code',{style:'display:block;overflow-wrap:anywhere;white-space:pre-wrap'},r.command),h('p',{},'Tên bot thật đã điền sẵn. Không thay bằng chữ username_bot. Mã ghép là bí mật tạm thời; chỉ dùng một lần.'));}),
    action('Ngắt ghép tài khoản của tôi',async()=>{await call('/unlink');await reload();}),
    connection,pair,
    h('p',{},data.links.length?`${data.links.length} tài khoản quản trị đã ghép Telegram.`:'Chưa có tài khoản ghép Telegram.'),
    h('p',{class:'muted'},'Chỉ tài khoản Telegram đã ghép với quản trị còn quyền mới được dùng lệnh hoặc nút duyệt. Đổi token điều phối sẽ xóa các liên kết; cần kết nối và ghép lại.'));
  let brief='';
  let selectedJob='',poll=null;
  const create=section('Giao nhiệm vụ',field('Yêu cầu sáng tạo nội dung đa kênh',area('',v=>brief=v,4)),
    action('Mở phiên thảo luận',async()=>{const r=await call('/jobs',{brief});toast('Đã nhận nhiệm vụ · Phiên #'+r.id);await detail(r.id);status.scrollIntoView({block:'start',behavior:'smooth'});}));
  async function detail(id){
    selectedJob=id;clearTimeout(poll);
    const r=await api('/api/admin/council/jobs/'+id),job=r.job;
    if(selectedJob!==id||!body.isConnected)return;
    const controls=[];
    if(job.status==='pending')for(const [label,decision] of [['Duyệt','approved'],['Yêu cầu sửa','revision'],['Từ chối','rejected']])controls.push(action(label,async()=>{await call('/jobs/'+id+'/decision',{action:decision});await detail(id);}));
    if(job.status==='paused')controls.push(action('Tiếp tục sau khi kiểm tra cấu hình',async()=>{await call('/jobs/'+id+'/resume');await detail(id);}));
    if(['paused','queued','running'].includes(job.status))controls.push(action('Hủy phiên',async()=>{await call('/jobs/'+id+'/cancel');await detail(id);}));
    let feedback='';
    if(job.status==='revision')controls.push(field('Yêu cầu chỉnh sửa',area('',v=>feedback=v)),action('Mở phiên sửa',async()=>{const next=await call('/jobs/'+id+'/revise',{feedback});await detail(next.id);}));
    const agents=job.snapshot?.agents||[],ordered=agents.length?[...agents.slice(1),agents[0]]:[];
    status.replaceChildren(section('Phiên #'+id,h('p',{},r.progress?.summary||'Trạng thái: '+job.status),h('p',{},job.brief),
      section('Phân công trong phiên',h('ol',{},...ordered.map(a=>h('li',{},h('strong',{},a.name+': '),a.prompt.replace(/\s+/g,' ').slice(0,190)))),
        h('p',{},`${job.snapshot?.rounds||1} vòng thảo luận, sau đó tổng biên tập trình quản trị duyệt.`)),
      job.error?h('p',{class:'bad'},job.error):null,
      ...r.turns.map(t=>h('article',{},h('h3',{},`${t.agent_id} · ${t.provider}/${t.model}`),h('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit'},t.text))),
      h('p',{},'Tin Telegram đã gửi: '+r.deliveries.filter(x=>x.sent===1).length+'/'+r.deliveries.length+
        (r.deliveries.some(x=>x.sent===-1)?' · Có tin đã hủy do ngắt ghép/thu hồi quyền.':'')),
      ...controls,action('Cập nhật phiên',()=>detail(id))));
    if(['queued','running','pending'].includes(job.status))poll=setTimeout(()=>{
      if(body.isConnected&&selectedJob===id)detail(id).catch(fail);
    },12000);
  }
  const jobs=section('Lịch sử thảo luận',action('Làm mới danh sách',reload),
    ...data.jobs.map(j=>h('div',{class:'row'},h('span',{},`${j.brief.slice(0,95)} · ${j.status}`),action('Xem phiên',()=>detail(j.id)))));
  body.replaceChildren(settings,telegram,agentsBox,create,jobs,status);
}
