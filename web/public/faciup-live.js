// Faciup Live: two rooms. "Điều hành" has FACIUP in the centre with the idle robots circling it;
// "Phòng họp" seats the robots of the current session round a table, and when the turn passes the
// file flies from one robot to the next (or back to FACIUP). Beside it, how long each agent takes and
// the latest handovers; below, the team KPIs. Everything comes from /api/faciup-live (times and
// public names only); agents added in Quản trị → Nhóm AI appear on their own. Work is given in the
// admin pages, never here.
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
const LOOK={running:'work',live24:'live24',queued:'wait',retry:'wait',review:'review',paused:'off',disabled:'off',idle:'idle',unknown:'off'};
// chairs round the table, in table half-widths/heights
const SEATS=[[0,-1.5],[1.3,-.8],[1.3,.85],[0,1.6],[-1.3,.85],[-1.3,-.8]];
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

export function showLive({h,show,api,footer}){
 let stopped=false,busy=false,data=null,stale=false,raf=0,last=performance.now(),clockSkew=0;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const orbits=document.createElementNS(NS,'svg');orbits.setAttribute('viewBox','0 0 600 520');orbits.setAttribute('preserveAspectRatio','none');orbits.setAttribute('class','fl-bg');orbits.setAttribute('aria-hidden','true');
 const trail=document.createElementNS(NS,'svg');trail.setAttribute('class','fl-trail');trail.setAttribute('aria-hidden','true');
 const execN=h('small',{}),meetN=h('small',{}),tray=h('div',{class:'fl-tray'}),hub=h('div',{class:'fl-hub'},h('div',{class:'fl-core'},h('b',{},'FACIUP')));
 const exec=h('section',{class:'fl-room fl-exec','aria-label':'Phòng điều hành'},h('h2',{},h('i',{},'⌘'),'Phòng điều hành',execN),orbits,hub,tray);
 const table=h('div',{class:'fl-table'}),session=h('div',{class:'fl-session'}),empty=h('div',{class:'fl-empty'},'Chưa có phiên họp');
 const meet=h('section',{class:'fl-room fl-meet','aria-label':'Phòng họp'},h('h2',{},h('i',{},'☷'),'Phòng họp',meetN),table,session,empty);
 const rooms=h('div',{class:'fl-rooms'},exec,meet,trail);
 const times=h('ul',{class:'fl-times'}),count=h('small',{}),log=h('ul',{class:'fl-log'});
 const side=h('aside',{class:'fl-side'},h('div',{class:'fl-panel'},h('h2',{},'Thời gian xử lý',count),times),h('div',{class:'fl-panel'},h('h2',{},'Bàn giao gần đây'),log));
 const kpis=h('section',{class:'fl-kpis','aria-label':'Chỉ số hoạt động'});
 const page=h('div',{class:'fl-live'},h('h1',{class:'sr'},'Faciup Live'),rooms,side,kpis);
 show(page,footer());
 let bots=[],key='',meeting=null;const lastTurn=new Map();
 function build(list){
  const k=list.map(a=>a.id+a.name+a.color+a.icon).join('|');if(k===key)return;key=k;
  const keep=new Map(bots.map(b=>[b.id,b]));orbits.replaceChildren();
  bots=list.map((s,j)=>{const i=j+1,old=keep.get(s.id);keep.delete(s.id);
   const ring=j%3,o=old?.o||{rx:[150,205,250][ring],ry:[92,130,165][ring],tilt:([-14,10,-4][ring]+j*6)*Math.PI/180,ph:j/list.length*Math.PI*2,sp:(.06+.025*ring)*(j%2?-1:1)};
   if(j<3){const e=document.createElementNS(NS,'ellipse');for(const [a,v] of Object.entries({cx:300,cy:285,rx:o.rx,ry:o.ry,transform:`rotate(${o.tilt*180/Math.PI} 300 285)`,class:'fl-orbit'}))e.setAttribute(a,v);orbits.append(e);}
   let el=old?.el;
   if(!el||old.icon!==s.icon||old.color!==s.color){old?.el.remove();el=h('div',{class:'fl-bot fl-new',role:'img','aria-label':s.name});el.style.setProperty('--c',s.color);
    el.innerHTML=`<div class="fl-bubble"></div><i class="fl-pulse"></i><div class="fl-shadow"></div><div class="fl-body">${robot(s.color,s.icon,j+'_'+s.id.replace(/\W/g,''))}</div><div class="fl-tag"><b></b><span></span></div>`;
    rooms.append(el);setTimeout(()=>el.classList.remove('fl-new'),900);}
   return {id:s.id,i,icon:s.icon,color:s.color,el,o,s,pos:old?.pos||null,left:false};});
  for(const b of keep.values())b.el.remove();}
 const rel=(el,fx,fy)=>{const r=el.getBoundingClientRect(),p=rooms.getBoundingClientRect();return [r.left-p.left+r.width*fx,r.top-p.top+r.height*fy,r];};
 const hubPos=()=>{const [x,y]=rel(hub,.5,.5);return [x,y];};
 function target(b){
  const seat=meeting?meeting.members.indexOf(b.i):-1;
  if(seat>=0&&!b.s.live){const [cx,cy]=rel(table,.5,.5),[mx,my,mr]=rel(meet,0,0),tr=table.getBoundingClientRect(),s=SEATS[seat%SEATS.length],w=b.el.offsetWidth;
   // keep the robot and its name tag inside the room on small screens
   return [Math.min(Math.max(cx+s[0]*tr.width*.5,mx+w/2+4),mx+mr.width-w/2-4),Math.min(Math.max(cy+s[1]*tr.height*.55+28,my+b.el.offsetHeight+44),my+mr.height-30)];}
  const [ex,ey,r]=rel(exec,0,0),sx=r.width/600,sy=r.height/520,o=b.o,x0=o.rx*Math.cos(o.ph),y0=o.ry*Math.sin(o.ph);
  return [ex+(300+x0*Math.cos(o.tilt)-y0*Math.sin(o.tilt))*sx,ey+(285+x0*Math.sin(o.tilt)+y0*Math.cos(o.tilt))*sy+28];}
 function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;const off=stale||!data?.runtime?.enabled;
  for(const b of bots){const inMeet=meeting&&meeting.members.includes(b.i)&&!b.s.live;
   if(!inMeet&&(!off||b.s.live)&&!reduce)b.o.ph+=b.o.sp*dt*(LOOK[b.s.state]==='work'?2.2:1);
   const [tx,ty]=target(b);if(!b.pos||reduce)b.pos=[tx,ty];
   const dx=tx-b.pos[0],dy=ty-b.pos[1],d=Math.hypot(dx,dy),v=d>40?380*dt:d;
   if(d>v){b.pos[0]+=dx/d*v;b.pos[1]+=dy/d*v;}else b.pos=[tx,ty];
   if(Math.abs(dx)>2&&d>40)b.left=dx<0;
   b.el.classList.toggle('fl-walk',d>40);b.el.classList.toggle('fl-left',b.left);
   b.el.style.transform=`translate(${(b.pos[0]-b.el.offsetWidth/2).toFixed(1)}px,${(b.pos[1]-b.el.offsetHeight).toFixed(1)}px)`;
   b.el.style.zIndex=5+Math.round(b.pos[1]/10);}
  if(!stopped)raf=requestAnimationFrame(frame);}
 // the file flies along a curve from one seat to the next (index 0 = FACIUP)
 function fly(from,to,color){if(reduce)return;const at=i=>{const b=bots.find(x=>x.i===i);return i===0||!b?.pos?hubPos():[b.pos[0],b.pos[1]-b.el.offsetHeight*.6];};
  const p0=at(from),p1=at(to),r=rooms.getBoundingClientRect();trail.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
  const mid=[(p0[0]+p1[0])/2,Math.min(p0[1],p1[1])-90],path=document.createElementNS(NS,'path');
  for(const [a,v] of Object.entries({d:`M${p0[0]} ${p0[1]} Q${mid[0]} ${mid[1]} ${p1[0]} ${p1[1]}`,stroke:color,class:'fl-path'}))path.setAttribute(a,v);trail.append(path);
  const doc=h('div',{class:'fl-doc'});doc.innerHTML=DOC;rooms.append(doc);
  const L=path.getTotalLength();let k=0;const go=()=>{if(stopped)return;k+=1/85;const p=path.getPointAtLength(Math.min(1,k)*L);doc.style.transform=`translate(${p.x-15}px,${p.y-12}px)`;if(k<1)requestAnimationFrame(go);else{doc.remove();setTimeout(()=>path.remove(),300);}};go();}
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 const nameOf=i=>i===0?'FACIUP':data.runtime.agents[i]?.name||'Agent';
 function tagText(s,look){return look==='live24'?`Trực 24/7 · ~${fmt(s.avg)}`:look==='work'?`Đang xử lý ${fmt(runFor(s))}`:look==='wait'?`Chờ lượt${s.avg?' · ~'+fmt(s.avg):''}`:look==='review'?'Chờ duyệt':look==='off'?(stale?'Mất kết nối':'Nhóm đang tắt'):s.avg?`TB ${fmt(s.avg)}/lượt`:'Sẵn sàng';}
 function paint(){const r=data.runtime,lead=r.agents[0];
  hub.dataset.state=stale?'off':meeting?.current===0||LOOK[lead?.state]==='work'?'work':LOOK[lead?.state]||'idle';
  tray.textContent='Chờ duyệt · '+r.review;tray.classList.toggle('on',r.review>0);
  for(const b of bots){const look=stale?'off':LOOK[b.s.state]||'idle',turn=meeting?.current===b.i;
   b.el.className='fl-bot fl-'+look+(b.el.classList.contains('fl-new')?' fl-new':'')+(b.el.classList.contains('fl-walk')?' fl-walk':'')+(b.left?' fl-left':'')+(b.s.live?' fl-24':'')+(turn?' fl-turn':'');
   b.el.querySelector('b').textContent=b.s.name;b.el.querySelector('.fl-tag span').textContent=tagText(b.s,look);
   b.el.querySelector('.fl-bubble').textContent=turn?`Lượt ${meeting.step+1}`:'';}
  const others=r.sessions.length-1;
  session.replaceChildren(...(meeting?[h('b',{},'Phiên #'+meeting.n),h('span',{},`Lượt ${meeting.step+1} · ${nameOf(meeting.current)}`),others>0?h('small',{},`+${others} phiên chờ`):'']:[]));
  empty.classList.toggle('on',!meeting);
  const inExec=bots.filter(b=>b.s.live||!meeting?.members.includes(b.i)).length;
  execN.textContent=`${inExec+1} agent · ${vn(Date.now())} · ${stale?'mất kết nối':r.enabled?'trực tuyến':'nhóm AI đang tắt'}`;
  meetN.textContent=meeting?meeting.members.length+' agent đang họp':'';
  const rows=[...(lead?[{s:{...lead,name:'FACIUP · tổng hợp',color:'#a21caf'}}]:[]),...bots];
  if(times.children.length!==rows.length)times.replaceChildren(...rows.map(()=>h('li',{},h('i',{}),h('span',{}),h('span',{class:'t'}),h('span',{class:'bar'},h('b',{})))));
  rows.forEach((a,i)=>{const li=times.children[i],s=a.s,look=stale?'off':LOOK[s.state]||'idle',el=runFor(s);li.style.setProperty('--c',s.color);li.className=look==='work'||look==='live24'?'fl-row-on':look==='off'?'fl-row-off':'';
   li.children[1].textContent=s.name;
   li.children[2].innerHTML=look==='live24'?`${fmt(s.avg)}<small>phản hồi TB · trực 24/7</small>`:look==='work'?`${fmt(el)}<small>đang xử lý${s.avg?' · TB '+fmt(s.avg):''}</small>`
    :look==='wait'?`${s.avg?'~'+fmt(s.avg):'—'}<small>chờ tới lượt</small>`:look==='review'?`${fmt(s.avg)}<small>chờ duyệt</small>`:`${s.avg?fmt(s.avg):'—'}<small>${s.avg?'trung bình / lượt':s.completed?s.completed+' lượt hôm nay':'chưa có lượt'}</small>`;
   li.querySelector('.bar b').style.width=(look==='work'&&s.avg?Math.min(100,el/s.avg*100):look==='live24'?100:0)+'%';});
  count.textContent=r.agents.length+' agent';}
 function paintLog(){const list=data.runtime.handovers||[],seen=new Set([...log.children].map(li=>li.dataset.k));
  if(!list.length){log.replaceChildren(h('li',{class:'fl-none'},'Chưa có bàn giao trong 24 giờ'));return;}
  log.replaceChildren(...list.map(x=>{const k=x.agent+':'+x.at,a=data.runtime.agents[x.agent],li=h('li',{'data-k':k,class:seen.has(k)||!seen.size?'':'fl-in'},h('time',{},vn(x.at)),h('i',{}),h('span',{},h('b',{},nameOf(x.agent)),x.agent===0?' tổng hợp, gửi chờ duyệt':' xong lượt, bàn giao hồ sơ'));li.style.setProperty('--c',x.agent===0?'#a21caf':a?.color||'#7c3aed');return li;}));}
 function spark(vals,c){const max=Math.max(1,...vals),pts=vals.map((v,i)=>`${i/(vals.length-1)*200},${42-v/max*36}`).join(' '),id='g'+c.slice(1);
  return `<svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><polygon points="0,44 ${pts} 200,44" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;}
 function gauge(p){const r=28,c=2*Math.PI*r;return `<svg viewBox="0 0 70 70" aria-hidden="true"><defs><linearGradient id="flg"><stop offset="0" stop-color="#7c3aed"/><stop offset=".6" stop-color="#f43f5e"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><circle cx="35" cy="35" r="${r}" fill="none" stroke="#f3ecff" stroke-width="8"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="url(#flg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 35 35)"/></svg>`;}
 function paintKpis(){const r=data.runtime,k=r.kpi||{},d=k.yesterday?Math.round((k.today-k.yesterday)/k.yesterday*100):null,dt=k.avgToday&&k.avgYesterday?k.avgToday-k.avgYesterday:null,mx=Math.max(1,...(k.top||[]).map(x=>x.n));
  kpis.innerHTML=`<div class="fl-kpi"><div class="lbl">Lượt hoàn thành hôm nay</div><div class="val">${k.today||0}<small>lượt</small></div><div class="delta ${d<0?'down':''}">${d===null?'Chưa có số hôm qua':(d>=0?'▲ ':'▼ ')+Math.abs(d)+'% so với hôm qua'}</div>${spark(k.series||[0,0,0,0,0,0,0],'#a21caf')}</div>
  <div class="fl-kpi"><div class="lbl">Phiên họp hiện tại</div><div class="trio"><div><b class="fl-hot">${r.running}</b><span>Đang xử lý</span></div><div><b>${r.queued}</b><span>Chờ lượt</span></div><div><b>${r.review}</b><span>Chờ duyệt</span></div></div></div>
  <div class="fl-kpi"><div class="lbl">Thời gian TB mỗi lượt</div><div class="val">${k.avgToday?fmt(k.avgToday):'—'}</div><div class="delta ${dt>0?'down':''}">${!k.avgToday?'Hôm nay chưa có lượt':dt===null?'Chưa có số hôm qua':dt<=0?`▼ ${Math.abs(dt)} giây, nhanh hơn hôm qua`:`▲ ${dt} giây so với hôm qua`}</div></div>
  <div class="fl-kpi"><div class="lbl">Tỉ lệ được duyệt · 30 ngày</div><div class="gauge">${gauge(k.decided?k.approved/k.decided:0)}<div><div class="val">${k.decided?Math.round(k.approved/k.decided*100)+'%':'—'}</div><div class="delta">${k.decided?`${k.approved}/${k.decided} kết quả`:'Chưa có kết quả duyệt'}</div></div></div></div>
  <div class="fl-kpi"><div class="lbl">Làm nhiều nhất hôm nay</div>${k.top?.length?`<ul class="fl-top">${k.top.map(x=>`<li data-c="${x.color}" data-w="${x.n/mx*100}"><span></span><span class="fl-b"><i></i></span><span>${x.n}</span></li>`).join('')}</ul>`:'<p class="delta">Chưa có lượt hôm nay</p>'}</div>`;
  kpis.querySelectorAll('.fl-top li').forEach((li,i)=>{li.firstChild.textContent=k.top[i].name===r.agents[0]?.name?'FACIUP':k.top[i].name;li.style.setProperty('--c',li.dataset.c);li.querySelector('i').style.width=li.dataset.w+'%';});}
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');clockSkew=(data.runtime?.polledAt||Date.now())-Date.now();stale=false;}catch{stale=true;}finally{busy=false;}
  if(stopped)return;page.classList.toggle('fl-stale',stale);if(!data)return;
  const r=data.runtime;r.sessions=r.sessions||[];build(r.agents.slice(1));
  // a session whose turn moved since the last poll hands its file on
  for(const s of r.sessions){const was=lastTurn.get(s.n);if(was!==undefined&&was!==s.current&&s.n===r.sessions[0].n)fly(was,s.current,s.current===0?'#a21caf':r.agents[s.current]?.color||'#f97316');lastTurn.set(s.n,s.current);}
  meeting=r.sessions[0]||null;paint();paintLog();paintKpis();}
 load();raf=requestAnimationFrame(frame);
 const tick=setInterval(()=>{if(data)paint();},1000),poll=setInterval(load,10000),visible=()=>{if(!document.hidden)load();};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;cancelAnimationFrame(raf);clearInterval(tick);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
}
