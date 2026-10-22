// Quản trị → Nhóm AI. One status bar on top, then four tabs: the sessions (list + the chosen one),
// giving work, the members, and settings & Telegram. Private data comes only from authenticated
// admin endpoints. All model text uses textContent.
// icons and ready-made agents for Faciup Live (the page shows name, colour and icon, never the prompt)
const LIVE_ICONS=[['','Theo vai trò'],['coordinator','Điều phối'],['target','Mục tiêu'],['search','Kính lúp'],['pen','Bút'],['check','Duyệt'],['news','Radar tin'],['design','Bảng màu'],['mega','Loa'],['chart','Biểu đồ'],['video','Máy quay'],['spark','Tia sáng'],['zalo','Tin nhắn']];
const PRESETS=[
 ['news','Săn tin','news','#ea580c','Săn tin và xu hướng từ dữ kiện được cung cấp: chọn tin đáng làm nội dung, nêu góc khai thác, độ nóng và điểm cần kiểm chứng. Không tự nhận đã tra cứu web, không bịa nguồn.'],
 ['design','Thiết kế','design','#db2777','Đề xuất hình ảnh cho nội dung: bố cục, màu, phong cách, ý tưởng thumbnail và mô tả ảnh cho từng cảnh/kênh; giữ đúng nhận diện thương hiệu.'],
];
// ready-made briefs for the "give work" tab
const BRIEFS=[
 ['Kịch bản video ngắn','Viết kịch bản video ngắn 45–60 giây về chủ đề: … Người xem: … Mục tiêu: … Cần hook 3 giây đầu, lời đọc từng cảnh và gợi ý hình ảnh.'],
 ['Bài đăng mạng xã hội','Soạn bộ bài đăng cho Facebook, TikTok và Zalo OA về: … Giọng thương hiệu, lời kêu gọi hành động rõ ràng, kèm gợi ý ảnh.'],
 ['Ý tưởng series','Đề xuất series 5 video về: … Mỗi tập: tiêu đề, góc khai thác, hook và lý do người xem sẽ xem tiếp.'],
 ['Rà soát nội dung','Rà soát và góp ý nội dung sau (độ rõ, độ dài, rủi ro, lời kêu gọi): …'],
];
const STATE={answered:'Trợ lý đã trả lời',delegating:'Đang phân công',queued:'Đang xếp hàng',running:'Đang làm',pending:'Chờ duyệt',approved:'Đã duyệt',revision:'Chờ chỉnh sửa',rejected:'Đã từ chối',paused:'Tạm dừng',cancelled:'Đã hủy'};
const TONE={answered:'done',delegating:'run',queued:'wait',running:'run',pending:'review',approved:'done',revision:'review',rejected:'off',paused:'wait',cancelled:'off'};
const GROUPS=[['all','Tất cả',()=>true],['run','Đang chạy',s=>['queued','running','delegating','paused'].includes(s)],['review','Chờ duyệt',s=>['pending','revision'].includes(s)],['done','Đã xong',s=>['approved','rejected','cancelled','answered'].includes(s)]];
const vnTime=t=>new Date(t||Date.now()).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});

