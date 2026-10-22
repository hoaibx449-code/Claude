// Faciup Live: a fixed-camera office and an alternate 24-hour dial.
// Robots, handovers and KPIs use public runtime data from /api/faciup-live.
// No task briefs, model settings or credentials are exposed here.
const NS='http://www.w3.org/2000/svg';
const BADGE={
 target:'<circle r="4.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle r="1.6" fill="#fff"/>',
 search:'<circle cx="-.8" cy="-.8" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M1.6 1.6l2.6 2.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
 pen:'<path d="M-3.5 3.5l1-3 4.5-4.5 2 2-4.5 4.5z" fill="#fff"/>',
 check:'<path d="M-3.5 0l2.4 2.4 4.6-4.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
 news:'<circle r="4.6" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M0 0l-3.3-2.6A4.6 4.6 0 0 1 0-4.6z" fill="#fff"/>',
 design:'<circle cx="-2" cy="-1.5" r="1.4" fill="#fde047"/><circle cx="1.8" cy="-2" r="1.4" fill="#60a5fa"/><circle cx="2" cy="1.8" r="1.4" fill="#f472b6"/><circle cx="-1.8" cy="2" r="1.4" fill="#4ade80"/>',
 zalo:'<text y="3.4" font-size="9" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif">Z</text>',
 mega:'<path d="M-4-1.5h2l4-2.5v8l-4-2.5h-2z" fill="#fff"/>',
 chart:'<path d="M-4 4V1M0 4V-3M4 4V-1" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
 video:'<rect x="-4.5" y="-3" width="6.5" height="6" rx="1.5" fill="#fff"/><path d="M2.5-1l2.5-1.6v5.2L2.5 1z" fill="#fff"/>',
 spark:'<path d="M0-4.6l1.2 3.4 3.4 1.2-3.4 1.2L0 4.6l-1.2-3.4-3.4-1.2 3.4-1.2z" fill="#fff"/>',
 coordinator:'<circle r="2.2" fill="#fff"/><circle r="4.6" fill="none" stroke="#fff" stroke-width="1.4"/>',
};
// server state → how a robot looks
const LOOK={running:'work',live24:'live24',queued:'wait',retry:'wait',review:'review',paused:'paused',disabled:'off',idle:'idle',unknown:'off'};
// chairs round the table, in table half-widths/heights
const SEATS=[[218,181],[414,80],[705,215],[327,306],[662,334]];
const pad=n=>String(n).padStart(2,'0');
const fmt=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+pad(s%60);};
const vn=t=>{const d=new Date(t+7*3600e3);return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());};
const tint=(c,k)=>{const n=parseInt(c.slice(1),16),m=v=>Math.round(v+(255-v)*k);return '#'+[n>>16,n>>8&255,n&255].map(v=>pad(m(v).toString(16))).join('');};
function robot(c,badge,id){const lt=tint(c,.45);return `<svg viewBox="0 0 58 70" aria-hidden="true"><defs><radialGradient id="flh${id}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#f4effc"/><stop offset="1" stop-color="#ddd0f3"/></radialGradient><radialGradient id="flb${id}" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="${lt}"/><stop offset="1" stop-color="${c}"/></radialGradient></defs>
 <circle class="fl-glow" cx="29" cy="28" r="28" fill="${c}" opacity=".18"/>
 <line x1="29" y1="9" x2="29" y2="3" stroke="#cbbfe6" stroke-width="2.4" stroke-linecap="round"/><circle cx="29" cy="3" r="3.4" fill="${c}"/><circle cx="28" cy="2" r="1.1" fill="#fff" opacity=".8"/>
 <rect x="4" y="18" width="7" height="13" rx="3.5" fill="${c}"/><rect x="47" y="18" width="7" height="13" rx="3.5" fill="${c}"/>
 <rect x="8" y="8" width="42" height="34" rx="16" fill="url(#flh${id})" stroke="#e3d8f7"/>
 <rect x="13" y="15" width="32" height="20" rx="10" fill="#241441"/>
 <ellipse class="fl-eye" cx="22.5" cy="24.5" rx="3.2" ry="3.8" fill="#7dd3fc"/><ellipse class="fl-eye" cx="35.5" cy="24.5" rx="3.2" ry="3.8" fill="#7dd3fc"/>
 <circle cx="23.6" cy="23.2" r="1.1" fill="#fff"/><circle cx="36.6" cy="23.2" r="1.1" fill="#fff"/>
 <path d="M25 30.5q4 2.6 8 0" stroke="#7dd3fc" stroke-width="1.6" fill="none" stroke-linecap="round"/>
 <ellipse cx="16" cy="32" rx="3" ry="1.6" fill="#f9a8d4" opacity=".7"/><ellipse cx="42" cy="32" rx="3" ry="1.6" fill="#f9a8d4" opacity=".7"/>
 <rect x="15" y="43" width="28" height="21" rx="10" fill="url(#flb${id})"/>
 <g transform="translate(29 53.5)">${BADGE[badge]||BADGE.spark}</g>
 <rect x="9" y="46" width="6" height="11" rx="3" fill="url(#flb${id})"/><rect x="43" y="46" width="6" height="11" rx="3" fill="url(#flb${id})"/></svg>`;}
