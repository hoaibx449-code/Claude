const modules=[
 {id:'assistant',name:'Trợ lý AI',short:'Hỏi & tìm',icon:'M5 5h14v11H9l-4 4z M8 9h8M8 12h5',color:'violet',role:'Hỏi đúng. Tìm nhanh.',description:'Trao đổi với trợ lý về cách dùng FACIUP, tìm prompt và chọn giải pháp phù hợp với công việc của bạn.',cadence:'Khi bạn đặt câu hỏi',url:'/tro-giup',action:'Mở trợ giúp'},
 {id:'prompts',name:'Prompt Hunter',short:'Ý tưởng & tri thức',icon:'M6 3h12v18H6z M9 7h6M9 11h6M9 15h4',color:'blue',role:'Biến ý tưởng thành chỉ dẫn.',description:'Khám phá prompt được cộng đồng chia sẻ và phê duyệt. Đọc, sao chép hoặc đóng góp cách làm hữu ích của riêng bạn.',cadence:'Khi có nội dung được phê duyệt',url:'/prompt-hunter',action:'Khám phá prompt'},
 {id:'video',name:'Xưởng video',short:'Sáng tạo & kể chuyện',icon:'M3 5h18v14H3z M10 9l5 3-5 3z',color:'rose',role:'Từ lời mô tả đến câu chuyện.',description:'Mô tả nội dung, hướng hình ảnh và giọng kể mong muốn. Việc dựng video bắt đầu từ dự án bạn tạo; sơ đồ này không tự khởi chạy tác vụ.',cadence:'Theo yêu cầu của bạn',url:'/tao',action:'Tạo video'},
 {id:'community',name:'Cộng đồng',short:'Chia sẻ & kết nối',icon:'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20v-2a6 6 0 0 1 12 0v2 M17 5a3 3 0 0 1 0 6M18 15q4 0 4 5',color:'amber',role:'Thành quả được sẻ chia.',description:'Xem những video được chia sẻ công khai. Nội dung dự án cá nhân và thông tin tài khoản không xuất hiện trên bản đồ này.',cadence:'Khi người dùng chia sẻ công khai',url:'/cong-dong',action:'Xem cộng đồng'},
 {id:'solutions',name:'Giải pháp',short:'Công cụ & tự động hoá',icon:'M12 3l9 5v8l-9 5-9-5V8z M3 8l9 5 9-5M12 13v8',color:'teal',role:'Tìm công cụ cho việc thực tế.',description:'Tập hợp bot, công cụ tự động hoá, skill và tài liệu hướng dẫn. Mỗi giải pháp có thông tin sử dụng và điều kiện truy cập riêng.',cadence:'Khi giải pháp được xuất bản',url:'/kham-pha',action:'Tìm giải pháp'},
 {id:'zalo',name:'Kết nối Zalo',short:'Trò chuyện & nhận ảnh',icon:'M4 4h16v13H9l-5 4z M8 8h8M8 12h5',color:'indigo',role:'Mang công cụ đến cuộc trò chuyện.',description:'Kết nối với bot Zalo để dùng các chức năng được quản trị bật. Ảnh theo lịch chỉ gửi cho người đã đăng ký, theo cấu hình của hệ thống.',cadence:'Theo tin nhắn và lịch đã cài',url:'/zalo',action:'Kết nối Zalo'},
];
function svgIcon(path){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))s.setAttribute(k,v);const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',path);s.append(p);return s;}
export function showLive({h,show,api,footer}){
 let selected='assistant',snapshot=null,stopped=false,inflight=false;
 const time=h('time',{}),date=h('span',{}),updated=h('span',{},'Đang kết nối dữ liệu…');
 const detail=h('section',{class:'fl-detail','aria-label':'Chi tiết nhánh đã chọn'});
 const buttons=new Map(),stats=new Map();
 function state(id){
  if(!snapshot)return 'Chưa nhận dữ liệu';
  if(id==='prompts')return snapshot.counts.prompts+' prompt công khai';
  if(id==='solutions')return snapshot.counts.solutions+' giải pháp công khai';
  if(id==='video')return 'Theo yêu cầu';
  return snapshot.features[id]?'Đã bật tính năng':'Chưa bật tính năng';
 }
 function compactState(id){return state(id).replace(' công khai','').replace(' tính năng','');}
 function select(id){selected=id;for(const [key,b] of buttons){b.setAttribute('aria-pressed',String(key===id));}renderDetail();}
 function renderDetail(){const m=modules.find(x=>x.id===selected),disabled=snapshot&&['assistant','zalo','community'].includes(m.id)&&!snapshot.features[m.id];
  detail.replaceChildren(h('div',{class:'fl-detail-icon fl-'+m.color},svgIcon(m.icon)),h('span',{class:'fl-eyebrow'},'Bên trong hệ sinh thái'),h('h2',{},m.name),h('p',{class:'fl-role'},m.role),h('p',{class:'fl-description'},m.description),h('dl',{class:'fl-facts'},h('div',{},h('dt',{},'Cách hoạt động'),h('dd',{},m.cadence)),h('div',{},h('dt',{},'Dữ liệu hiện tại'),h('dd',{},state(m.id)))),disabled?h('p',{class:'fl-unavailable'},'Tính năng hiện chưa được bật. Bạn có thể khám phá các nhánh khác.'):h('a',{class:'btn fl-action',href:m.url},m.action,h('span',{'aria-hidden':'true'},'↗')));
 }
 const board=h('div',{class:'fl-board'});
 const diagram=document.createElementNS('http://www.w3.org/2000/svg','svg');diagram.setAttribute('viewBox','0 0 640 600');diagram.setAttribute('aria-hidden','true');diagram.setAttribute('preserveAspectRatio','none');diagram.classList.add('fl-wires');
 const positions=[[25,22],[75,22],[84,51],[75,80],[25,80],[16,51]];
 for(const [x,y] of positions){const p=document.createElementNS(diagram.namespaceURI,'path');p.setAttribute('d',`M320 306 Q${x*6.4} 306 ${x*6.4} ${y*6}`);diagram.append(p);}
 board.append(diagram,h('div',{class:'fl-orbit fl-orbit-outer','aria-hidden':'true'}),h('div',{class:'fl-orbit fl-orbit-inner','aria-hidden':'true'}),h('div',{class:'fl-scanner','aria-hidden':'true'}));
 const hub=h('div',{class:'fl-hub'},h('span',{class:'fl-hub-mark','aria-hidden':'true'},svgIcon('M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z')),h('strong',{},'FACIUP'),h('small',{},'Kết nối ý tưởng'));
 board.append(hub);
 modules.forEach((m,i)=>{const status=h('small',{},compactState(m.id));stats.set(m.id,status);const b=h('button',{type:'button',class:'fl-node fl-'+m.color,style:`--nx:${positions[i][0]}%;--ny:${positions[i][1]}%`,'aria-pressed':String(selected===m.id),'aria-label':m.name,onclick:()=>select(m.id)},h('span',{class:'fl-node-icon'},svgIcon(m.icon)),h('span',{class:'fl-node-copy'},h('strong',{},m.name),h('span',{},m.short),status));buttons.set(m.id,b);board.append(b);});
 const refresh=h('button',{type:'button',class:'fl-refresh',onclick:()=>load()},'Làm mới');
 const shell=h('section',{class:'fl-page'},h('header',{class:'fl-heading'},h('div',{},h('p',{class:'fl-eyebrow'},h('span',{class:'fl-status-dot','aria-hidden':'true'}),'BẢN ĐỒ HỆ SINH THÁI'),h('h1',{},'Faciup ',h('span',{},'Live')),h('p',{class:'fl-intro'},'Một góc nhìn. Nhiều khả năng từ AI.')),h('div',{class:'fl-clock'},time,h('span',{},'GIỜ VIỆT NAM · UTC+7'),date)),h('div',{class:'fl-workspace'},h('section',{class:'fl-map','aria-label':'Bản đồ kết nối công cụ FACIUP'},h('div',{class:'fl-map-top'},h('span',{},'KẾT NỐI ĐỂ SÁNG TẠO'),h('span',{class:'fl-map-hint'},'Chọn một nhánh để khám phá')),board,h('p',{class:'fl-map-note'},'Chuyển động minh hoạ kết nối · không phải tiến trình tác vụ')),detail),h('div',{class:'fl-data-bar'},h('div',{},svgIcon('M4 12a8 8 0 1 0 2-5M4 3v5h5'),updated),refresh),h('section',{class:'fl-principles','aria-label':'Cách đọc bản đồ'},h('article',{},h('span',{},'01'),h('h3',{},'Bạn giữ quyền chủ động'),h('p',{},'Chọn công cụ phù hợp rồi bắt đầu từ nhu cầu thực tế của mình.')),h('article',{},h('span',{},'02'),h('h3',{},'Dữ liệu có nguồn rõ ràng'),h('p',{},'Số prompt và giải pháp lấy từ nội dung đã xuất bản, cập nhật mỗi phút khi trang đang mở.')),h('article',{},h('span',{},'03'),h('h3',{},'Riêng tư từ thiết kế'),h('p',{},'Tin nhắn, tài khoản và các tác vụ cá nhân không được hiển thị công khai.'))));
 show(shell,footer());renderDetail();
 const zone=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hour12:false});
 function tick(){const now=new Date();time.textContent=zone.format(now);time.dateTime=now.toISOString();date.textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit'}).format(now);}
 tick();const clock=setInterval(tick,10000);
 async function load(){if(stopped||inflight||document.hidden)return;inflight=true;refresh.disabled=true;
  try{const data=await api('/api/faciup-live');if(stopped)return;snapshot=data;for(const [id,el] of stats)el.textContent=compactState(id);renderDetail();updated.textContent='Dữ liệu công khai · cập nhật '+zone.format(new Date(data.updatedAt))+' · tự làm mới mỗi phút';shell.classList.remove('fl-stale');}
  catch{if(stopped)return;updated.textContent=snapshot?'Chưa làm mới được · đang hiển thị dữ liệu lần trước':'Chưa tải được dữ liệu · bấm Làm mới để thử lại';shell.classList.add('fl-stale');}
  finally{inflight=false;if(!stopped)refresh.disabled=false;}
 }
 load();const poll=setInterval(load,60000);const visible=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;clearInterval(clock);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
}
