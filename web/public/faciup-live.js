import {createSim} from '/faciup-sim.js?v=5';
// Faciup Live: the AI team's office. A wide picture on computers and a square one on phones; over it,
// in the picture's own pixels, the live wall board, the desk name plates and room signs (names come
// from Quản trị → Nhóm AI), and each robot's living head, eyes and typing hands. Everything shown is
// public runtime data from /api/faciup-live: names, states and times, never prompts or content.
const ZALO='<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="10" fill="#0878ff"/><path d="M7 8h18v14H14l-6 4 1-5H7z" fill="#fff"/><text x="16" y="18" text-anchor="middle" fill="#0878ff" font-size="7.5" font-weight="800" font-family="Arial,sans-serif">Zalo</text></svg>';
const DOC='<svg viewBox="0 0 30 24" aria-hidden="true"><path d="M1 3h10l3 3h15v17H1z" fill="#f59e0b"/><rect x="1" y="8" width="28" height="15" rx="2.5" fill="#fcd34d"/><path d="M7 15h16" stroke="#b45309" stroke-width="2"/></svg>';
// server state → how a robot behaves
const LOOK={running:'work',live24:'live24',queued:'wait',retry:'wait',review:'review',paused:'idle',disabled:'idle',idle:'idle',unknown:'idle'};
const ROLE={coordinator:'Tổng hợp kết quả',target:'Lập dàn ý',search:'Tra cứu nguồn',pen:'Soạn lời đọc',check:'Rà soát kịch bản',news:'Lọc tin nóng',design:'Phác thumbnail',mega:'Lên kế hoạch đăng',chart:'Đối soát số liệu',video:'Dựng phân cảnh',spark:'Xử lý việc nội bộ',zalo:'Trả lời khách'};
const pad=n=>String(n).padStart(2,'0');
const fmt=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+pad(s%60);};
const vn=t=>{const d=new Date(t+7*3600e3);return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());};
const WEEK=['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
// The two office pictures, measured in their own pixels: the wall board (screen, title row, four tiles,
// bar columns), the room signs, and for each desk the robot's two eyes, the four corners of the desk's front
// panel (top-left, top-right, bottom-right, bottom-left: the name is printed onto it in perspective) and the
// box its two hands type in. `zalo` is the free floor where a new Zalo message shows [centre x, top, width]. Desk 10 is the Zalo Bot. `k` is how large a robot is in that picture.
const LAYOUTS={
 wide:{src:'/assets/office-wide-v2.webp',w:1672,h:941,k:1,
  board:{box:[622,76,1083,277],head:[648,82,1069,118],tiles:[[648,122,745,180],[752,122,850,180],[856,122,957,180],[963,122,1069,180]],bars:[[650,200,852,274],[874,200,1068,274]]},
  rooms:{exec:[740,412,940,485],ops:[180,712,428,795],admin:[1248,712,1492,795]},zalo:[836,846,430],
  seats:{1:{eyes:[[984,311],[1004,313]],quad:[[918,363],[1040,370],[1041,399],[918,388]],hands:[958,338,1017,360]},
   2:{eyes:[[663,312],[682,309]],quad:[[643,368],[765,361],[765,390],[643,398]],hands:[655,340,710,362]},
   3:{eyes:[[217,317],[237,317]],quad:[[210,376],[345,376],[345,405],[210,404]],hands:[200,340,257,362]},
   4:{eyes:[[423,434],[445,434]],quad:[[435,499],[560,499],[560,530],[435,528]],hands:[403,467,470,490]},
   5:{eyes:[[168,441],[188,441]],quad:[[150,500],[278,500],[278,534],[150,534]],hands:[153,473,207,493]},
   6:{eyes:[[128,579],[152,574]],quad:[[130,648],[260,646],[260,682],[130,682]],hands:[110,600,173,630]},
   7:{eyes:[[420,593],[443,589]],quad:[[416,668],[556,668],[556,700],[416,699]],hands:[407,617,467,647]},
   8:{eyes:[[1374,345],[1394,346]],quad:[[1302,399],[1421,405],[1422,436],[1303,428]],hands:[1360,373,1410,391]},
   9:{eyes:[[1486,468],[1508,471]],quad:[[1404,520],[1527,534],[1528,567],[1404,551]],hands:[1473,497,1523,517]},
   10:{eyes:[[1311,602],[1333,606]],quad:[[1232,658],[1364,672],[1365,705],[1232,693]],hands:[1297,633,1350,657]}}},
 tall:{src:'/assets/office-tall-v2.webp',w:1254,h:1254,k:1.3,
  board:{box:[348,30,903,233],head:[373,40,878,110],tiles:[[373,118,490,212],[500,118,620,212],[631,118,750,212],[762,118,878,212]],bars:null},
  rooms:{exec:[523,392,728,468],ops:[260,888,535,995],admin:[955,978,1210,1072]},
  seats:{1:{eyes:[[750,283],[775,281]],quad:[[711,357],[854,357],[853,389],[711,389]],hands:[722,318,792,342]},
   2:{eyes:[[488,283],[514,282]],quad:[[434,358],[569,358],[569,389],[435,389]],hands:[460,322,520,342]},
   3:{eyes:[[146,513],[171,513]],quad:[[128,596],[276,595],[276,624],[128,629]],hands:[140,552,200,576]},
   4:{eyes:[[449,530],[478,527]],quad:[[411,619],[541,618],[541,646],[411,649]],hands:[420,570,490,596]},
   5:{eyes:[[706,541],[735,538]],quad:[[675,633],[816,627],[816,658],[676,666]],hands:[685,580,750,606]},
   6:{eyes:[[218,725],[249,720]],quad:[[180,820],[329,811],[329,842],[180,857]],hands:[185,772,250,796]},
   7:{eyes:[[556,738],[588,733]],quad:[[535,839],[689,825],[689,856],[536,873]],hands:[535,777,620,807]},
   8:{eyes:[[1051,478],[1078,475]],quad:[[1022,551],[1160,550],[1160,582],[1023,588]],hands:[1018,514,1080,534]},
   9:{eyes:[[1081,654],[1109,651]],quad:[[1047,738],[1188,731],[1188,763],[1048,770]],hands:[1048,698,1110,720]},
   10:{eyes:[[1049,844],[1078,839]],quad:[[1045,941],[1191,926],[1191,964],[1046,977]],hands:[1010,890,1085,920]}}}};

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
 function out(){if(!soundOn||!audio||audio.state!=='running'||document.hidden)return null;if(!bus){const comp=audio.createDynamicsCompressor();comp.threshold.value=-10;comp.ratio.value=4;bus=audio.createGain();bus.gain.value=.9;bus.connect(comp);comp.connect(audio.destination);}return bus;}
 function tone(freqs,step,vol,len){const o0=out();if(!o0)return;const t=audio.currentTime;freqs.forEach((f,n)=>{const at=t+n*step,o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(o0);
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+.008);g.gain.exponentialRampToValueAtTime(.0001,at+len);o.start(at);o.stop(at+len+.05);});}
 const ting=user=>tone(user?[1175,1568]:[1568,2093],.09,.32,.5),fanfare=()=>tone([523,659,784,1047,1319],.085,.3,.7);
 // soft key clicks while someone types: a few short filtered ticks spread over the next second
 function typing(n){const o0=out();if(!o0||!n)return;const t=audio.currentTime;for(let q=0;q<Math.min(9,2+n*2);q++){const at=t+Math.random()*.95,len=.018,buf=audio.createBuffer(1,Math.ceil(audio.sampleRate*len),audio.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);const src=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();src.buffer=buf;f.type='highpass';f.frequency.value=1800+Math.random()*1600;g.gain.value=.05+Math.random()*.04;src.connect(f);f.connect(g);g.connect(o0);src.start(at);}}
 const soundBtn=h('button',{type:'button',class:'fl-tool',onclick:()=>{soundOn=!soundOn;unlock();try{localStorage.setItem('faciup-live-sound',soundOn?'on':'off');}catch{}paintSound();if(soundOn)setTimeout(()=>chime(false),60);}});
 function paintSound(){soundBtn.setAttribute('aria-pressed',String(soundOn));soundBtn.title=soundOn?'Âm thanh bàn giao: bật (bấm để tắt)':'Âm thanh bàn giao: tắt (bấm để bật)';soundBtn.setAttribute('aria-label',soundBtn.title);
  soundBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${soundOn?'<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;}
 paintSound();
 const fullBtn=h('button',{type:'button',class:'fl-tool',title:'Toàn màn hình','aria-label':'Toàn màn hình',onclick:()=>{document.fullscreenElement?document.exitFullscreen():stage.requestFullscreen?.().catch(()=>{});}});
 fullBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
 // the heading sits centred between two light rails; its words are set in Quản trị → Nhóm AI → Phòng & luồng
 const titleEl=h('h1',{},'Faciup Live'),subEl=h('p',{},'Văn phòng vận hành của đội AI');
 const toolbar=h('header',{class:'fl-toolbar'},h('div',{class:'fl-title'},h('i',{class:'fl-rail'}),h('div',{},h('span',{class:'fl-onair'},h('i',{}),'LIVE'),titleEl,subEl),h('i',{class:'fl-rail r'})),h('div',{class:'fl-tools'},soundBtn,fullBtn));
 // ---- Zalo: no button; each new message shows for a few seconds on the free floor below the lounge
 // (computer) or in the corner (phone). The message, or the Zalo desk, opens the whole conversation
 const dialog=h('dialog',{class:'fl-dialog'}),dialogBody=h('div',{});dialog.append(h('button',{type:'button',class:'fl-close',onclick:()=>dialog.close(),'aria-label':'Đóng'},'×'),dialogBody);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const chatNote=h('small',{}),chatStats=h('small',{class:'fl-chat-stats'}),chatMessages=h('div',{class:'fl-messages',role:'log','aria-live':'polite'}),chatStatus=h('p',{class:'fl-chat-status'});
 const chat=h('section',{class:'fl-chat'},chatStats,chatNote,chatMessages,chatStatus);
 if(zaloLink&&/^https:\/\//.test(zaloLink))chat.append(h('a',{class:'fl-zalo-open',href:zaloLink,target:'_blank',rel:'noopener'},'Nhắn qua Zalo ↗'));
 const zaloPop=h('div',{class:'fl-zalo-pop',role:'status','aria-live':'polite',tabindex:'0',onclick:()=>openChat(),onkeydown:e=>{if(e.key==='Enter')openChat();}}),zaloCorner=h('div',{class:'fl-zalo-fab'});stage.append(zaloCorner);
 desks.addEventListener('click',e=>{if(e.target.closest('.is-zalo'))openChat();});
 function showPop(role,text,label){clearTimeout(zaloTimer);zaloPop.className='fl-zalo-pop show '+(role==='user'?'me':'bot');
  const icon=h('i',{class:'fl-zalo-avatar'});icon.innerHTML=ZALO;zaloPop.replaceChildren(icon,h('div',{},h('small',{},label),h('span',{},text.slice(0,160))));zaloTimer=setTimeout(()=>zaloPop.classList.remove('show'),7500);}
 let personal=null,mineBusy=false,demoStep=0,zaloSig='',zaloTimer=0,simChat=null,zaloName='Zalo Bot';
 const intro=['Bạn cần hỗ trợ gì? Nhắn mình nhé.','Bạn có thể quan sát đội AI làm việc ngay trên màn hình.','Đăng nhập để bắt đầu hội thoại riêng của bạn.'];
 function renderChat(){
  chatNote.textContent=personal?'Zalo riêng · 30 tin gần nhất':simChat?'Hội thoại minh họa của '+zaloName:'Hội thoại minh họa · Chưa đăng nhập';
  const items=personal?personal.messages:simChat?simChat:intro.slice(0,demoStep+1).map(text=>({role:'bot',text}));
  chatMessages.replaceChildren(...items.map(m=>{const e=h('div',{class:'fl-message '+(m.role==='user'?'me':'bot')},h('span',{},m.text));if(m.role!=='user'){const i=h('i',{class:'fl-zalo-avatar'});i.innerHTML=ZALO;e.prepend(i);}return e;}));
  if(personal&&!items.length)chatMessages.append(h('p',{class:'fl-empty'},personal.linked?'Chưa có tin nhắn sau khi liên kết.':'Liên kết Zalo đã xác minh để xem hội thoại của bạn.'));
  if(personal&&!personal.linked)chatMessages.append(h('a',{href:'/zalo'},'Liên kết Zalo'));
  if(!personal)chatMessages.append(h('button',{type:'button',class:'fl-login',onclick:()=>openLogin?.('route',{hash:'/faciup-live'})},'Đăng nhập để trò chuyện'));
  chatStatus.textContent=personal?.processing?'Đang xử lý tin nhắn Zalo…':personal?'Hội thoại riêng · Sẵn sàng hỗ trợ':'Lời giới thiệu tự động';
  chatMessages.scrollTop=chatMessages.scrollHeight;
  const last=items.at(-1),sig=last?last.role+':'+last.text:'';
  if(sig&&sig!==zaloSig&&!simChat){zaloSig=sig;showPop(last.role,last.text,last.role==='user'?'Bạn':personal?zaloName:zaloName+' · minh họa');}
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
   const hx=cx-56*k,hy=cy-64*k,hw=112*k,hh=98*k;
   // the head: an oval cut of the picture itself (helmet, ear pieces, antenna) with a soft edge, so it can
   // turn a little about the neck without showing a seam; the eyes are redrawn on it
   const head=h('div',{class:'fl-head'});place(head,hx,hy,hw,hh);
   Object.assign(head.style,{backgroundImage:`url('${L.src}')`,backgroundSize:`${(L.w/hw*100).toFixed(2)}% ${(L.h/hh*100).toFixed(2)}%`,backgroundPosition:`${(hx/(L.w-hw)*100).toFixed(3)}% ${(hy/(L.h-hh)*100).toFixed(3)}%`});
   for(const [ex,ey] of S.eyes){const e=h('i',{class:'fl-eye'});Object.assign(e.style,{left:((ex-hx)/hw*100-5.5)+'%',top:((ey-hy)/hh*100-10)+'%'});e.style.setProperty('--d',(Math.random()*4).toFixed(2)+'s');head.append(e);}
   head.style.setProperty('--b',(Math.random()*2).toFixed(2)+'s');
   // the hands: the picture's own hands, cut in a left and a right half that tap the keys in turn
   const [ux,uy,vx,vy]=S.hands,hands=h('div',{class:'fl-hands'});place(hands,ux,uy,vx-ux,vy-uy);
   for(const side of [0,1]){const hw2=(vx-ux)/2,x=ux+side*hw2,cut=h('i',{class:'fl-hand'});
    Object.assign(cut.style,{left:side*50+'%',backgroundImage:`url('${L.src}')`,backgroundSize:`${(L.w/hw2*100).toFixed(2)}% ${(L.h/(vy-uy)*100).toFixed(2)}%`,backgroundPosition:`${(x/(L.w-hw2)*100).toFixed(3)}% ${(uy/(L.h-(vy-uy))*100).toFixed(3)}%`});hands.append(cut);}
   const keys=h('div',{class:'fl-keys'},...[0,1,2,3,4].map(i=>{const s=h('i',{});s.style.setProperty('--i',i);return s;}));place(keys,ux,vy-4*k,vx-ux,8*k);
   const halo=h('div',{class:'fl-halo'});place(halo,cx-90*k,cy-40*k,180*k,140*k);const flash=h('i',{class:'fl-flash'});place(flash,cx-70*k,cy-70*k,140*k,140*k);
   const plate=h('div',{class:'fl-plate'},h('b',{}));
   const chip=h('div',{class:'fl-chip'}),card=h('div',{class:'fl-card'},h('i',{class:'fl-card-dot'}),h('b',{}),h('span',{class:'fl-caret'}),h('div',{class:'fl-card-bar'},h('i',{})));
   // under the board there is no room above the head, so the label sits beside it, away from the board
   const B=L.board.box,side=hy-28*k<B[3]&&cx>B[0]&&cx<B[2]?(cx>(B[0]+B[2])/2?'r':'l'):'';
   for(const el of [chip,card]){Object.assign(el.style,side?{left:P(cx+(side==='r'?46:-46)*k,L.w),top:P(cy,L.h)}:{left:P(cx,L.w),top:P(hy-4*k,L.h)});if(side)el.classList.add('side-'+side);}
   const g=h('div',{class:'fl-desk'},halo,flash,head,hands,keys,chip,card);desks.append(g);plates.append(plate);
   seats[n]={g,head,plate,chip,card,flash,cx,cy,top:cy-60*k,quad:S.quad};}
  links.setAttribute('viewBox',`0 0 ${L.w} ${L.h}`);trail.setAttribute('viewBox',`0 0 ${L.w} ${L.h}`);linkKey='';
 }
 let linkKey='',linkEls=[];
 function buildLinks(agents,leadSeat){const key=agents.map(a=>a.seat+a.color).join(',')+'|'+L.src;if(key===linkKey)return;linkKey=key;links.replaceChildren();linkEls=[];
  const lead=seats[leadSeat];if(!lead)return;
  for(const a of agents){const s=seats[a.seat];if(!s||s===lead)continue;
   const mx=(s.cx+lead.cx)/2,my=Math.max(s.cy,lead.cy)+70*L.k,d=`M${s.cx} ${s.cy}Q${mx} ${my} ${lead.cx} ${lead.cy}`;
   const g=svg('g',{class:'fl-beam'}),guide=svg('path',{d,class:'fl-guide'});g.style.setProperty('--c',a.color);g.append(guide);links.append(g);
   const len=guide.getTotalLength(),dur=(len/(170*L.k)).toFixed(2);g.style.setProperty('--len',len.toFixed(1));g.style.setProperty('--dur',dur+'s');
   // each comet: a wide soft glow, a coloured body and a white head, all ending at the same point
   for(const lag of [0,.5]){const c=svg('g',{class:'fl-comet'});c.style.setProperty('--lag',(-lag*dur).toFixed(2)+'s');
    for(const [cls,seg] of [['glow',110],['tail',90],['body',44],['core',16]]){const pth=svg('path',{d,class:'fl-c-'+cls});pth.style.setProperty('--seg',seg*L.k+'px');c.append(pth);}g.append(c);}
   for(const p of [s,lead])g.append(svg('circle',{cx:p.cx,cy:p.cy,r:6*L.k,class:'fl-ripple'}));
   linkEls.push({seat:a.seat,g});}}
 function applyLayout(){(L.zalo?world:zaloCorner).append(zaloPop);if(L.zalo)Object.assign(zaloPop.style,{left:P(L.zalo[0],L.w),top:P(L.zalo[1],L.h)});else Object.assign(zaloPop.style,{left:'',top:'',maxWidth:''});room.src=L.src;room.width=L.w;room.height=L.h;page.classList.toggle('fl-tall',L===LAYOUTS.tall);stage.style.aspectRatio=`${L.w}/${L.h}`;buildBoard();buildSigns();buildDesks();fit();if(data)paint();}
 // the overlay box sits exactly over the picture; --k turns picture pixels into screen pixels for type sizes
 function fit(){const sr=stage.getBoundingClientRect();if(!sr.width)return;const k=Math.min(sr.width/L.w,sr.height/L.h),w=L.w*k,hh=L.h*k;
  Object.assign(world.style,{left:(sr.width-w)/2+'px',top:(sr.height-hh)/2+'px',width:w+'px',height:hh+'px'});world.style.setProperty('--k',k);
  for(const s of Object.values(seats))s.plate.style.transform=onQuad(PW,PH,s.quad.map(([x,y])=>[x*k,y*k]));
  if(L.zalo)zaloPop.style.maxWidth=L.zalo[2]*k+'px';}
 // a PW×PH box mapped onto four corners: the name lies on the panel as if printed on it
 const PW=300,PH=64;
 function onQuad(w,hh,[[x0,y0],[x1,y1],[x2,y2],[x3,y3]]){
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,den=dx1*dy2-dx2*dy1,g=(dx3*dy2-dx2*dy3)/den,i=(dx1*dy3-dx3*dy1)/den;
  const a=x1-x0+g*x1,b=x3-x0+i*x3,d=y1-y0+g*y1,e=y3-y0+i*y3;
  return `matrix3d(${a/w},${d/w},0,${g/w},${b/hh},${e/hh},0,${i/hh},0,0,1,0,${x0},${y0},0,1)`;}
 const ro=new ResizeObserver(fit);ro.observe(stage);
 const onPhone=()=>{L=phoneMQ.matches?LAYOUTS.tall:LAYOUTS.wide;applyLayout();};phoneMQ.addEventListener('change',onPhone);
 applyLayout();
 // ---- painting
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 function chipText(a,look){return look==='live24'?'Trực 24/7':look==='wait'?'Chờ lượt':look==='review'?'Chờ duyệt':look==='watch'?'Giám sát phiên':a.completed?a.completed+' việc hôm nay':'Sẵn sàng';}
 function paintClock(){const d=new Date(Date.now()+clockSkew+7*3600e3);clockEl.replaceChildren(pad(d.getUTCHours())+':'+pad(d.getUTCMinutes()),h('small',{},':'+pad(d.getUTCSeconds())));dateEl.textContent=`${WEEK[d.getUTCDay()]} · ${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;liveEl.className='fl-live-dot'+(stale?' off':'');liveEl.lastChild.textContent=stale?'MẤT KẾT NỐI':'TRỰC TUYẾN';}
 const sim=createSim();
 function paint(){if(!data)return;const r=data.runtime,k=r.kpi||{},b=r.board||{},meeting=r.sessions?.[0]||null,live=meeting&&['running','queued','retry'].includes(meeting.state);
  const S=r.simulate?sim(Date.now()+clockSkew,r.agents,r.simulate.level,{mainBusy:!!live&&meeting.state==='running'}):null;
  zaloName=r.agents.find(a=>a.icon==='zalo')?.name||'Zalo Bot';
  simChat=S&&!personal&&Date.now()>=zaloHold?S.chat.slice(-8):null;
  if(S)for(const e of S.events){
   if(e.type==='hand'){const from=r.agents[e.from],to=r.agents[e.to];if(from&&to)setTimeout(()=>{if(!stopped)fly(from.seat,to.seat,to.color,e.toLead);},Math.random()*950);}
   else if(e.type==='done'){if(performance.now()-lastFanfare>20000){lastFanfare=performance.now();fanfare();}}
   else if(e.type==='zalo'&&simChat){ting(e.role==='user');showPop(e.role,e.text,(e.role==='user'?'Khách hàng':zaloName)+' · minh họa');if(dialog.open)renderChat();}}
  if(r.office){if(titleEl.textContent!==r.office.title)titleEl.textContent=r.office.title;if(subEl.textContent!==r.office.subtitle)subEl.textContent=r.office.subtitle;}
  for(const s of signs.children){const name=(r.rooms||[]).find(x=>x.id===s.dataset.room)?.name||'';const words=name.toUpperCase().split(/\s+/).filter(Boolean),rows=words.length>1?[words.slice(0,words.length>2?1:1),words.slice(1)]:[words];s.firstChild.replaceChildren(...rows.map(row=>h('span',{},row.join(' '))));s.hidden=!name;}
  const values=[[r.agents.length,'Agent'],[r.running+(S?S.working:0),'Đang xử lý'],[r.review+(S?S.pending:0),'Chờ duyệt'],[(k.today||0)+(S?S.done:0),'Hoàn thành']];
  tiles.forEach((t,i)=>{t.firstChild.textContent=pad(values[i][0]);t.lastChild.textContent=values[i][1];});
  const active=r.agents.filter(a=>['work','live24','wait'].includes(LOOK[a.state])).length;
  const sb=S?{...b,...S.bars,progress:live&&meeting.state==='running'?b.progress:S.progress}:b,busyNow=S?Math.min(r.agents.length,active+S.working):active;
  [sb.progress,sb.efficiency,Math.round(busyNow/Math.max(1,r.agents.length)*100),sb.quality,sb.support,sb.internal].forEach((v,i)=>{const row=bars[i];if(!row)return;row.querySelector('i b').style.width=(v||0)+'%';row.lastChild.textContent=(v||0)+'%';});
  const leadSeat=r.agents[0]?.seat||1;buildLinks(r.agents,leadSeat);
  const used=new Set();let typers=0;
  r.agents.forEach((a,i)=>{const s=seats[a.seat];if(!s)return;used.add(String(a.seat));
   // nobody is ever shown idle-off: no work means ready. The lead takes the brief, watches the
   // session while the members work, and writes the result at the end
   let look=LOOK[a.state]||'idle',task=ROLE[a.icon]||'Đang xử lý';
   if(i===0&&live){look=meeting.current===0&&meeting.state==='running'?'work':'watch';task=meeting.current!==0?'Giám sát phiên':meeting.step>0?'Tổng hợp kết quả':'Nhận việc';}
   // a Zalo reply takes seconds: keep the desk busy a moment so every message is seen
   if(a.icon==='zalo'&&Date.now()<zaloHold)look='work';
   const sd=S?.desk[i];if(sd&&['idle','live24'].includes(look)&&!(i===0&&live)&&!(a.icon==='zalo'&&Date.now()<zaloHold)){look=sd.look;if(sd.task)task=sd.task;}
   const done=(a.completed||0)+(S?.count[i]||0);
   const work=look==='work'||(a.live&&a.state==='running');
   s.g.className='fl-desk is-'+look+(work?' is-work':'')+(look==='watch'?' is-watch':'')+(i===0?' is-lead':'')+(a.icon==='zalo'?' is-zalo':'');if(work)typers++;s.g.style.setProperty('--c',a.color);s.g.hidden=false;
   if(s.plate.firstChild.textContent!==a.name){s.plate.firstChild.textContent=a.name;s.plate.style.setProperty('--fit',Math.min(1,12/Math.max(6,a.name.length)).toFixed(3));}
   s.chip.textContent=chipText({...a,completed:done},look);
   s.card.querySelector('b').textContent=`${a.name} · ${task}`;
   s.card.querySelector('.fl-card-bar i').style.width=Math.min(96,a.avg?runFor(a)/a.avg*100:45)+'%';
   for(const l of linkEls)if(l.seat===a.seat)l.g.classList.toggle('on',work);
  });
  for(const [n,s] of Object.entries(seats)){s.plate.hidden=!used.has(n);if(!used.has(n))s.g.hidden=true;}
  lastTypers=typers;paintClock();
 }
 // the file flies along a curve from one desk to the next, with the bell
 let lastBell=0,lastFanfare=0;
 function fly(fromSeat,toSeat,color,toLead){const now=performance.now();if(now-lastBell>1400){lastBell=now;chime(toLead);}if(reduce)return;const a=seats[fromSeat],b=seats[toSeat];if(!a||!b)return;
  const d=`M${a.cx} ${a.top}Q${(a.cx+b.cx)/2} ${Math.min(a.top,b.top)-90*L.k} ${b.cx} ${b.top}`,k=L.k,big=4000;
  const g=svg('g',{class:'fl-fly'});g.style.setProperty('--c',color);trail.append(g);
  const layers=[['glow',190],['tail2',170],['tail',110],['body',55],['core',22]].map(([cls,seg])=>{const pth=svg('path',{d,class:'fl-f-'+cls,'stroke-dasharray':`${seg*k} ${big}`});g.append(pth);return [pth,seg*k];});
  const len=layers[0][0].getTotalLength(),doc=h('div',{class:'fl-doc'});doc.innerHTML=DOC;world.append(doc);
  const t0=performance.now(),T=Math.min(3000,1800+len*.6);let sparkAt=0;
  const go=now=>{if(stopped){g.remove();doc.remove();return;}const u=Math.min(1,(now-t0)/T),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2,dist=e*len,p=layers[0][0].getPointAtLength(dist);
   for(const [pth,seg] of layers)pth.setAttribute('stroke-dashoffset',String(seg-dist));
   doc.style.left=P(p.x,L.w);doc.style.top=P(p.y,L.h);
   if(now-sparkAt>28&&u<.97){sparkAt=now;const sp=svg('circle',{cx:p.x+(Math.random()-.5)*12*k,cy:p.y+(Math.random()-.5)*12*k,r:(1.6+Math.random()*2.8)*k,class:'fl-sparkle'});
    sp.style.setProperty('--dx',(Math.random()-.5)*26*k+'px');sp.style.setProperty('--dy',(8+Math.random()*22)*k+'px');g.append(sp);setTimeout(()=>sp.remove(),900);}
   if(u<1)requestAnimationFrame(go);
   else{doc.remove();const ring=svg('circle',{cx:b.cx,cy:b.top+20*k,r:10*k,class:'fl-burst'});g.append(ring);b.flash.classList.remove('on');void b.flash.offsetWidth;b.flash.classList.add('on');
    g.classList.add('out');setTimeout(()=>g.remove(),900);}};
  requestAnimationFrame(go);}
 let lastTypers=0;const lastTurn=new Map();let zaloHold=0,zaloSeen=-1,pulseSig={jobs:'',zalo:''},pulseBusy=false;
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');clockSkew=(data.runtime?.polledAt||Date.now())-Date.now();stale=false;}catch{stale=true;}finally{busy=false;}
  if(stopped||!data)return;page.classList.toggle('fl-stale',stale);const r=data.runtime;r.sessions=r.sessions||[];
  const za=r.agents.find(a=>a.icon==='zalo');if(za){if(za.state==='running'||(zaloSeen>=0&&za.received>zaloSeen))zaloHold=Date.now()+6000;zaloSeen=za.received||0;}
  for(const s of r.sessions){const was=lastTurn.get(s.n);if(was!==undefined&&was!==s.current){const from=r.agents[was],to=r.agents[s.current];if(from&&to)fly(from.seat,to.seat,to.color,s.current===0);}lastTurn.set(s.n,s.current);}
  paint();}
 load();loadMine();
 const demo=setInterval(()=>{if(!personal&&!simChat&&!reduce&&!document.hidden){demoStep=(demoStep+1)%intro.length;renderChat();}},6000);
 async function pulse(){if(stopped||pulseBusy||document.hidden)return;pulseBusy=true;
  try{const p=await api('/api/faciup-live/pulse');stale=false;
   if(!pulseSig.jobs&&!pulseSig.zalo)pulseSig=p;
   else if(p.jobs!==pulseSig.jobs||p.zalo!==pulseSig.zalo){const zaloMoved=p.zalo!==pulseSig.zalo;pulseSig=p;await load();if(zaloMoved||dialog.open)loadMine();}}
  catch{stale=true;page.classList.add('fl-stale');}finally{pulseBusy=false;}}
 const tick=setInterval(()=>{paintClock();if(data)paint();typing(lastTypers);},1000),poll=setInterval(pulse,3000),pollFull=setInterval(load,30000),pollMine=setInterval(()=>{if(dialog.open)loadMine();},3000),visible=()=>{if(!document.hidden){load();loadMine();}};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;ro.disconnect();phoneMQ.removeEventListener('change',onPhone);personal=null;dialog.close();clearInterval(tick);clearInterval(poll);clearInterval(pollFull);clearInterval(pollMine);clearInterval(demo);document.removeEventListener('visibilitychange',visible);};
}