const DOC='<svg viewBox="0 0 30 24" aria-hidden="true"><path d="M1 3h10l3 3h15v17H1z" fill="#f59e0b"/><rect x="1" y="8" width="28" height="15" rx="2.5" fill="#fcd34d"/><path d="M7 15h16" stroke="#b45309" stroke-width="2"/></svg>';
const ZALO='<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="10" fill="#0878ff"/><path d="M7 8h18v14H14l-6 4 1-5H7z" fill="#fff"/><text x="16" y="18" text-anchor="middle" fill="#0878ff" font-size="7.5" font-weight="800" font-family="Arial,sans-serif">Zalo</text></svg>';
// Seated, three-quarter pose. Desk foreground is composited above the torso.


export function showLive({h,show,api,footer,openLogin,zaloLink}){
 let stopped=false,busy=false,data=null,stale=false,raf=0,last=performance.now(),clockSkew=0;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const view='office';
 const svg=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const ang=hr=>hr/24*2*Math.PI-Math.PI/2;
 // the dial (viewBox 1000×1000): night/day halves, hour ticks, orbits, links, the hand
 const orbits=svg('g'),beams=svg('g'),hand=svg('g',{class:'fl-hand'});
 hand.append(svg('circle',{r:16,class:'fl-hand-glow'}),svg('circle',{r:9}));
 const dial=svg('svg',{viewBox:'0 0 1000 1000',class:'fl-dial','aria-hidden':'true'});
 const defs=svg('defs'),halves=svg('linearGradient',{id:'fl-dn',x1:0,y1:0,x2:0,y2:1});
 for(const [o,c] of [['0','var(--fl-night)'],['.5','var(--fl-night)'],['.5','var(--fl-day)'],['1','var(--fl-day)']])halves.append(svg('stop',{offset:o,'stop-color':c}));
 const rim=svg('linearGradient',{id:'fl-rim',x1:0,y1:0,x2:1,y2:1});for(const [o,c] of [['0','#7c3aed'],['.5','#db2777'],['1','#f97316']])rim.append(svg('stop',{offset:o,'stop-color':c}));
 defs.append(halves,rim);dial.append(defs,svg('circle',{cx:500,cy:500,r:462,class:'fl-face'}),svg('circle',{cx:500,cy:500,r:462,class:'fl-rim'}));
 for(let i=0;i<24;i++){const a=ang(i),big=i%3===0,r1=big?412:424;dial.append(svg('line',{x1:500+r1*Math.cos(a),y1:500+r1*Math.sin(a),x2:500+438*Math.cos(a),y2:500+438*Math.sin(a),class:big?'fl-tick fl-tick-big':'fl-tick'}));
  if(big){const t=svg('text',{x:500+384*Math.cos(a),y:500+384*Math.sin(a)+8,class:'fl-hour'});t.textContent=pad(i);dial.append(t);}}
 for(const [y,txt] of [[300,'ĐÊM'],[722,'NGÀY']]){const t=svg('text',{x:500,y,class:'fl-half'});t.textContent=txt;dial.append(t);}
 dial.append(orbits,beams,hand);
 const hub=h('div',{class:'fl-hub'},h('div',{class:'fl-core'},h('b',{},'FACIUP'),h('small',{},'')));
 const now=h('div',{class:'fl-now'},h('i',{}),h('span',{},'Đang kết nối…'));
 const stage=h('section',{class:'fl-stage','aria-label':'Đội AI FACIUP trên mặt đồng hồ 24 giờ'},dial,hub,now);
 const room=h('img',{class:'fl-office-bg',src:'/assets/live-office-integrated.webp',alt:'',width:2054,height:766,decoding:'async'});
 // Robots, chairs and desks share one intact perspective; no sliced foreground compositing.
 // Each seated robot in the picture: its two eyes [x,y,w,h] and two hands [x,y,w,h], in picture pixels.
 const RIG={lead:[[[1007,303,7,13],[1026,297,6,12]],[[1008,351,23,13],[1041,337,16,17]]],
  0:[[[446,300,7,13],[465,294,6,12]],[[440,332,17,11],[477,317,20,15]]],1:[[[853,166,6,13],[871,161,5,12]],[[847,200,20,13],[882,188,12,14]]],
  2:[[[1454,348,6,13],[1472,342,5,13]],[[1459,380,19,12],[1492,371,16,10]]],3:[[[649,465,8,15],[669,471,7,14]],[[618,498,16,10],[639,508,20,9]]],
  4:[[[1373,510,8,14],[1391,502,5,14]],[[1379,545,19,11],[1414,535,15,11]]]};
 const rig=h('div',{class:'fl-rig','aria-hidden':'true'}),rigs={};
 const pct=(v,t)=>(v/t*100).toFixed(3)+'%';
 for(const [key,[eyes,hands]] of Object.entries(RIG)){const g=h('div',{class:'fl-rig-bot'});
  // the eyes: the painted ones are covered by a visor patch and redrawn so they can blink and glance
  eyes.forEach(([x,y,w,hgt],n)=>{const e=h('i',{class:'fl-eye-live'});Object.assign(e.style,{left:pct(x-w*.9,2054),top:pct(y-hgt*.75,766),width:pct(w*1.8,2054),height:pct(hgt*1.5,766)});e.style.setProperty('--d',(n*.04+Math.random()*3).toFixed(2)+'s');g.append(e);});
  // the hands: a cut of the picture itself, lifted and dropped as if typing
  hands.forEach(([x,y,w,hgt],n)=>{const pad=3,X=x-pad,Y=y-pad,W=w+pad*2,H=hgt+pad*2,e=h('i',{class:'fl-hand-live'+(n?' alt':'')});
   Object.assign(e.style,{left:pct(X,2054),top:pct(Y,766),width:pct(W,2054),height:pct(H,766),backgroundSize:`${(2054/W*100).toFixed(2)}% ${(766/H*100).toFixed(2)}%`,backgroundPosition:`${pct(X,2054-W)} ${pct(Y,766-H)}`});g.append(e);});
  rigs[key]=g;rig.append(g);}
 const roles={coordinator:'Tổng hợp kết quả',target:'Lập dàn ý',search:'Tra cứu nguồn',pen:'Soạn lời đọc',check:'Rà soát kịch bản',news:'Lọc tin nóng',design:'Phác thumbnail',mega:'Lên kế hoạch đăng',chart:'Đọc số liệu',video:'Dựng phân cảnh'};
 // while an agent works, a small one-line card floats beside it: role, a blinking caret and a thin progress bar (never the real content)
 function composer(){const el=h('div',{class:'fl-compose','aria-hidden':'true'},h('i',{class:'fl-compose-dot'}),h('b',{}),h('span',{class:'fl-compose-caret'}),h('div',{class:'fl-compose-bar'},h('i',{})));stage.append(el);return el;}
 const deskLayers=[];
 const officeLinks=svg('svg',{class:'fl-office-links',viewBox:'0 0 1000 562.5',preserveAspectRatio:'none','aria-hidden':'true'});
 const leadBot=h('div',{class:'fl-office-lead',role:'img','aria-label':'FACIUP · Điều phối'});
 leadBot.innerHTML='<div class="fl-name"><b>FACIUP</b></div><div class="fl-body">'+robot('#f97316','coordinator','lead')+'</div><div class="fl-seated">'+''+'</div>';
 const leadHands=h('div',{class:'fl-seat-hands fl-lead-hands'});leadHands.hidden=true;
 leadBot.style.setProperty('--c','#f97316');leadBot.style.setProperty('--sprite-x','100%');leadBot.style.setProperty('--sprite-y','100%');stage.prepend(room,rig,officeLinks);room.addEventListener('load',()=>{fitW=0;});stage.append(leadBot,...deskLayers,leadHands);
 const trail=svg('svg',{class:'fl-trail','aria-hidden':'true'});stage.append(trail);
 const log=h('ul',{class:'fl-log'});
 const side=h('aside',{class:'fl-side'},h('div',{class:'fl-panel'},h('h2',{},'Bàn giao gần đây'),log));
 const screen=h('button',{class:'fl-screen',type:'button','aria-label':'Phóng to bảng vận hành',onclick:()=>openDashboard()});stage.append(screen);
 const dialog=h('dialog',{class:'fl-dialog'}),dialogBody=h('div',{});dialog.append(h('button',{type:'button',class:'fl-close',onclick:()=>dialog.close(),'aria-label':'Đóng'},'×'),dialogBody);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const chatTitle=h('h2',{},'Trò chuyện'),chatNote=h('small',{},'Đang kết nối…'),chatStats=h('small',{class:'fl-chat-stats'}),chatMessages=h('div',{class:'fl-messages',role:'log','aria-live':'polite'}),chatStatus=h('p',{class:'fl-chat-status'});
 const chat=h('section',{class:'fl-chat'},chatTitle,chatStats,chatNote,chatMessages,chatStatus);
 const chatHost=h('div',{class:'fl-chat-host',hidden:true},chat);
 // Zalo: a small button in the corner; a light popup shows the newest message for a few seconds
 const zaloBtn=h('button',{class:'fl-zalo-btn',type:'button','aria-label':'Mở hội thoại Zalo',onclick:()=>openChat()}),zaloPop=h('div',{class:'fl-zalo-pop',role:'status','aria-live':'polite'}),zaloBubble=h('div',{class:'fl-zalo-fab'},zaloPop,zaloBtn);
 zaloBtn.innerHTML=ZALO;stage.append(zaloBubble);let zaloSig='',zaloTimer=0;
 function zaloShow(side,label,content,stay){clearTimeout(zaloTimer);zaloPop.className='fl-zalo-pop show '+side;zaloPop.replaceChildren(h('small',{},label),content);if(!stay)zaloTimer=setTimeout(()=>zaloPop.classList.remove('show'),6500);}
 if(zaloLink&&/^https:\/\//.test(zaloLink))chat.append(h('a',{class:'fl-zalo-open',href:zaloLink,target:'_blank',rel:'noopener'},'Nhắn qua Zalo ↗'));
 let personal=null,mineBusy=false,demoStep=0;
 const intro=['Bạn cần hỗ trợ gì? Nhắn mình nhé.','Bạn có thể quan sát hoạt động của đội AI trên màn hình.','Đăng nhập để bắt đầu hội thoại riêng của bạn.'];
 function renderChat(){
  chatNote.textContent=personal?'Zalo riêng · 30 tin gần nhất':'Hội thoại minh họa · Chưa đăng nhập';
  const items=!personal?intro.slice(0,demoStep+1).map(text=>({role:'bot',text})):personal.messages;
  const oldScroll=chatMessages.scrollTop,scroll=chatMessages.scrollHeight-oldScroll-chatMessages.clientHeight<40;
  chatMessages.replaceChildren(...items.map(m=>{const e=h('div',{class:'fl-message '+(m.role==='user'?'me':'bot')},h('span',{},m.text));if(m.role!=='user'){const icon=h('i',{class:'fl-zalo-avatar'});icon.innerHTML=ZALO;e.prepend(icon);}return e;}));
  if(!items.length)chatMessages.append(h('p',{class:'fl-empty'},personal.linked?'Chưa có tin nhắn sau khi liên kết.':'Liên kết Zalo đã xác minh để xem hội thoại của bạn.'));
  if(personal&&!personal.linked)chatMessages.append(h('a',{href:'/zalo'},'Liên kết Zalo'));
  if(!personal)chatMessages.append(h('button',{type:'button',class:'fl-login',onclick:()=>openLogin?.('route',{hash:'/faciup-live'})},'Đăng nhập để trò chuyện'));
  chatStatus.textContent=personal?.processing?'Đang xử lý tin nhắn Zalo…':personal?'Hội thoại riêng · Sẵn sàng hỗ trợ':'Lời giới thiệu tự động · Không phải tin nhắn khách hàng';
  chatMessages.scrollTop=scroll?chatMessages.scrollHeight:oldScroll;
  paintScreen();
  bots.find(b=>b.id==='zalo')?.el.classList.toggle('fl-chatting',!!personal?.processing);
 }
 async function loadMine(){if(stopped||mineBusy||document.hidden)return;mineBusy=true;try{const p=await api('/api/faciup-live/mine');if(stopped)return;personal=p;}catch{personal=null;}finally{mineBusy=false;if(!stopped)renderChat();}}
 function openPanel(title,kids){dialogBody.replaceChildren(h('h2',{},title),...kids);dialog.showModal();}
 function openChat(){openPanel('Hội thoại Zalo của bạn',[chat]);renderChat();}
 function openDashboard(){if(!data)return;const r=data.runtime,k=r.kpi||{};openPanel('Bảng vận hành',[h('p',{},`${r.running} đang xử lý · ${r.queued} chờ lượt · ${r.review} chờ duyệt`),h('p',{},`${k.today||0} lượt hoàn thành hôm nay · TB ${k.avgToday?fmt(k.avgToday):'—'}/lượt`),h('p',{},r.sessions[0]?`Phiên #${r.sessions[0].n} · ${nameOf(r.sessions[0].current)} · ${r.sessions[0].state==='paused'?'Tạm dừng':'Lượt '+(r.sessions[0].step+1)}`:'Sẵn sàng nhận nhiệm vụ')]);}
 // the operations board sits exactly on the wall screen of the office picture: its four corners are
 // mapped onto the screen's four corners (in picture pixels), so the edges line up at any size
 const SCREEN=[[1321,28],[1921,140],[1921,349],[1321,208]],BW=600,BH=250;
 function picture(){const fit=getComputedStyle(room).objectFit,sr=stage.getBoundingClientRect(),ir=room.getBoundingClientRect();if(!ir.width)return null;
  let sx=ir.width/2054,sy=ir.height/766,ox=ir.left-sr.left,oy=ir.top-sr.top;
  if(fit==='contain'||fit==='cover'){const k=(fit==='contain'?Math.min:Math.max)(ir.width/2054,ir.height/766);ox+=(ir.width-2054*k)/2;oy+=(ir.height-766*k)/2;sx=sy=k;}
  return {sx,sy,ox,oy};}
 // the robots' eyes and hands live on a layer laid exactly over the picture
 function fitRig(){const p=picture();if(!p)return;Object.assign(rig.style,{left:p.ox+'px',top:p.oy+'px',width:2054*p.sx+'px',height:766*p.sy+'px'});}
 function fitScreen(){const fit=getComputedStyle(room).objectFit,sr=stage.getBoundingClientRect(),ir=room.getBoundingClientRect();if(!ir.width){fitW=0;return;}
  let sx=ir.width/2054,sy=ir.height/766,ox=ir.left-sr.left,oy=ir.top-sr.top;
  if(fit==='contain'||fit==='cover'){const k=(fit==='contain'?Math.min:Math.max)(ir.width/2054,ir.height/766);ox+=(ir.width-2054*k)/2;oy+=(ir.height-766*k)/2;sx=sy=k;}
  const [p0,p1,p2,p3]=SCREEN.map(([x,y])=>[ox+x*sx,oy+y*sy]);
  const dx1=p1[0]-p2[0],dx2=p3[0]-p2[0],dx3=p0[0]-p1[0]+p2[0]-p3[0],dy1=p1[1]-p2[1],dy2=p3[1]-p2[1],dy3=p0[1]-p1[1]+p2[1]-p3[1],det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det,k2=(dx1*dy3-dx3*dy1)/det,a=p1[0]-p0[0]+g*p1[0],b=p3[0]-p0[0]+k2*p3[0],d=p1[1]-p0[1]+g*p1[1],e=p3[1]-p0[1]+k2*p3[1];
  screen.style.transform=`matrix3d(${[a/BW,d/BW,0,g/BW,b/BH,e/BH,0,k2/BH,0,0,1,0,p0[0],p0[1],0,1].map(v=>+v.toFixed(6)).join(',')})`;}
 let fitW=0,fitH=0;
 const WEEK=['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
 const clockEl=h('b',{class:'fl-bd-time'}),dateEl=h('span',{class:'fl-bd-date'});
 function paintClock(){const d=new Date(Date.now()+clockSkew+7*3600e3);clockEl.replaceChildren(pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()),h('small',{},':'+pad(d.getUTCSeconds())));dateEl.textContent=`${WEEK[d.getUTCDay()]} · ${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;}
 function paintScreen(){if(!data)return;const r=data.runtime,k=r.kpi||{};
  screen.classList.add('fl-board');
  // few, large figures: the board is small on the wall, so only what reads at a glance
  const tile=(n,label,tone)=>h('div',{class:'fl-bd-kpi '+tone},h('b',{},String(n)),h('span',{},label));
  screen.replaceChildren(
   h('div',{class:'fl-bd-left'},h('span',{class:'fl-bd-live'+(stale?' off':'')},h('i',{}),stale?'MẤT KẾT NỐI':'TRỰC TUYẾN'),h('div',{class:'fl-bd-clock'},clockEl,dateEl)),
   h('div',{class:'fl-bd-kpis'},tile(r.running,'Đang xử lý','hot'),tile(r.queued,'Chờ lượt','cool'),tile(r.review,'Chờ duyệt','warm'),tile(k.today||0,'Lượt hôm nay','good')));
  paintClock();
  const items=personal?personal.messages:intro.slice(0,demoStep+1).map(text=>({role:'bot',text}));
  const lastMsg=items.at(-1),sig=lastMsg?lastMsg.role+':'+lastMsg.text:'';
  if(personal?.processing){if(zaloSig!=='typing'){zaloSig='typing';zaloShow('bot','Zalo đang trả lời',h('span',{class:'fl-pop-dots'},h('i',{}),h('i',{}),h('i',{})),true);}}
  else if(sig&&sig!==zaloSig){zaloSig=sig;zaloShow(lastMsg.role==='user'?'me':'bot',lastMsg.role==='user'?'Bạn':personal?'Zalo':'Zalo · minh họa',h('span',{},lastMsg.text.slice(0,140)));}
  zaloBtn.classList.toggle('busy',!!personal?.processing);
 }
 function openAgent(b){const s=b.s,look=stale?'off':LOOK[s.state]||'idle';openPanel(s.name,[h('p',{},tagText(s,look)),h('p',{},`Hoàn thành hôm nay: ${s.completed||0} lượt`),h('p',{},s.last?`Lần hoàn thành gần nhất: ${vn(s.last)}`:'Chưa có lượt hoàn thành được ghi nhận')]);}
 // a soft chime when a file is handed on (browsers allow sound only after the viewer touches the page)
 let soundOn=true,audio=null;try{soundOn=localStorage.getItem('faciup-live-sound')!=='off';}catch{}
 const unlock=()=>{if(!audio&&window.AudioContext)audio=new AudioContext();audio?.resume?.();};
 document.addEventListener('pointerdown',unlock,{once:true});document.addEventListener('keydown',unlock,{once:true});
 function chime(toLead){if(!soundOn||!audio||audio.state!=='running'||document.hidden)return;const t=audio.currentTime;
  (toLead?[659,880,1175]:[880,1320]).forEach((f,n)=>{const o=audio.createOscillator(),g=audio.createGain(),at=t+n*.09;o.type='sine';o.frequency.value=f;o.connect(g);g.connect(audio.destination);
   g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.07,at+.015);g.gain.exponentialRampToValueAtTime(.0001,at+.45);o.start(at);o.stop(at+.5);});}
 const soundBtn=h('button',{type:'button',class:'fl-sound',onclick:()=>{soundOn=!soundOn;unlock();try{localStorage.setItem('faciup-live-sound',soundOn?'on':'off');}catch{}paintSound();if(soundOn)setTimeout(()=>chime(false),60);}});
 function paintSound(){soundBtn.setAttribute('aria-pressed',String(soundOn));soundBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${soundOn?'<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M17 9l5 6M22 9l-5 6"/>'}</svg><span>${soundOn?'Âm thanh bàn giao: bật':'Âm thanh: tắt'}</span>`;}
 paintSound();
 const kpis=h('section',{class:'fl-kpis','aria-label':'Chỉ số hoạt động'});
 const toolbar=h('header',{class:'fl-toolbar'},h('div',{},h('h1',{},'Faciup Live'),h('p',{},'Không gian vận hành của đội AI')),soundBtn);
 const mobileTabs=h('div',{class:'fl-mobile-tabs','aria-label':'Thông tin văn phòng'},...['Hoạt động','Zalo','Chỉ số'].map((text,i)=>h('button',{type:'button','aria-pressed':String(i===0),onclick:e=>{if(i===1){openChat();return;}page.dataset.panel=String(i);mobileTabs.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));}},text)));

 const page=h('div',{class:'fl-live','data-panel':'0'},toolbar,stage,mobileTabs,side,kpis,dialog,chatHost);
 page.dataset.view=view;stage.setAttribute('aria-label','Văn phòng AI FACIUP');officeLinks.append(beams);
 show(page,footer());
 let bots=[],key='';const lastTurn=new Map();
 function build(list){
  const k=list.map(a=>a.id+a.name+a.color+a.icon).join('|');if(k===key){bots.forEach((b,j)=>{b.s=list[j];});return;}key=k;
  const keep=new Map(bots.map(b=>[b.id,b]));orbits.replaceChildren();beams.replaceChildren();links=[];
  const rings=Math.min(3,Math.max(1,Math.ceil(list.length/3)));
  for(let r=0;r<rings;r++)orbits.append(svg('circle',{cx:500,cy:500,r:[190,265,335][r],class:'fl-orbit'}));
  bots=list.map((s,j)=>{const i=j+1,old=keep.get(s.id);keep.delete(s.id);
   const ring=j%rings,o=old?.o||{r:[190,265,335][ring],ph:j/list.length*Math.PI*2,sp:(.16-.03*ring)*(ring%2?-1:1),wob:j};
   let el=old?.el,hands=old?.hands;
   if(!el||old.icon!==s.icon||old.color!==s.color){old?.el.remove();el=h('div',{class:'fl-bot fl-new',role:'img','aria-label':s.name});el.style.setProperty('--c',s.color);
    el.innerHTML=`<div class="fl-name"><b></b><span></span></div><i class="fl-pulse"></i><div class="fl-shadow"></div><div class="fl-body">${robot(s.color,s.icon,j+'_'+s.id.replace(/\W/g,''))}</div><div class="fl-seated"></div>`;
    hands?.remove();hands=h('div',{class:'fl-seat-hands'});stage.append(el,hands);setTimeout(()=>el.classList.remove('fl-new'),900);}
   const sprite=s.id==='zalo'?4:Math.min(j,4);el.style.setProperty('--sprite-x',String(sprite%3*50)+'%');el.style.setProperty('--sprite-y',String(Math.floor(sprite/3)*100)+'%');const bot={id:s.id,i,icon:s.icon,color:s.color,el,hands,o,s,pos:[0,0],v:[500,500],left:false};el.tabIndex=0;el.setAttribute('role','button');el.onclick=()=>openAgent(bot);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAgent(bot);}};return bot;});
  for(const b of keep.values()){b.el.remove();b.hands?.remove();}
  // links: every robot to FACIUP, and each robot to the next one, so the team reads as one network
  bots.forEach((b,j)=>{link(null,b,b.color);if(bots.length>2||j===0&&bots.length===2)link(b,bots[(j+1)%bots.length],b.color);});}
 let links=[];
 function link(a,b,color){const path=svg('path',{class:'fl-link',stroke:color}),dot=svg('circle',{r:a?5:6,class:'fl-spark',fill:color});beams.append(path,dot);links.push({a,b,path,dot,t:Math.random(),sp:a?.18:.28});}
 const bez=(p,c,q,t)=>[(1-t)*(1-t)*p[0]+2*(1-t)*t*c[0]+t*t*q[0],(1-t)*(1-t)*p[1]+2*(1-t)*t*c[1]+t*t*q[1]];
 const centre=()=>view==='office'?[491,245]:[500,500];
 function drawLinks(dt,off){const turn=data?.runtime?.sessions?.[0];
  const [cx,cy]=centre();for(const l of links){const q=l.b.v,p=l.a?l.a.v:(()=>{const d=Math.hypot(q[0]-cx,q[1]-cy)||1,k=view==='office'?26:112;return [cx+(q[0]-cx)/d*k,cy+(q[1]-cy)/d*k];})();
   // bend towards the centre so the web curves round FACIUP
   const m=[(p[0]+q[0])/2,(p[1]+q[1])/2],c=l.a?[m[0]+(cx-m[0])*.35,m[1]+(cy-m[1])*.35]:[m[0]+(q[1]-p[1])*.18,m[1]-(q[0]-p[0])*.18];
   l.path.setAttribute('d',`M${p[0].toFixed(1)} ${p[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
   const work=LOOK[l.b.s.state]==='work'||(l.a&&LOOK[l.a.s.state]==='work'),hand=l.a&&turn&&turn.current===l.a.i&&turn.state==='running';
   l.path.classList.toggle('on',!stale&&(work||hand));
   if(!reduce)l.t=(l.t+dt*l.sp*(work?2.6:off?.3:1))%1;
   // FACIUP links carry work in to the centre; robot-to-robot links pass it along
   const [x,y]=bez(p,c,q,l.a?l.t:1-l.t);l.dot.setAttribute('cx',x.toFixed(1));l.dot.setAttribute('cy',y.toFixed(1));}}
 // robots keep circling: faster while working, slower when the team is off
 function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;const r=stage.getBoundingClientRect(),sc=r.width/1000,sy=view==='office'?r.height/562.5:sc,off=stale||!data?.runtime?.enabled;
  if(r.width&&(r.width!==fitW||r.height!==fitH)){fitW=r.width;fitH=r.height;fitScreen();fitRig();}
  for(const [j,b] of bots.entries()){const look=stale?'off':LOOK[b.s.state]||'idle',k=look==='work'?2.6:off&&!b.s.live?.35:1;
   if(!reduce){b.o.ph+=b.o.sp*dt*k;b.o.wob+=dt*1.4;}
   b.left=b.o.sp>0?Math.sin(b.o.ph)>0:Math.sin(b.o.ph)<0;
   const seat=SEATS[j]||[180+((j-5)%5)*160,535+Math.floor((j-5)/5)*40];
   const x=view==='office'?seat[0]:500+b.o.r*Math.cos(b.o.ph),y=view==='office'?seat[1]:500+b.o.r*Math.sin(b.o.ph)+Math.sin(b.o.wob)*6;b.pos=[x*sc,y*sy];
   b.el.style.transform=`translate(${(x*sc-b.el.offsetWidth/2).toFixed(1)}px,${(y*sy-(view==='office'?0:b.el.offsetHeight*.62)).toFixed(1)}px)`;b.el.style.zIndex=5+Math.round(y/50);
   b.hands.style.transform=b.el.style.transform;b.el.classList.toggle('fl-face-left',j===3);b.hands.classList.toggle('fl-face-left',j===3);
   b.el.classList.toggle('fl-left',view==='clock'&&b.left);
   b.v=[x,view==='office'?y+35:y-18];
   // the writing window sits beside the robot's name, flipped to the left near the right edge
   if(b.compose){const w=b.compose.offsetWidth,right=x>=500?x*sc+70+w<r.width:x*sc-70-w<0;b.compose.style.transform=`translate(${(right?x*sc+70:x*sc-70-w).toFixed(1)}px,${Math.max(8,y*sy-20).toFixed(1)}px)`;}}

  drawLinks(dt,off);
  const p=ang(((Date.now()+clockSkew+7*3600e3)%864e5)/36e5);hand.setAttribute('transform',`translate(${500+462*Math.cos(p)} ${500+462*Math.sin(p)})`);
  if(!stopped)raf=requestAnimationFrame(frame);}
 // the file flies along a curve from one robot to the next (index 0 = FACIUP)
 function fly(from,to,color){chime(to===0);if(reduce)return;const r=stage.getBoundingClientRect(),at=i=>{const b=bots.find(x=>x.i===i),c=centre();return i===0||!b?[c[0]*r.width/1000,c[1]*(view==='office'?r.height/562.5:r.width/1000)]:[b.pos[0],b.pos[1]-b.el.offsetHeight*.3];};
  const p0=at(from),p1=at(to);trail.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
  const mid=[(p0[0]+p1[0])/2+(r.width/2-(p0[0]+p1[0])/2)*.5,(p0[1]+p1[1])/2+(r.height/2-(p0[1]+p1[1])/2)*.5-60],path=svg('path',{d:`M${p0[0]} ${p0[1]} Q${mid[0]} ${mid[1]} ${p1[0]} ${p1[1]}`,stroke:color,class:'fl-path'});trail.append(path);
  const doc=h('div',{class:'fl-doc'});doc.innerHTML=DOC;stage.append(doc);
  const L=path.getTotalLength();let k=0;const go=()=>{if(stopped)return;k+=1/85;const q=path.getPointAtLength(Math.min(1,k)*L);doc.style.transform=`translate(${q.x-15}px,${q.y-12}px)`;if(k<1)requestAnimationFrame(go);else{doc.remove();setTimeout(()=>path.remove(),300);}};go();}
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 const nameOf=i=>i===0?'FACIUP':data.runtime.agents[i]?.name||'Agent';
 function tagText(s,look){return look==='paused'?'Tạm dừng':look==='live24'?`Trực 24/7 · ~${fmt(s.avg)}`:look==='work'?`Đang xử lý ${fmt(runFor(s))}`:look==='wait'?`Chờ lượt${s.avg?' · ~'+fmt(s.avg):''}`:look==='review'?'Chờ duyệt':look==='off'?(stale?'Mất kết nối':'Nhóm đang tắt'):s.avg?`TB ${fmt(s.avg)}/lượt`:'Sẵn sàng';}
 function pillText(s,look){return look==='paused'?'':look==='live24'?'24/7':look==='work'?fmt(runFor(s)):look==='review'?'chờ duyệt':look==='off'?'':look==='wait'?'chờ lượt':'';}
 function paint(){const r=data.runtime,lead=r.agents[0],meeting=r.sessions[0]||null;
  // FACIUP runs the whole team all the time: always lit, busier glow while it is putting a result together
  const hl=meeting?.current===0&&meeting.state==='running'||LOOK[lead?.state]==='work'?'work':'on';hub.dataset.state=hl;
  const za=r.agents.find(a=>a.id==='zalo');chatStats.textContent=za?`Hôm nay: nhận ${za.received??'—'} · phản hồi ${za.replies??'—'}`:'Zalo chưa bật';
  leadBot.className='fl-office-lead fl-'+(stale?'off':hl==='work'?'work':'idle');leadBot.title='FACIUP · '+(stale?'Mất kết nối':hl==='work'?'Đang tổng hợp':'Điều phối đội AI');
  paintScreen();
  hub.querySelector('small').textContent=hl==='work'?'Đang tổng hợp':meeting?.state==='running'?`Phiên #${meeting.n} · lượt ${meeting.step+1}`:'Vận hành 24/7';
  for(const b of bots){const look=stale?'off':LOOK[b.s.state]||'idle';
   b.el.className='fl-bot fl-'+look+(b.el.classList.contains('fl-new')?' fl-new':'')+(view==='clock'&&b.left?' fl-left':'')+(b.s.live?' fl-24':'')+(b.id==='zalo'&&personal?.processing?' fl-chatting':'');
   b.el.querySelector('.fl-name b').textContent=b.s.name;b.el.querySelector('.fl-name span').textContent=pillText(b.s,look);b.el.title=b.s.name+' · '+tagText(b.s,look);b.hands.classList.toggle('fl-off',look==='off');
   const j=bots.indexOf(b),work=look==='work';rigs[j]?.classList.toggle('on',work);rigs[j]?.classList.toggle('off',look==='off'||look==='paused');
   if(work&&j<5){b.compose||=composer();b.compose.style.setProperty('--c',b.color);b.compose.querySelector('b').textContent=`${b.s.name} · ${roles[b.icon]||'Đang xử lý'}…`;b.compose.querySelector('.fl-compose-bar i').style.width=Math.min(96,b.s.avg?runFor(b.s)/b.s.avg*100:40)+'%';b.compose.classList.add('show');}
   else b.compose?.classList.remove('show');}
  rigs.lead.classList.toggle('on',hl==='work');
  now.lastChild.textContent=stale?'Mất kết nối · đang thử lại':`${vn(Date.now()+clockSkew)} giờ VN · trực tuyến`;now.classList.toggle('fl-off',stale);
  }
 function paintLog(){const list=data.runtime.handovers||[],seen=new Set([...log.children].map(li=>li.dataset.k));
  if(!list.length){log.replaceChildren(h('li',{class:'fl-none'},'Chưa có bàn giao trong 24 giờ'));return;}
  log.replaceChildren(...list.map(x=>{const k=x.agent+':'+x.at,a=data.runtime.agents[x.agent],li=h('li',{'data-k':k,class:seen.has(k)||!seen.size?'':'fl-in'},h('time',{},vn(x.at)),h('i',{}),h('span',{},h('b',{},nameOf(x.agent)),x.agent===0?' tổng hợp, gửi chờ duyệt':' xong lượt, bàn giao hồ sơ'));li.style.setProperty('--c',x.agent===0?'#a21caf':a?.color||'#7c3aed');return li;}));}
 function spark(vals,c){const max=Math.max(1,...vals),pts=vals.map((v,i)=>`${i/(vals.length-1)*200},${42-v/max*36}`).join(' '),id='g'+c.slice(1);
  return `<svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><polygon points="0,44 ${pts} 200,44" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;}
 function gauge(p){const r=28,c=2*Math.PI*r;return `<svg viewBox="0 0 70 70" aria-hidden="true"><defs><linearGradient id="flg"><stop offset="0" stop-color="#7c3aed"/><stop offset=".6" stop-color="#f43f5e"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><circle cx="35" cy="35" r="${r}" fill="none" stroke="#f3ecff" stroke-width="8"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="url(#flg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 35 35)"/></svg>`;}
 function paintKpis(){const r=data.runtime,k=r.kpi||{},d=k.yesterday?Math.round((k.today-k.yesterday)/k.yesterday*100):null,dt=k.avgToday&&k.avgYesterday?k.avgToday-k.avgYesterday:null,mx=Math.max(1,...(k.top||[]).map(x=>x.n));
  kpis.innerHTML=`<div class="fl-kpi"><div class="lbl">Lượt hoàn thành hôm nay</div><div class="val">${k.today||0}<small>lượt</small></div><div class="delta ${d<0?'down':''}">${d===null?'Chưa có số hôm qua':(d>=0?'▲ ':'▼ ')+Math.abs(d)+'% so với hôm qua'}</div>${spark(k.series||[0,0,0,0,0,0,0],'#a21caf')}</div>
  <div class="fl-kpi"><div class="lbl">Nhiệm vụ hiện tại</div><div class="trio"><div><b class="fl-hot">${r.running}</b><span>Đang xử lý</span></div><div><b>${r.queued}</b><span>Chờ lượt</span></div><div><b>${r.review}</b><span>Chờ duyệt</span></div></div></div>
  <div class="fl-kpi"><div class="lbl">Thời gian TB mỗi lượt</div><div class="val">${k.avgToday?fmt(k.avgToday):'—'}</div><div class="delta ${dt>0?'down':''}">${!k.avgToday?'Hôm nay chưa có lượt':dt===null?'Chưa có số hôm qua':dt<=0?`▼ ${Math.abs(dt)} giây, nhanh hơn hôm qua`:`▲ ${dt} giây so với hôm qua`}</div></div>
  <div class="fl-kpi"><div class="lbl">Tỉ lệ được duyệt · 30 ngày</div><div class="gauge">${gauge(k.decided?k.approved/k.decided:0)}<div><div class="val">${k.decided?Math.round(k.approved/k.decided*100)+'%':'—'}</div><div class="delta">${k.decided?`${k.approved}/${k.decided} kết quả`:'Chưa có kết quả duyệt'}</div></div></div></div>
  <div class="fl-kpi"><div class="lbl">Làm nhiều nhất hôm nay</div>${k.top?.length?`<ul class="fl-top">${k.top.map(x=>`<li data-c="${x.color}" data-w="${x.n/mx*100}"><span></span><span class="fl-b"><i></i></span><span>${x.n}</span></li>`).join('')}</ul>`:'<p class="delta">Chưa có lượt hôm nay</p>'}</div>`;
  kpis.querySelectorAll('.fl-top li').forEach((li,i)=>{li.firstChild.textContent=k.top[i].name===r.agents[0]?.name?'FACIUP':k.top[i].name;li.style.setProperty('--c',li.dataset.c);li.querySelector('i').style.width=li.dataset.w+'%';});}
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');clockSkew=(data.runtime?.polledAt||Date.now())-Date.now();stale=false;}catch{stale=true;}finally{busy=false;}
  if(stopped)return;page.classList.toggle('fl-stale',stale);if(!data){now.lastChild.textContent='Chưa kết nối được · đang thử lại';return;}
  const r=data.runtime;r.sessions=r.sessions||[];build(r.agents.slice(1));
  // a session whose turn moved since the last poll hands its file on
  for(const s of r.sessions){const was=lastTurn.get(s.n);if(was!==undefined&&was!==s.current)fly(was,s.current,s.current===0?'#a21caf':r.agents[s.current]?.color||'#f97316');lastTurn.set(s.n,s.current);}
  paint();paintLog();paintKpis();}
 load();loadMine();raf=requestAnimationFrame(frame);
 const demo=setInterval(()=>{if(!personal&&!reduce&&!document.hidden){demoStep=(demoStep+1)%intro.length;renderChat();}},6000);
 const tick=setInterval(()=>{paintClock();if(data)paint();},1000),poll=setInterval(()=>{load();loadMine();},10000),visible=()=>{if(!document.hidden){load();loadMine();}};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;personal=null;dialog.close();cancelAnimationFrame(raf);clearInterval(tick);clearInterval(poll);clearInterval(demo);document.removeEventListener('visibilitychange',visible);};
}
