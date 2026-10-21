// Faciup Live: FACIUP in the centre, the AI team as glossy orbs drifting on tilted orbits (the back
// of an orbit passes behind FACIUP), a working agent speeds up and beams to the centre. Beside it,
// how long each agent takes; below, the team KPIs. Everything comes from /api/faciup-live; agents
// added in Quản trị → Nhóm AI appear on their own. Giving work happens in the admin pages.
const NS='http://www.w3.org/2000/svg',IW='#fff',IS='rgba(255,255,255,.55)';
const ICONS={
 coordinator:`<circle cx="12" cy="12" r="9" fill="${IS}"/><circle cx="12" cy="12" r="4.5" fill="${IW}"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" stroke="${IW}" stroke-width="2.2" stroke-linecap="round"/>`,
 target:`<circle cx="12" cy="12" r="9" fill="${IS}"/><circle cx="12" cy="12" r="6" fill="${IW}"/><circle cx="12" cy="12" r="3" fill="${IS}"/><path d="M12 12l7-7" stroke="${IW}" stroke-width="2.2" stroke-linecap="round"/>`,
 search:`<circle cx="10.5" cy="10.5" r="7" fill="${IW}"/><circle cx="10.5" cy="10.5" r="4.4" fill="${IS}"/><rect x="15" y="14.2" width="3.6" height="8" rx="1.8" transform="rotate(-45 16.8 18.2)" fill="${IW}"/>`,
 pen:`<path d="M15.5 3.5l5 5L9 20H4v-5z" fill="${IW}"/><path d="M13 6l5 5" stroke="${IS}" stroke-width="2.4"/><path d="M4 15l5 5H4z" fill="${IS}"/>`,
 check:`<rect x="4.5" y="4" width="15" height="17" rx="3" fill="${IW}"/><rect x="8.5" y="2.5" width="7" height="4" rx="1.5" fill="${IS}"/><path d="M8 13l3 3 5-6" stroke="var(--c)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
 mega:`<path d="M4 9.5h3l9-5v15l-9-5H4z" fill="${IW}"/><rect x="6" y="14" width="3.4" height="6" rx="1.5" fill="${IS}"/><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5" stroke="${IW}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
 chart:`<rect x="3.5" y="13" width="4" height="7.5" rx="1.2" fill="${IS}"/><rect x="10" y="8" width="4" height="12.5" rx="1.2" fill="${IW}"/><rect x="16.5" y="4" width="4" height="16.5" rx="1.2" fill="${IW}"/>`,
 zalo:`<path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="${IW}"/><path d="M7.5 9h5l-5 5h5" stroke="var(--c)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.5" cy="11.5" r="2" fill="var(--c)"/>`,
 news:`<path d="M12 12L4.5 7.5A8.6 8.6 0 0 1 12 3.4z" fill="${IS}"/><circle cx="12" cy="12" r="8.6" fill="none" stroke="${IW}" stroke-width="2"/><circle cx="12" cy="12" r="4.8" fill="none" stroke="${IS}" stroke-width="1.6"/><circle cx="12" cy="12" r="1.8" fill="${IW}"/><circle cx="16.5" cy="7.5" r="1.6" fill="${IW}"/>`,
 design:`<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2-.4-1.2.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7 17 3 12 3z" fill="${IW}"/><circle cx="7.6" cy="11" r="1.7" fill="#f472b6"/><circle cx="10" cy="7" r="1.7" fill="#60a5fa"/><circle cx="14.6" cy="7" r="1.7" fill="#facc15"/><circle cx="17" cy="11" r="1.7" fill="#34d399"/>`,
 video:`<rect x="2.5" y="6" width="13.5" height="12" rx="3" fill="${IW}"/><path d="M16 10.5l5.5-3.5v10l-5.5-3.5z" fill="${IS}"/><circle cx="7" cy="10" r="1.6" fill="var(--c)"/>`,
 spark:`<path d="M12 2.5l2.4 6.6 6.6 2.4-6.6 2.4L12 20.5l-2.4-6.6-6.6-2.4 6.6-2.4z" fill="${IW}"/><circle cx="19" cy="5" r="1.6" fill="${IS}"/>`,
};
// server state → how an agent looks and moves
const LOOK={running:'work',live24:'live24',queued:'wait',retry:'wait',review:'review',paused:'off',disabled:'off',idle:'idle',unknown:'off'};
const pad=n=>String(n).padStart(2,'0');
const fmt=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+pad(s%60);};
const vn=t=>{const d=new Date(t+7*3600e3);return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes());};
const svgIcon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]||ICONS.spark}</svg>`;

export function showLive({h,show,api,footer,admin=false}){
 let stopped=false,busy=false,data=null,stale=false,raf=0,last=performance.now(),clockSkew=0;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const bg=document.createElementNS(NS,'svg');bg.setAttribute('viewBox','0 0 1000 700');bg.setAttribute('preserveAspectRatio','none');bg.setAttribute('class','fl-bg');bg.setAttribute('aria-hidden','true');
 const stage=h('section',{class:'fl-stage','aria-label':'Đội AI FACIUP đang vận hành'},bg,h('div',{class:'fl-hub'},h('div',{class:'fl-core'},h('b',{},'FACIUP'))));
 const now=h('div',{class:'fl-now'},h('i',{}),h('span',{},'Đang kết nối…'));
 const legend=h('div',{class:'fl-legend'},h('span',{},h('i',{style:'background:#f97316'}),'Sáng + tia về tâm: đang xử lý'),h('span',{},h('i',{style:'background:#c4b8e6'}),'Nhấp nháy: chờ tới lượt'),h('span',{},h('i',{style:'background:#22c55e'}),'Chấm xanh: trực 24/7'));
 stage.append(now,legend);
 const times=h('ul',{class:'fl-times'}),count=h('small',{});
 const side=h('aside',{class:'fl-panel'},h('h2',{},'Thời gian xử lý',count),times);
 const kpis=h('section',{class:'fl-kpis','aria-label':'Chỉ số hoạt động'});
 const page=h('div',{class:'fl-live'},h('h1',{class:'sr'},'Faciup Live'),stage,side,kpis,admin?h('a',{class:'fl-admin',href:'/admin/nhom-ai'},'Giao việc & thêm agent trong Quản trị ↗'):null);
 show(page,footer());
 let agents=[],key='';
 function build(list){
  const k=list.map(a=>a.id+a.name+a.color+a.icon).join('|');if(k===key)return;key=k;
  const keep=new Map(agents.map(a=>[a.id,a]));bg.replaceChildren();
  agents=list.map((s,i)=>{
   const old=keep.get(s.id);keep.delete(s.id);
   const ring=i%3,o={rx:[245,325,410][ring],ry:[155,212,268][ring],tilt:([-18,12,-6][ring]+i*5)*Math.PI/180,phase:old?.o.phase??(i/list.length)*Math.PI*2,speed:(.05+.03*((i*7)%4)/3)*(i%2?-1:1),wob:old?.o.wob??i};
   const orbit=document.createElementNS(NS,'ellipse');for(const [a,v] of Object.entries({cx:500,cy:350,rx:o.rx,ry:o.ry,transform:`rotate(${o.tilt*180/Math.PI} 500 350)`,class:'fl-orbit'}))orbit.setAttribute(a,v);bg.append(orbit);
   const beam=document.createElementNS(NS,'line');for(const [a,v] of Object.entries({x1:500,y1:350,x2:500,y2:350,class:'fl-beam',stroke:s.color}))beam.setAttribute(a,v);bg.append(beam);
   let el=old?.el;
   if(!el||old.icon!==s.icon||old.color!==s.color){old?.el.remove();el=h('button',{type:'button',class:'fl-ag'+(old?'':' fl-new'),'aria-label':s.name});el.style.setProperty('--c',s.color);
    el.innerHTML=`<i class="fl-pulse"></i><span class="fl-floor"></span><span class="fl-dot">${svgIcon(s.icon)}</span><span class="fl-tag"><b></b><small></small></span>`;el.querySelector('.fl-dot').style.setProperty('--d',((i*.7)%3.6)+'s');stage.append(el);setTimeout(()=>el.classList.remove('fl-new'),900);}
   return {id:s.id,icon:s.icon,color:s.color,el,beam,o,s};
  });
  for(const a of keep.values())a.el.remove();
 }
 function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;const r=stage.getBoundingClientRect(),sx=r.width/1000,sy=r.height/700,narrow=r.width<560,off=stale||!data?.runtime?.enabled;
  for(const a of agents){const look=stale?'off':LOOK[a.s.state]||'idle',moving=!off||a.s.live;
   if(moving&&!reduce){a.o.phase+=a.o.speed*dt*(look==='work'?3.2:1);a.o.wob+=dt*.8;}
   const rx=a.o.rx*(narrow?1.08:1),ry=a.o.ry*(narrow?1.35:1),x0=rx*Math.cos(a.o.phase),y0=ry*Math.sin(a.o.phase)+Math.sin(a.o.wob)*8;
   const x=500+x0*Math.cos(a.o.tilt)-y0*Math.sin(a.o.tilt),y=350+x0*Math.sin(a.o.tilt)+y0*Math.cos(a.o.tilt);
   const px=Math.min(Math.max(x*sx,16),r.width-16),py=Math.min(Math.max(y*sy,16),r.height-16);
   // depth: the back of an orbit is smaller, softer and passes behind FACIUP; a slight tilt follows the motion
   const depth=Math.sin(a.o.phase),sc=.8+.28*(depth+1)/2,half=narrow?14:18;
   a.el.style.transform=`translate(${px-half}px,${py-half}px) scale(${sc.toFixed(3)})`;a.el.style.zIndex=depth<0?2:5;a.el.style.opacity=(off&&!a.s.live?.6:.72+.28*(depth+1)/2).toFixed(2);
   a.el.querySelector('.fl-dot').style.transform=`perspective(120px) rotateY(${(-a.o.speed*Math.sin(a.o.phase)*120).toFixed(1)}deg) rotateX(${(depth*10).toFixed(1)}deg)`;
   a.el.classList.toggle('fl-flip',narrow?x>500:x<500);
   a.beam.setAttribute('x2',x);a.beam.setAttribute('y2',y);a.beam.classList.toggle('on',look==='work'||look==='live24');}
  if(!stopped)raf=requestAnimationFrame(frame);}
 // a working agent's clock counts every second between polls
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 function tagText(s,look){return look==='live24'?`Trực 24/7 · phản hồi ~${fmt(s.avg)}`:look==='work'?`Đang xử lý ${fmt(runFor(s))}`:look==='wait'?`Chờ${s.avg?' · ~'+fmt(s.avg):' tới lượt'}`:look==='review'?'Chờ duyệt':look==='off'?(stale?'Mất kết nối':'Nhóm đang tắt'):s.avg?`TB ${fmt(s.avg)}/lượt`:'Sẵn sàng';}
 function paintAgents(){
  const lead=data.runtime.agents[0],hub=stage.querySelector('.fl-hub');hub.dataset.state=stale?'off':LOOK[lead?.state]||'idle';
  for(const a of agents){const look=stale?'off':LOOK[a.s.state]||'idle';a.el.className='fl-ag fl-'+look+(a.el.classList.contains('fl-new')?' fl-new':'')+(a.el.classList.contains('fl-flip')?' fl-flip':'')+(a.s.live?' fl-24':'');
   a.el.querySelector('b').textContent=a.s.name;a.el.querySelector('small').textContent=tagText(a.s,look);}
  const rows=[...(lead?[{s:{...lead,name:'FACIUP · tổng hợp',color:'#c026d3'}}]:[]),...agents];
  if(times.children.length!==rows.length)times.replaceChildren(...rows.map(()=>h('li',{},h('i',{}),h('span',{}),h('span',{class:'t'}),h('span',{class:'bar'},h('b',{})))));
  rows.forEach((a,i)=>{const li=times.children[i],s=a.s,look=stale?'off':LOOK[s.state]||'idle',el=runFor(s);li.style.setProperty('--c',s.color);li.className=look==='work'||look==='live24'?'fl-row-on':look==='off'?'fl-row-off':'';
   li.children[1].textContent=s.name;
   li.children[2].innerHTML=look==='live24'?`${fmt(s.avg)}<small>phản hồi TB · trực 24/7</small>`:look==='work'?`${fmt(el)}<small>đang xử lý${s.avg?' · TB '+fmt(s.avg):''}</small>`
    :look==='wait'?`${s.avg?'~'+fmt(s.avg):'—'}<small>chờ tới lượt</small>`:look==='review'?`${fmt(s.avg)}<small>chờ duyệt</small>`:`${s.avg?fmt(s.avg):'—'}<small>${s.avg?'trung bình / lượt':s.completed?s.completed+' lượt hôm nay':'chưa có lượt'}</small>`;
   li.querySelector('.bar b').style.width=(look==='work'&&s.avg?Math.min(100,el/s.avg*100):look==='live24'?100:0)+'%';});
  count.textContent=data.runtime.agents.length+' agent';}
 function spark(vals,c){const max=Math.max(1,...vals),pts=vals.map((v,i)=>`${i/(vals.length-1)*200},${42-v/max*36}`).join(' '),id='g'+c.slice(1);
  return `<svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><polygon points="0,44 ${pts} 200,44" fill="url(#${id})"/><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;}
 function gauge(p){const r=28,c=2*Math.PI*r;return `<svg viewBox="0 0 70 70" aria-hidden="true"><defs><linearGradient id="flg"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><circle cx="35" cy="35" r="${r}" fill="none" stroke="#f0ebf9" stroke-width="8"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="url(#flg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 35 35)"/></svg>`;}
 function paintKpis(){const r=data.runtime,k=r.kpi||{},d=k.yesterday?Math.round((k.today-k.yesterday)/k.yesterday*100):null,dt=k.avgToday&&k.avgYesterday?k.avgToday-k.avgYesterday:null,mx=Math.max(1,...(k.top||[]).map(x=>x.n));
  kpis.innerHTML=`<div class="fl-kpi"><div class="lbl">Lượt hoàn thành hôm nay</div><div class="val">${k.today||0}<small>lượt</small></div><div class="delta ${d<0?'down':''}">${d===null?'Chưa có số hôm qua':(d>=0?'▲ ':'▼ ')+Math.abs(d)+'% so với hôm qua'}</div>${spark(k.series||[0,0,0,0,0,0,0],'#7c3aed')}</div>
  <div class="fl-kpi"><div class="lbl">Nhiệm vụ hiện tại</div><div class="trio"><div><b class="fl-hot">${r.running}</b><span>Đang xử lý</span></div><div><b>${r.queued}</b><span>Chờ lượt</span></div><div><b>${r.review}</b><span>Chờ duyệt</span></div></div></div>
  <div class="fl-kpi"><div class="lbl">Thời gian TB mỗi lượt</div><div class="val">${k.avgToday?fmt(k.avgToday):'—'}</div><div class="delta ${dt>0?'down':''}">${!k.avgToday?'Hôm nay chưa có lượt':dt===null?'Chưa có số hôm qua':dt<=0?`▼ ${Math.abs(dt)} giây, nhanh hơn hôm qua`:`▲ ${dt} giây so với hôm qua`}</div></div>
  <div class="fl-kpi"><div class="lbl">Tỉ lệ được duyệt · 30 ngày</div><div class="gauge">${gauge(k.decided?k.approved/k.decided:0)}<div><div class="val">${k.decided?Math.round(k.approved/k.decided*100)+'%':'—'}</div><div class="delta">${k.decided?`${k.approved}/${k.decided} kết quả`:'Chưa có kết quả duyệt'}</div></div></div></div>
  <div class="fl-kpi"><div class="lbl">Làm nhiều nhất hôm nay</div>${k.top?.length?`<ul class="fl-top">${k.top.map(x=>`<li data-c="${x.color}" data-w="${x.n/mx*100}"><span></span><span class="fl-b"><i></i></span><span>${x.n}</span></li>`).join('')}</ul>`:'<p class="delta">Chưa có lượt hôm nay</p>'}</div>`;
  kpis.querySelectorAll(".fl-top li").forEach((li,i)=>{li.firstChild.textContent=k.top[i].name===r.agents[0]?.name?"FACIUP":k.top[i].name;li.style.setProperty("--c",li.dataset.c);li.querySelector("i").style.width=li.dataset.w+"%";});}
 function paintNow(){now.lastChild.textContent=stale?'Mất kết nối · đang thử lại':`${vn(Date.now())} giờ VN · ${data?.runtime?.enabled?'trực tuyến':'nhóm AI đang tắt'}`;now.classList.toggle('fl-off',stale||!data?.runtime?.enabled);}
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');clockSkew=(data.runtime?.polledAt||Date.now())-Date.now();stale=false;}catch{stale=true;}finally{busy=false;}
  if(stopped)return;page.classList.toggle('fl-stale',stale);if(data){build(data.runtime.agents.slice(1));paintAgents();paintKpis();}paintNow();}
 load();raf=requestAnimationFrame(frame);
 const tick=setInterval(()=>{if(data)paintAgents();paintNow();},1000),poll=setInterval(load,15000),visible=()=>{if(!document.hidden)load();};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;cancelAnimationFrame(raf);clearInterval(tick);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
}
