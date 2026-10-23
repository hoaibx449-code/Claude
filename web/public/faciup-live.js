// Faciup Live: the AI team's office. A wide picture on computers and a square one on phones; over it,
// in the picture's own pixels, the live wall board, the desk name plates and room signs (names come
// from Quản trị → Nhóm AI), and each robot's living head, eyes and typing hands. Everything shown is
// public runtime data from /api/faciup-live: names, states and times, never prompts or content.
const ZALO='<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="10" fill="#0878ff"/><path d="M7 8h18v14H14l-6 4 1-5H7z" fill="#fff"/><text x="16" y="18" text-anchor="middle" fill="#0878ff" font-size="7.5" font-weight="800" font-family="Arial,sans-serif">Zalo</text></svg>';
const DOC='<svg viewBox="0 0 30 24" aria-hidden="true"><path d="M1 3h10l3 3h15v17H1z" fill="#f59e0b"/><rect x="1" y="8" width="28" height="15" rx="2.5" fill="#fcd34d"/><path d="M7 15h16" stroke="#b45309" stroke-width="2"/></svg>';
// server state → how a robot behaves
const LOOK={running:'work',live24:'live24',queued:'wait',retry:'wait',review:'review',paused:'paused',disabled:'off',idle:'idle',unknown:'off'};
const ROLE={coordinator:'Tổng hợp kết quả',target:'Lập dàn ý',search:'Tra cứu nguồn',pen:'Soạn lời đọc',check:'Rà soát kịch bản',news:'Lọc tin nóng',design:'Phác thumbnail',mega:'Lên kế hoạch đăng',chart:'Đối soát số liệu',video:'Dựng phân cảnh',spark:'Xử lý việc nội bộ',zalo:'Trả lời khách'};
const pad=n=>String(n).padStart(2,'0');
const fmt=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+pad(s%60);};
const vn=t=>{const d=new Date(t+7*3600e3);return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());};
const WEEK=['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
// The two office pictures, measured in their own pixels: the wall board (screen, title row, four tiles,
// bar columns), the room signs, and for each desk the robot's two eyes and the name plate [centre x,
// centre y, width, rotation]. Desk 10 is the Zalo Bot. `k` is how large a robot is in that picture.
const LAYOUTS={
 wide:{src:'/assets/office-wide-v2.webp',w:1672,h:941,k:1,
  board:{box:[622,76,1083,277],head:[648,82,1069,118],tiles:[[648,122,745,180],[752,122,850,180],[856,122,957,180],[963,122,1069,180]],bars:[[650,200,852,274],[874,200,1068,274]]},
  rooms:{exec:[740,412,940,485],ops:[180,712,428,795],admin:[1248,712,1492,795]},
  seats:{1:{eyes:[[984,311],[1004,313]],plate:[978,381,118,0]},2:{eyes:[[663,312],[682,309]],plate:[703,381,118,0]},3:{eyes:[[217,317],[237,317]],plate:[277,383,124,-2]},
   4:{eyes:[[423,434],[445,434]],plate:[493,509,106,-2]},5:{eyes:[[168,441],[188,441]],plate:[216,515,118,-2]},6:{eyes:[[128,579],[152,574]],plate:[197,659,120,-2]},
   7:{eyes:[[420,593],[443,589]],plate:[484,675,124,-2]},8:{eyes:[[1374,345],[1394,346]],plate:[1362,418,116,0]},9:{eyes:[[1486,468],[1508,471]],plate:[1463,543,118,0]},
   10:{eyes:[[1311,602],[1333,606]],plate:[1297,680,124,0]}}},
 tall:{src:'/assets/office-tall-v2.webp',w:1254,h:1254,k:1.3,
  board:{box:[348,30,903,233],head:[373,40,878,110],tiles:[[373,118,490,212],[500,118,620,212],[631,118,750,212],[762,118,878,212]],bars:null},
  rooms:{exec:[523,392,728,468],ops:[260,888,535,995],admin:[955,978,1210,1072]},
  seats:{1:{eyes:[[750,283],[775,281]],plate:[781,372,132,-1]},2:{eyes:[[488,283],[514,282]],plate:[500,372,130,-1]},3:{eyes:[[146,513],[171,513]],plate:[201,611,140,-3]},
   4:{eyes:[[449,530],[478,527]],plate:[477,632,128,-3]},5:{eyes:[[706,541],[735,538]],plate:[747,647,138,-3]},6:{eyes:[[218,725],[249,720]],plate:[254,831,144,-3]},
   7:{eyes:[[556,738],[588,733]],plate:[610,849,142,-3]},8:{eyes:[[1051,478],[1078,475]],plate:[1091,567,130,-3]},9:{eyes:[[1081,654],[1109,651]],plate:[1118,747,132,-3]},
   10:{eyes:[[1049,844],[1078,839]],plate:[1116,949,142,-3]}}}};

export function showLive({h,show,api,openLogin,zaloLink}){
 let stopped=false,busy=false,data=null,stale=false,clockSkew=0;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,phoneMQ=matchMedia('(max-width:700px)');
 let L=phoneMQ.matches?LAYOUTS.tall:LAYOUTS.wide;
 const NS='http://www.w3.org/2000/svg',svg=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const P=(v,t)=>(v/t*100).toFixed(3)+'%';
 const place=(el,x,y,w,hh)=>Object.assign(el.style,{left:P(x,L.w),top:P(y,L.h),width:P(w,L.w),height:P(hh,L.h)});
 // ---- page
 const room=h('img',{class:'fl-room',alt:'',decoding:'async'});
 const world=h('div',{class:'fl-world'});
 const stage=h('section',{class:'fl-stage','aria-label':'Văn phòng đội AI FACIUP'},room,world);
 const links=svg('svg',{class:'fl-links','aria-hidden':'true',preserveAspectRatio:'none'}),trail=svg('svg',{class:'fl-trail','aria-hidden':'true',preserveAspectRatio:'none'});
 const board=h('div',{class:'fl-board',role:'img','aria-label':'Bảng vận hành'}),signs=h('div',{class:'fl-signs'}),desks=h('div',{class:'fl-desks'});
 const plates=h('div',{class:'fl-plates'});
 world.append(links,signs,desks,board,plates,trail);
 // ---- sound: a bright bell over a swoosh when a file is handed on (after the viewer has touched the page)
 let soundOn=true,audio=null,bus=null;try{soundOn=localStorage.getItem('faciup-live-sound')!=='off';}catch{}
 const unlock=()=>{if(!audio&&window.AudioContext)audio=new AudioContext();audio?.resume?.();};
 document.addEventListener('pointerdown',unlock,{once:true});document.addEventListener('keydown',unlock,{once:true});
 function chime(toLead){if(!soundOn||!audio||audio.state!=='running'||document.hidden)return;const t=audio.currentTime;
  if(!bus){const comp=audio.createDynamicsCompressor();comp.threshold.value=-10;comp.ratio.value=4;bus=audio.createGain();bus.gain.value=.9;bus.connect(comp);comp.connect(audio.destination);}
  const noise=audio.createBuffer(1,audio.sampleRate*.25,audio.sampleRate),d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
  const sw=audio.createBufferSource(),bp=audio.createBiquadFilter(),sg=audio.createGain();sw.buffer=noise;bp.type='bandpass';bp.frequency.setValueAtTime(600,t);bp.frequency.exponentialRampToValueAtTime(3200,t+.22);sg.gain.value=.35;sw.connect(bp);bp.connect(sg);sg.connect(bus);sw.start(t);
  (toLead?[784,988,1319]:[1047,1568]).forEach((f,n)=>{const at=t+.12+n*.11;for(const [mul,vol,type] of [[1,.55,'sine'],[2,.18,'triangle'],[3,.08,'sine']]){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=f*mul;o.connect(g);g.connect(bus);
   g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+.01);g.gain.exponentialRampToValueAtTime(.0001,at+.9);o.start(at);o.stop(at+.95);}});}
 const soundBtn=h('button',{type:'button',class:'fl-tool',onclick:()=>{soundOn=!soundOn;unlock();try{localStorage.setItem('faciup-live-sound',soundOn?'on':'off');}catch{}paintSound();if(soundOn)setTimeout(()=>chime(false),60);}});
 function paintSound(){soundBtn.setAttribute('aria-pressed',String(soundOn));soundBtn.title=soundOn?'Âm thanh bàn giao: bật (bấm để tắt)':'Âm thanh bàn giao: tắt (bấm để bật)';soundBtn.setAttribute('aria-label',soundBtn.title);
  soundBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${soundOn?'<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;}
 paintSound();
 const fullBtn=h('button',{type:'button',class:'fl-tool',title:'Toàn màn hình','aria-label':'Toàn màn hình',onclick:()=>{document.fullscreenElement?document.exitFullscreen():stage.requestFullscreen?.().catch(()=>{});}});
 fullBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
 const toolbar=h('header',{class:'fl-toolbar'},h('div',{},h('h1',{},'Faciup Live'),h('p',{},'Văn phòng vận hành của đội AI')),h('div',{class:'fl-tools'},soundBtn,fullBtn));
 // ---- Zalo: a small button in the corner; a light popup carries each new message for a few seconds
 const dialog=h('dialog',{class:'fl-dialog'}),dialogBody=h('div',{});dialog.append(h('button',{type:'button',class:'fl-close',onclick:()=>dialog.close(),'aria-label':'Đóng'},'×'),dialogBody);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const chatNote=h('small',{}),chatStats=h('small',{class:'fl-chat-stats'}),chatMessages=h('div',{class:'fl-messages',role:'log','aria-live':'polite'}),chatStatus=h('p',{class:'fl-chat-status'});
 const chat=h('section',{class:'fl-chat'},chatStats,chatNote,chatMessages,chatStatus);
 if(zaloLink&&/^https:\/\//.test(zaloLink))chat.append(h('a',{class:'fl-zalo-open',href:zaloLink,target:'_blank',rel:'noopener'},'Nhắn qua Zalo ↗'));
 const zaloBtn=h('button',{class:'fl-zalo-btn',type:'button','aria-label':'Mở hội thoại Zalo',onclick:()=>openChat()}),zaloPop=h('div',{class:'fl-zalo-pop',role:'status','aria-live':'polite'});
 zaloBtn.innerHTML=ZALO;stage.append(h('div',{class:'fl-zalo-fab'},zaloPop,zaloBtn));
 let personal=null,mineBusy=false,demoStep=0,zaloSig='',zaloTimer=0;
 const intro=['Bạn cần hỗ trợ gì? Nhắn mình nhé.','Bạn có thể quan sát đội AI làm việc ngay trên màn hình.','Đăng nhập để bắt đầu hội thoại riêng của bạn.'];
 function renderChat(){
  chatNote.textContent=personal?'Zalo riêng · 30 tin gần nhất':'Hội thoại minh họa · Chưa đăng nhập';
  const items=!personal?intro.slice(0,demoStep+1).map(text=>({role:'bot',text})):personal.messages;
  chatMessages.replaceChildren(...items.map(m=>{const e=h('div',{class:'fl-message '+(m.role==='user'?'me':'bot')},h('span',{},m.text));if(m.role!=='user'){const i=h('i',{class:'fl-zalo-avatar'});i.innerHTML=ZALO;e.prepend(i);}return e;}));
  if(personal&&!items.length)chatMessages.append(h('p',{class:'fl-empty'},personal.linked?'Chưa có tin nhắn sau khi liên kết.':'Liên kết Zalo đã xác minh để xem hội thoại của bạn.'));
  if(personal&&!personal.linked)chatMessages.append(h('a',{href:'/zalo'},'Liên kết Zalo'));
  if(!personal)chatMessages.append(h('button',{type:'button',class:'fl-login',onclick:()=>openLogin?.('route',{hash:'/faciup-live'})},'Đăng nhập để trò chuyện'));
  chatStatus.textContent=personal?.processing?'Đang xử lý tin nhắn Zalo…':personal?'Hội thoại riêng · Sẵn sàng hỗ trợ':'Lời giới thiệu tự động';
  chatMessages.scrollTop=chatMessages.scrollHeight;
  const last=items.at(-1),sig=last?last.role+':'+last.text:'';
  if(sig&&sig!==zaloSig){zaloSig=sig;clearTimeout(zaloTimer);zaloPop.className='fl-zalo-pop show '+(last.role==='user'?'me':'bot');zaloPop.replaceChildren(h('small',{},last.role==='user'?'Bạn':personal?'Zalo':'Zalo · minh họa'),h('span',{},last.text.slice(0,140)));zaloTimer=setTimeout(()=>zaloPop.classList.remove('show'),6500);}
 }
 async function loadMine(){if(stopped||mineBusy||document.hidden)return;mineBusy=true;try{personal=await api('/api/faciup-live/mine');}catch{personal=null;}finally{mineBusy=false;if(!stopped)renderChat();}}
 function openPanel(title,kids){dialogBody.replaceChildren(h('h2',{},title),...kids);dialog.showModal();}
 function openChat(){openPanel('Hội thoại Zalo của bạn',[chat]);renderChat();}
 const page=h('div',{class:'fl-live'},toolbar,stage,dialog);
 show(page);
 // ---- the board, signs and desks are rebuilt when the picture changes (phone ↔ computer)
 const clockEl=h('b',{class:'fl-clock'}),dateEl=h('small',{class:'fl-date'}),liveEl=h('span',{class:'fl-live-dot'},h('i',{}),'TRỰC TUYẾN');
 let tiles=[],bars=[],seats={};
 function buildBoard(){const B=L.board;board.replaceChildren();place(board,B.box[0],B.box[1],B.box[2]-B.box[0],B.box[3]-B.box[1]);
  const head=h('div',{class:'fl-bhead'},h('div',{},h('strong',{},'BẢNG VẬN HÀNH'),liveEl),h('div',{class:'fl-bclock'},clockEl,dateEl));
  const rel=(x,y,w,hh)=>[(x-B.box[0])/(B.box[2]-B.box[0])*100,(y-B.box[1])/(B.box[3]-B.box[1])*100,w/(B.box[2]-B.box[0])*100,hh/(B.box[3]-B.box[1])*100];
  const at=(el,[x0,y0,x1,y1])=>{const [l,t,w,hh]=rel(x0,y0,x1-x0,y1-y0);Object.assign(el.style,{left:l+'%',top:t+'%',width:w+'%',height:hh+'%'});return el;};
  board.append(at(head,B.head));
  tiles=B.tiles.map((box,i)=>{const t=at(h('div',{class:'fl-tile t'+i},h('b',{},'0'),h('span',{})),box);board.append(t);return t;});
  bars=[];if(B.bars)for(const [i,box] of B.bars.entries()){const col=at(h('div',{class:'fl-bars'}),box);
   for(const name of i?['Chất lượng','Hỗ trợ KH','Hỗ trợ nội bộ']:['Tiến độ phiên','Hiệu suất','Hoạt động']){const row=h('div',{class:'fl-bar'},h('span',{},name),h('i',{},h('b',{})),h('em',{},'0%'));col.append(row);bars.push(row);}board.append(col);}
 }
 function buildSigns(){signs.replaceChildren();for(const [id,box] of Object.entries(L.rooms)){const s=h('div',{class:'fl-sign','data-room':id},h('b',{}));place(s,box[0],box[1],box[2]-box[0],box[3]-box[1]);signs.append(s);}}
 function buildDesks(){desks.replaceChildren();plates.replaceChildren();seats={};
  for(const [n,S] of Object.entries(L.seats)){const [[ax,ay],[bx,by]]=S.eyes,k=L.k,cx=(ax+bx)/2,cy=(ay+by)/2;
   const hx=cx-42*k,hy=cy-60*k,hw=84*k,hh=82*k;
   // the head: a cut of the picture itself, so it can nod and look around; the eyes are redrawn on it
   const head=h('div',{class:'fl-head'});place(head,hx,hy,hw,hh);
   Object.assign(head.style,{backgroundImage:`url('${L.src}')`,backgroundSize:`${(L.w/hw*100).toFixed(2)}% ${(L.h/hh*100).toFixed(2)}%`,backgroundPosition:`${(hx/(L.w-hw)*100).toFixed(3)}% ${(hy/(L.h-hh)*100).toFixed(3)}%`});
   for(const [ex,ey] of S.eyes){const e=h('i',{class:'fl-eye'});Object.assign(e.style,{left:((ex-hx)/hw*100-5.5)+'%',top:((ey-hy)/hh*100-10)+'%'});e.style.setProperty('--d',(Math.random()*4).toFixed(2)+'s');head.append(e);}
   head.style.setProperty('--b',(Math.random()*2).toFixed(2)+'s');
   const keys=h('div',{class:'fl-keys'},...[0,1,2,3,4].map(i=>{const s=h('i',{});s.style.setProperty('--i',i);return s;}));place(keys,cx-26*k,cy+40*k,52*k,10*k);
   const halo=h('div',{class:'fl-halo'});place(halo,cx-90*k,cy-40*k,180*k,140*k);
   const [px,py,pw,rot]=S.plate,plate=h('div',{class:'fl-plate'},h('b',{}));place(plate,px-pw/2,py-14*(L.k>1?1.25:1),pw,28*(L.k>1?1.25:1));plate.style.transform=`rotate(${rot}deg)`;
   const chip=h('div',{class:'fl-chip'}),card=h('div',{class:'fl-card'},h('i',{class:'fl-card-dot'}),h('b',{}),h('span',{class:'fl-caret'}),h('div',{class:'fl-card-bar'},h('i',{})));
   // under the board there is no room above the head, so the label sits beside it, away from the board
   const B=L.board.box,side=hy-28*k<B[3]&&cx>B[0]&&cx<B[2]?(cx>(B[0]+B[2])/2?'r':'l'):'';
   for(const el of [chip,card]){Object.assign(el.style,side?{left:P(cx+(side==='r'?46:-46)*k,L.w),top:P(cy,L.h)}:{left:P(cx,L.w),top:P(hy-4*k,L.h)});if(side)el.classList.add('side-'+side);}
   const g=h('div',{class:'fl-desk'},halo,head,keys,chip,card);desks.append(g);plates.append(plate);
   seats[n]={g,head,plate,chip,card,cx,cy:hy+hh*.45,top:hy};}
  links.setAttribute('viewBox',`0 0 ${L.w} ${L.h}`);trail.setAttribute('viewBox',`0 0 ${L.w} ${L.h}`);linkKey='';
 }
 let linkKey='',linkEls=[];
 function buildLinks(agents,leadSeat){const key=agents.map(a=>a.seat).join(',')+'|'+L.src;if(key===linkKey)return;linkKey=key;links.replaceChildren();linkEls=[];
  const lead=seats[leadSeat];if(!lead)return;
  for(const a of agents){const s=seats[a.seat];if(!s||s===lead)continue;
   const mx=(s.cx+lead.cx)/2,my=Math.max(s.cy,lead.cy)+70*L.k,d=`M${s.cx} ${s.cy}Q${mx} ${my} ${lead.cx} ${lead.cy}`;
   const path=svg('path',{d,class:'fl-link',stroke:a.color}),dot=svg('circle',{r:4*L.k,class:'fl-spark',fill:a.color});
   const mo=svg('animateMotion',{dur:(3+Math.random()*2).toFixed(1)+'s',repeatCount:'indefinite',path:d});dot.append(mo);links.append(path,dot);linkEls.push({seat:a.seat,path,dot});}}
 function applyLayout(){room.src=L.src;room.width=L.w;room.height=L.h;page.classList.toggle('fl-tall',L===LAYOUTS.tall);stage.style.aspectRatio=`${L.w}/${L.h}`;buildBoard();buildSigns();buildDesks();fit();if(data)paint();}
 // the overlay box sits exactly over the picture; --k turns picture pixels into screen pixels for type sizes
 function fit(){const sr=stage.getBoundingClientRect();if(!sr.width)return;const k=Math.min(sr.width/L.w,sr.height/L.h),w=L.w*k,hh=L.h*k;
  Object.assign(world.style,{left:(sr.width-w)/2+'px',top:(sr.height-hh)/2+'px',width:w+'px',height:hh+'px'});world.style.setProperty('--k',k);}
 const ro=new ResizeObserver(fit);ro.observe(stage);
 const onPhone=()=>{L=phoneMQ.matches?LAYOUTS.tall:LAYOUTS.wide;applyLayout();};phoneMQ.addEventListener('change',onPhone);
 applyLayout();
 // ---- painting
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 function chipText(a,look){return look==='live24'?'Trực 24/7':look==='wait'?'Chờ lượt':look==='review'?'Chờ duyệt':look==='paused'?'Tạm dừng':look==='off'?(stale?'Mất kết nối':'Nghỉ'):a.completed?a.completed+' việc hôm nay':'Sẵn sàng';}
 function paintClock(){const d=new Date(Date.now()+clockSkew+7*3600e3);clockEl.replaceChildren(pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()),h('small',{},':'+pad(d.getUTCSeconds())));dateEl.textContent=`${WEEK[d.getUTCDay()]} · ${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;liveEl.className='fl-live-dot'+(stale?' off':'');liveEl.lastChild.textContent=stale?'MẤT KẾT NỐI':'TRỰC TUYẾN';}
 function paint(){if(!data)return;const r=data.runtime,k=r.kpi||{},b=r.board||{},meeting=r.sessions?.[0]||null;
  for(const s of signs.children){const name=(r.rooms||[]).find(x=>x.id===s.dataset.room)?.name||'';const words=name.toUpperCase().split(/\s+/).filter(Boolean),rows=words.length>1?[words.slice(0,words.length>2?1:1),words.slice(1)]:[words];s.firstChild.replaceChildren(...rows.map(row=>h('span',{},row.join(' '))));s.hidden=!name;}
  const values=[[r.agents.length,'Agent'],[r.running,'Đang xử lý'],[r.review,'Chờ duyệt'],[k.today||0,'Hoàn thành']];
  tiles.forEach((t,i)=>{t.firstChild.textContent=pad(values[i][0]);t.lastChild.textContent=values[i][1];});
  const active=r.agents.filter(a=>['work','live24','wait'].includes(LOOK[a.state])).length;
  [b.progress,b.efficiency,Math.round(active/Math.max(1,r.agents.length)*100),b.quality,b.support,b.internal].forEach((v,i)=>{const row=bars[i];if(!row)return;row.querySelector('i b').style.width=(v||0)+'%';row.lastChild.textContent=(v||0)+'%';});
  const leadSeat=r.agents[0]?.seat||1;buildLinks(r.agents,leadSeat);
  const used=new Set();
  r.agents.forEach((a,i)=>{const s=seats[a.seat];if(!s)return;used.add(String(a.seat));
   let look=stale?'off':LOOK[a.state]||'idle';
   if(i===0&&meeting?.current===0&&meeting.state==='running')look='work';
   const work=look==='work'||(a.live&&a.state==='running');
   s.g.className='fl-desk is-'+look+(work?' is-work':'')+(i===0?' is-lead':'');s.g.style.setProperty('--c',a.color);s.g.hidden=false;
   s.plate.firstChild.textContent=pad(a.seat)+' · '+a.name;
   s.chip.textContent=chipText(a,look);
   s.card.querySelector('b').textContent=`${a.name} · ${ROLE[a.icon]||'Đang xử lý'}`;
   s.card.querySelector('.fl-card-bar i').style.width=Math.min(96,a.avg?runFor(a)/a.avg*100:45)+'%';
   for(const l of linkEls)if(l.seat===a.seat){l.path.classList.toggle('on',work);l.dot.classList.toggle('on',work);}
  });
  for(const [n,s] of Object.entries(seats)){s.plate.hidden=!used.has(n);if(!used.has(n))s.g.hidden=true;}
  paintClock();
 }
 // the file flies along a curve from one desk to the next, with the bell
 function fly(fromSeat,toSeat,color,toLead){chime(toLead);if(reduce)return;const a=seats[fromSeat],b=seats[toSeat];if(!a||!b)return;
  const d=`M${a.cx} ${a.top}Q${(a.cx+b.cx)/2} ${Math.min(a.top,b.top)-90*L.k} ${b.cx} ${b.top}`,path=svg('path',{d,class:'fl-path',stroke:color});trail.append(path);
  const doc=h('div',{class:'fl-doc'});doc.innerHTML=DOC;world.append(doc);
  const len=path.getTotalLength();let t=0;const go=()=>{if(stopped)return;t+=1/80;const p=path.getPointAtLength(Math.min(1,t)*len);doc.style.left=P(p.x,L.w);doc.style.top=P(p.y,L.h);if(t<1)requestAnimationFrame(go);else{doc.remove();setTimeout(()=>path.remove(),300);}};go();}
 const lastTurn=new Map();
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');clockSkew=(data.runtime?.polledAt||Date.now())-Date.now();stale=false;}catch{stale=true;}finally{busy=false;}
  if(stopped||!data)return;page.classList.toggle('fl-stale',stale);const r=data.runtime;r.sessions=r.sessions||[];
  for(const s of r.sessions){const was=lastTurn.get(s.n);if(was!==undefined&&was!==s.current){const from=r.agents[was],to=r.agents[s.current];if(from&&to)fly(from.seat,to.seat,to.color,s.current===0);}lastTurn.set(s.n,s.current);}
  paint();}
 load();loadMine();
 const demo=setInterval(()=>{if(!personal&&!reduce&&!document.hidden){demoStep=(demoStep+1)%intro.length;renderChat();}},6000);
 const tick=setInterval(()=>{paintClock();if(data)paint();},1000),poll=setInterval(load,20000),pollMine=setInterval(loadMine,30000),visible=()=>{if(!document.hidden){load();loadMine();}};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;ro.disconnect();phoneMQ.removeEventListener('change',onPhone);personal=null;dialog.close();clearInterval(tick);clearInterval(poll);clearInterval(pollMine);clearInterval(demo);document.removeEventListener('visibilitychange',visible);};
}