export async function showCouncil({h,api,body,toast,fail}) {
  const data=await api('/api/admin/council'),c=data.config;
  let tab=sessionStorage.getItem('ct-tab')||'sessions',filter='all',query='',selectedJob='',poll=null,dirty=false,editing=0;
  const field=(title,node,hint)=>h('label',{class:'field ct-field'},h('span',{},title),node,hint?h('small',{class:'muted'},hint):null);
  const input=(value,set,attrs={})=>h('input',{value:value??'',...attrs,oninput:e=>{set(e.target.value);markDirty();}});
  const area=(value,set,rows=4,attrs={})=>h('textarea',{value:value??'',rows,...attrs,oninput:e=>{set(e.target.value);markDirty();}});
  const toggle=(label,value,set,hint)=>h('label',{class:'ct-toggle'},h('span',{class:'switch'},h('input',{type:'checkbox',checked:!!value,onchange:e=>{set(e.target.checked);markDirty();}}),h('i',{})),h('span',{},h('b',{},label),hint?h('small',{class:'muted'},hint):null));
  const button=(label,fn,cls='ghost small')=>h('button',{type:'button',class:cls,onclick:async e=>{const b=e.currentTarget;b.disabled=true;try{await fn();}catch(error){fail(error);}finally{b.disabled=false;}}},label);
  const call=(path,payload={})=>api('/api/admin/council'+path,{method:'POST',body:payload});
  const plainText=value=>String(value).replace(/\*{3,}/g,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^#{1,6}\s+/gm,'');
  const badge=s=>h('span',{class:'ct-badge t-'+(TONE[s]||'wait')},STATE[s]||s);
  const reload=()=>{clearTimeout(poll);return showCouncil({h,api,body,toast,fail});};

  // ---- one save bar for members and settings
  const saveBar=h('div',{class:'ct-save',hidden:true},h('span',{},'Có thay đổi chưa lưu'),button('Hoàn tác',reload,'ghost small'),button('Lưu thay đổi',async()=>{await api('/api/admin/council/config',{method:'PUT',body:{config:c}});toast('Đã lưu cài đặt Nhóm AI.');dirty=false;await reload();},'small'));
  function markDirty(){dirty=true;saveBar.hidden=false;}

  // ---- status bar
  const count=f=>data.jobs.filter(j=>f(j.status)).length;
  const stat=(n,label,tone,go)=>h('button',{type:'button',class:'ct-stat t-'+tone,onclick:go},h('b',{},String(n)),h('span',{},label));
  const top=h('div',{class:'ct-top'},
    h('label',{class:'ct-power'},h('span',{class:'switch'},h('input',{type:'checkbox',checked:!!c.enabled,'aria-label':'Bật nhóm AI',onchange:async e=>{c.enabled=e.target.checked;try{await api('/api/admin/council/config',{method:'PUT',body:{config:c}});toast(c.enabled?'Đã bật Nhóm AI.':'Đã tắt Nhóm AI.');}catch(error){fail(error);e.target.checked=!c.enabled;c.enabled=!c.enabled;}}}),h('i',{})),h('span',{},h('b',{},'Nhóm AI'),h('small',{},c.enabled?'Đang hoạt động':'Đang tắt'))),
    h('div',{class:'ct-stats'},stat(count(GROUPS[1][2]),'Đang chạy','run',()=>{filter='run';go('sessions');}),stat(count(GROUPS[2][2]),'Chờ duyệt','review',()=>{filter='review';go('sessions');}),stat(`${data.calls}/${c.dailyCalls}`,'Lượt AI hôm nay','wait',()=>go('settings'))),
    h('button',{type:'button',class:'ct-new',onclick:()=>go('assign')},'+ Giao việc'));

  // ---- tabs
  const TABS=[['sessions','Phiên làm việc'],['assign','Giao việc'],['members','Thành viên · '+c.agents.length],['settings','Cài đặt & kết nối']];
  const tabBar=h('div',{class:'ct-tabs',role:'tablist'});
  const panes={sessions:h('div',{class:'ct-pane'}),assign:h('div',{class:'ct-pane'}),members:h('div',{class:'ct-pane'}),settings:h('div',{class:'ct-pane'})};
  function go(next){tab=next;sessionStorage.setItem('ct-tab',tab);paintTabs();if(tab==='sessions')paintList();}
  function paintTabs(){tabBar.replaceChildren(...TABS.map(([k,label])=>h('button',{type:'button',role:'tab','aria-selected':String(k===tab),class:k===tab?'on':'',onclick:()=>go(k)},label)));for(const [k,p] of Object.entries(panes))p.hidden=k!==tab;}

  // ---- sessions: list on the left, the chosen session on the right
  const list=h('div',{class:'ct-list'}),detailBox=h('div',{class:'ct-detail'},h('div',{class:'ct-empty'},h('b',{},'Chọn một phiên bên trái'),h('p',{class:'muted'},'Hoặc bấm “+ Giao việc” để mở phiên mới.')));
  const filters=h('div',{class:'ct-filters'}),search=h('input',{type:'search',placeholder:'Tìm theo tên hoặc nội dung…','aria-label':'Tìm phiên',oninput:e=>{query=e.target.value.toLowerCase();paintList();}});
  function paintList(){
    filters.replaceChildren(...GROUPS.map(([k,label,f])=>h('button',{type:'button',class:'chip'+(filter===k?' on':''),onclick:()=>{filter=k;paintList();}},label+' · '+count(f))));
    const f=GROUPS.find(g=>g[0]===filter)[2],rows=data.jobs.filter(j=>f(j.status)&&(!query||((j.title||'')+' '+j.brief).toLowerCase().includes(query)));
    list.replaceChildren(...(rows.length?rows.map(j=>h('button',{type:'button',class:'ct-item'+(j.id===selectedJob?' on':''),onclick:()=>detail(j.id).catch(fail)},
      h('span',{class:'ct-item-top'},h('b',{},j.title||j.brief.slice(0,80)),badge(j.status)),
      h('small',{class:'muted'},(j.progress?.phase?j.progress.phase+' · ':'')+vnTime(j.created_at)),j.error?h('small',{class:'bad'},j.error.slice(0,90)):null)):[h('p',{class:'muted ct-none'},'Không có phiên nào.')]));
  }
  panes.sessions.append(h('div',{class:'ct-split'},h('aside',{class:'ct-side'},filters,search,list),detailBox));

  async function detail(id){
    selectedJob=id;clearTimeout(poll);
    const r=await api('/api/admin/council/jobs/'+id),job=r.job;
    if(selectedJob!==id||!body.isConnected)return;
    const listed=data.jobs.find(j=>j.id===id);
    if(listed)Object.assign(listed,{title:job.title,brief:job.brief,status:job.status,error:job.error,progress:r.progress});
    else data.jobs.unshift({id,title:job.title,brief:job.brief,status:job.status,created_at:job.created_at});
    paintList();
    const agents=job.snapshot?.agents||[],name=job.title||job.brief.slice(0,90);
    // what can be done now, most important first
    const primary=[],secondary=[];let feedback='';
    if(job.status==='pending')primary.push(button('Duyệt',async()=>{await call('/jobs/'+id+'/decision',{action:'approved'});await detail(id);},'small'),button('Yêu cầu sửa',async()=>{await call('/jobs/'+id+'/decision',{action:'revision'});await detail(id);}),button('Từ chối',async()=>{await call('/jobs/'+id+'/decision',{action:'rejected'});await detail(id);},'ghost small danger'));
    if(job.status==='paused')primary.push(button('Tiếp tục',async()=>{await call('/jobs/'+id+'/resume');await detail(id);},'small'));
    if(job.status==='approved')primary.push(button('Tải nội dung đã duyệt',async()=>{
      const latest=plainText(r.turns.at(-1)?.displayText||r.turns.at(-1)?.text||''),url=URL.createObjectURL(new Blob([name+'\n\n'+latest],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=name.replace(/[<>:"/\\|?*]/g,'-')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'small'));
    if(['paused','queued','running','delegating'].includes(job.status))secondary.push(button('Hủy phiên',async()=>{await call('/jobs/'+id+'/cancel');await detail(id);},'ghost small danger'));
    if(job.error?.includes('chất lượng')||r.turns.some(t=>(t.warnings||[]).length))secondary.push(button('Làm lại từ yêu cầu gốc',async()=>{const next=await call('/jobs/'+id+'/restart');await detail(next.id);}));
    if(r.deliveries.some(x=>x.sent===0&&x.attempts>=4))secondary.push(button('Gửi lại tin Telegram lỗi',async()=>{await call('/jobs/'+id+'/retry-delivery');await detail(id);}));
    if(job.chat_id)secondary.push(button('Cập nhật thẻ Telegram',async()=>{await call('/jobs/'+id+'/progress');toast('Đã cập nhật thẻ Telegram.');}));
    const revise=['revision','approved'].includes(job.status)?h('div',{class:'ct-revise'},field(job.status==='approved'?'Yêu cầu cho phiên bản tiếp':'Cần sửa gì?',h('textarea',{rows:3,oninput:e=>{feedback=e.target.value;}})),
      button(job.status==='approved'?'Làm phiên bản tiếp':'Mở phiên sửa',async()=>{const next=await call('/jobs/'+id+'/revise',{feedback});await detail(next.id);},'small')):null;
    const rename=h('input',{value:name,maxlength:90,'aria-label':'Tên phiên'});
    const w=r.workflow;
    detailBox.replaceChildren(...[
      h('header',{class:'ct-dhead'},h('div',{},h('h2',{},name),h('p',{class:'muted'},vnTime(job.created_at)+(job.snapshot?.assistant?' · Trợ lý chung':' · '+(job.snapshot?.rounds||1)+' vòng thảo luận'))),badge(job.status)),
      w?.action||r.progress?.summary?h('div',{class:'ct-callout t-'+(TONE[job.status]||'wait')},h('b',{},'Bạn cần làm gì'),h('p',{},w?.action||r.progress?.summary)):null,
      primary.length||revise?h('div',{class:'ct-actions'},...primary):null,revise,
      job.error?h('p',{class:'bad'},job.error):null,
      w?h('section',{class:'ct-block'},h('div',{class:'ct-progress'},h('span',{},w.phase),h('small',{},`${w.completed}/${w.total} lượt AI`)),
        h('div',{class:'ct-bar'},(()=>{const i=h('i',{});i.style.width=(w.total?w.completed/w.total*100:0)+'%';return i;})()),
        h('ol',{class:'ct-steps'},...w.steps.map(s=>h('li',{class:'s-'+s.state},h('i',{}),h('div',{},h('b',{},(s.round?'Vòng '+s.round+' · ':'')+s.label),h('small',{class:'muted'},s.description))))),
        w.retryAt?h('p',{class:'muted'},'Tự thử lại lúc '+vnTime(w.retryAt)):null):null,
      h('details',{class:'ct-block'},h('summary',{},'Nhiệm vụ đã giao'),h('p',{class:'ct-brief'},job.brief)),
      r.turns.length?h('section',{class:'ct-block'},h('h3',{},'Kết quả từng lượt'),...r.turns.map(t=>h('details',{class:'ct-turn',open:t===r.turns.at(-1)},h('summary',{},h('b',{},agents.find(a=>a.id===t.agent_id)?.name||t.agent_id),h('small',{class:'muted'},` · Lượt ${(t.step??r.turns.indexOf(t))+1} · ${t.provider}/${t.model}`)),
        ...(t.warnings||[]).map(x=>h('p',{class:'bad'},'Cần rà soát: '+x)),h('div',{class:'council-text'},t.displayText??plainText(t.text))))):null,
      h('details',{class:'ct-block ct-more'},h('summary',{},'Thêm: đổi tên, phân công, chẩn đoán, Telegram'),
        h('div',{class:'ct-row'},rename,button('Lưu tên',async()=>{await call('/jobs/'+id+'/rename',{title:rename.value});await detail(id);})),
        secondary.length?h('div',{class:'ct-actions'},...secondary):null,
        h('h4',{},'Phân công'),h('ol',{},...(job.snapshot?.assistant?agents.slice(0,1):[...agents.slice(1),agents[0]].filter(Boolean)).map(a=>h('li',{},h('b',{},a.name+': '),String(a.prompt||'').replace(/\s+/g,' ').slice(0,160)))),
        h('h4',{},'Thứ tự mô hình'),...(r.routing||[]).map(route=>h('p',{},h('b',{},(agents.find(a=>a.id===route.agent)?.name||route.agent)+': '),route.plan.length?route.plan.map(m=>m.provider+'/'+m.model).join(' → '):'Chưa có mô hình sẵn sàng.',...route.skipped.map(m=>h('small',{class:'muted ct-skip'},'Bỏ qua '+m.provider+(m.model?'/'+m.model:'')+': '+m.reason)))),
        (r.attempts||[]).length?h('div',{},h('h4',{},'Lỗi mô hình'),...r.attempts.map(a=>h('p',{class:'muted'},vnTime(a.created_at)+' · Lượt '+(a.step+1)+' · '+a.provider+'/'+a.model+' — '+a.reason))):null,
        h('h4',{},'Tin Telegram'),h('p',{class:'muted'},'Đã gửi '+r.deliveries.filter(x=>x.sent===1).length+'/'+r.deliveries.length+(r.deliveries.some(x=>x.sent===0&&x.attempts>=4)?' · có tin gửi thất bại':''))),
      h('div',{class:'ct-foot'},button('Làm mới',()=>detail(id)))].filter(Boolean));
    const refresh=()=>{if(!body.isConnected||selectedJob!==id||tab!=='sessions')return;if(detailBox.contains(document.activeElement)&&['INPUT','TEXTAREA'].includes(document.activeElement.tagName))poll=setTimeout(refresh,12000);else detail(id).catch(fail);};
    if(['queued','running','pending','delegating'].includes(job.status))poll=setTimeout(refresh,12000);
    if(innerWidth<900)detailBox.scrollIntoView({block:'start',behavior:'smooth'});
  }

  // ---- give work
  let brief='',title='';
  const briefBox=h('textarea',{rows:6,placeholder:'Mô tả việc cần làm: chủ đề, người xem, kênh đăng, mục tiêu…',oninput:e=>{brief=e.target.value;}});
  const titleBox=h('input',{placeholder:'Ví dụ: Cà phê văn phòng — Tuần 1',maxlength:90,oninput:e=>{title=e.target.value;}});
  const start=async(mode)=>{if(!brief.trim())return toast('Nhập nội dung việc cần làm.');const r=await call('/jobs',mode?{brief,title,mode}:{brief,title});toast(mode?'Trợ lý đã nhận tin.':'Đã mở phiên thảo luận.');briefBox.value=titleBox.value=brief=title='';filter='all';go('sessions');await detail(r.id);};
  panes.assign.append(h('section',{class:'card ct-assign'},
    h('h2',{},'Giao việc cho nhóm'),
    h('div',{class:'chips ct-templates'},h('span',{class:'muted'},'Mẫu nhanh:'),...BRIEFS.map(([label,text])=>h('button',{type:'button',class:'chip',onclick:()=>{briefBox.value=brief=text;briefBox.focus();}},label))),
    field('Tên phiên (không bắt buộc)',titleBox),field('Việc cần làm',briefBox),
    h('div',{class:'ct-actions'},button('Mở phiên thảo luận cả nhóm',()=>start(''),'small'),button('Chỉ hỏi trợ lý chung',()=>start('assistant'))),
    h('p',{class:'muted'},'Nhóm chỉ thảo luận và đề xuất; duyệt không tự đăng bài. Máy chủ vẫn chạy tiếp khi bạn đóng web. Mỗi lượt AI khoảng một phút.'),
    h('details',{},h('summary',{},'Giao việc qua Telegram'),h('p',{class:'muted'},'Trong nhóm Telegram, nhắn “trợ lý ơi” để hiện nút thao tác, hỏi trực tiếp bằng “trợ lý, …” hoặc trả lời tin của bot.'),button('Gửi menu vào Telegram',async()=>{const r=await call('/menu');toast(r.pinned?'Đã gửi và ghim menu.':'Đã gửi menu.');}))));

  // ---- members: cards on the left, the chosen one's settings on the right
  const cards=h('div',{class:'ct-cards'}),editor=h('div',{class:'ct-editor'});
  function paintMembers(){
    cards.replaceChildren(...c.agents.map((a,i)=>{const card=h('button',{type:'button',class:'ct-agent'+(i===editing?' on':''),onclick:()=>{editing=i;paintMembers();}},
      h('i',{class:'ct-dot'}),h('span',{},h('b',{},a.name),h('small',{class:'muted'},(i===0?'Điều phối':'Chuyên gia')+' · '+(a.routing==='custom'?'mô hình riêng':'mô hình chung')+(data.secrets['bot:'+a.id]?' · có bot Telegram':''))));card.firstChild.style.background=a.live?.color||'#8b5cf6';return card;}),
      h('div',{class:'ct-addrow'},button('+ Thêm trợ lý',async()=>{if(c.agents.length>=12)return toast('Tối đa 12 trợ lý.');c.agents.push({id:'agent_'+crypto.randomUUID().slice(0,8),name:'Trợ lý mới',routing:'global',prompt:'Phân tích và phản biện theo chuyên môn được giao.',models:[{provider:'gemini',model:data.freeModels[0]}]});editing=c.agents.length-1;markDirty();paintMembers();}),
        ...PRESETS.filter(([id])=>!c.agents.some(a=>a.id===id)).map(([id,name,icon,color,prompt])=>button('+ '+name,async()=>{if(c.agents.length>=12)return toast('Tối đa 12 trợ lý.');c.agents.push({id,name,routing:'global',prompt,live:{icon,color},models:[{provider:'gemini',model:data.freeModels[0]}]});editing=c.agents.length-1;markDirty();paintMembers();}))));
    const a=c.agents[editing]||c.agents[0],i=c.agents.indexOf(a);if(!a)return;
    const models=h('textarea',{rows:3,value:a.models.map(m=>m.provider+':'+m.model).join('\n'),disabled:a.routing!=='custom','aria-label':'Mô hình riêng',oninput:e=>{a.models=e.target.value.split('\n').filter(x=>x.trim()).map(x=>{const k=x.indexOf(':');return{provider:x.slice(0,k).trim(),model:x.slice(k+1).trim()};});markDirty();}});
    const effective=(data.routing||[]).find(r=>r.agent===a.id);
    const token=h('input',{type:'password',autocomplete:'new-password',placeholder:data.secrets['bot:'+a.id]?'Đã lưu — để trống để giữ':'Không bắt buộc với chuyên gia'});
    const color=h('input',{type:'color',value:a.live?.color||'#7c3aed',class:'ct-color',oninput:e=>{a.live={...a.live,color:e.target.value};markDirty();paintMembers();}});
    editor.replaceChildren(...[h('header',{class:'ct-dhead'},h('div',{},h('h2',{},a.name),h('p',{class:'muted'},i===0?'Điều phối: nhận việc, chia lượt và tổng hợp kết quả':'Chuyên gia · lượt '+i+' trong mỗi vòng')),
      h('div',{class:'ct-row'},i>1?button('↑',async()=>{[c.agents[i-1],c.agents[i]]=[c.agents[i],c.agents[i-1]];editing=i-1;markDirty();paintMembers();}):null,i>0&&i<c.agents.length-1?button('↓',async()=>{[c.agents[i+1],c.agents[i]]=[c.agents[i],c.agents[i+1]];editing=i+1;markDirty();paintMembers();}):null,
        i>0?button('Bỏ',async()=>{if(c.agents.length<=2)return toast('Cần ít nhất 2 trợ lý.');c.agents.splice(i,1);editing=0;markDirty();paintMembers();},'ghost small danger'):null)),
      h('h3',{},'Vai trò'),field('Tên',input(a.name,v=>{a.name=v;})),field('Hướng dẫn riêng',area(a.prompt,v=>{a.prompt=v;},6)),
      h('h3',{},'Hiện trên Faciup Live'),h('div',{class:'ct-grid'},field('Tên hiển thị',input(a.live?.name||'',v=>{a.live={...a.live,name:v.trim()||undefined};},{maxlength:40,placeholder:'Để trống: tên theo vai trò'})),field('Màu',color),
        field('Biểu tượng',h('select',{onchange:e=>{a.live={...a.live,icon:e.target.value||undefined};markDirty();}},...LIVE_ICONS.map(([k,t])=>h('option',{value:k,selected:(a.live?.icon||'')===k},t))))),
      h('h3',{},'Mô hình AI'),toggle('Dùng thứ tự mô hình chung (API & khoá)',a.routing!=='custom',v=>{a.routing=v?'global':'custom';models.disabled=v;},'Bỏ chọn để đặt danh sách riêng, mỗi dòng provider:model (gemini, ollama, openai), tối đa 4.'),models,
      effective?h('p',{class:'muted'},'Đang áp dụng: '+(effective.plan.map(m=>m.provider+'/'+m.model).join(' → ')||'chưa có mô hình sẵn sàng')):null,
      h('h3',{},'Bot Telegram riêng'),h('div',{class:'ct-row'},token,button('Lưu token',async()=>{if(!token.value.trim())return toast('Nhập token mới.');await api('/api/admin/council/token',{method:'PUT',body:{agent:a.id,token:token.value.trim()}});toast('Token đã mã hóa và lưu.');await reload();}),
        data.secrets['bot:'+a.id]?button('Xóa token',async()=>{await api('/api/admin/council/token',{method:'PUT',body:{agent:a.id,token:null}});await reload();},'ghost small danger'):null)].filter(Boolean));
  }
  paintMembers();
  panes.members.append(h('div',{class:'ct-split'},h('aside',{class:'ct-side'},cards),editor));

  // ---- settings & Telegram
  const connection=h('div',{}),pair=h('div',{});
  panes.settings.append(
    h('section',{class:'card ct-set'},h('h2',{},'Vận hành'),
      h('div',{class:'ct-grid'},field('Số vòng thảo luận',input(c.rounds,v=>{c.rounds=Number(v);},{type:'number',min:1,max:3})),field('Trần lượt AI mỗi ngày (UTC)',input(c.dailyCalls,v=>{c.dailyCalls=Number(v);},{type:'number',min:1,max:100}),`Hôm nay đã dùng ${data.calls}. Gồm cả lần lỗi; hết trần sẽ chờ ngày mới.`)),
      field('Kiến thức và giọng thương hiệu',area(c.brand,v=>{c.brand=v;},6),'Cả nhóm đọc phần này trước mỗi việc.')),
    h('section',{class:'card ct-set'},h('h2',{},'Chi phí AI'),
      toggle('Chỉ dùng lựa chọn miễn phí',c.freeOnly,v=>{c.freeOnly=v;},'Chặn OpenAI và mô hình Gemini ngoài danh sách miễn phí.'),
      toggle('Tôi đã kiểm tra tài khoản Gemini/Ollama dùng hạn mức miễn phí',c.freeConfirmed,v=>{c.freeConfirmed=v;},'Tên mô hình không chứng minh tài khoản miễn phí. Không xác nhận khi chưa kiểm tra.'),
      h('p',{class:'muted'},'Gemini miễn phí đã kiểm tra: '+data.freeModels.join(', ')+'. Khoá AI lấy từ mục API & khoá.')),
    h('section',{class:'card ct-set'},h('h2',{},'Telegram'),
      h('ol',{class:'ct-howto'},
        h('li',{},'Tạo bot với @BotFather (/newbot), dán token vào thành viên Điều phối ở tab Thành viên.'),
        h('li',{},'Tạo nhóm riêng chỉ có quản trị tin cậy và thêm bot vào.'),
        h('li',{},'Bấm Kết nối webhook, rồi Tạo mã ghép và gửi lệnh vào nhóm trong 10 phút.'),
        h('li',{},'Tuỳ chọn: thêm bot riêng cho từng chuyên gia.')),
      h('div',{class:'ct-actions'},button('Kết nối webhook',async()=>{await call('/connect');toast('Đã kết nối webhook.');},'small'),
        button('Kiểm tra kết nối',async()=>{const r=await api('/api/admin/council/telegram-status');
          connection.replaceChildren(h('div',{class:'ct-callout t-'+(r.configured&&r.webhookMatches&&r.secretConfigured?'done':'review')},h('b',{},!r.configured?'Chưa có token bot Điều phối':`@${r.username}`),
            r.configured?h('p',{},(r.webhookMatches&&r.secretConfigured?'Webhook đúng.':'Webhook chưa sẵn sàng — bấm Kết nối webhook.')+` Tin đang chờ: ${r.pendingUpdates}.`):null,
            r.configured&&!r.naturalMessagesReady?h('p',{class:'muted'},'Bot chưa nhận tin thường: @BotFather → /setprivacy → Disable, rồi thêm lại bot vào nhóm.'):null,
            r.lastReceivedAt?h('p',{class:'muted'},'Lần cuối nhận tin: '+vnTime(r.lastReceivedAt)):null,r.hasDeliveryError?h('p',{class:'muted'},'Có lỗi giao tin gần đây; kết nối lại webhook.'):null));}),
        button('Tạo mã ghép',async()=>{const r=await call('/pair');pair.replaceChildren(h('p',{},'Gửi nguyên lệnh này vào nhóm trong 10 phút:'),h('code',{class:'ct-code'},r.command));}),
        button('Ngắt ghép tài khoản của tôi',async()=>{await call('/unlink');await reload();},'ghost small danger')),
      connection,pair,h('p',{class:'muted'},data.links.length?`${data.links.length} tài khoản quản trị đã ghép Telegram.`:'Chưa có tài khoản ghép Telegram.')));

  paintTabs();paintList();
  body.replaceChildren(h('div',{class:'ct'},top,tabBar,...Object.values(panes),saveBar));
}
