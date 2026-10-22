// Faciup Live: the AI team on a 24-hour dial. FACIUP glows in the centre, the agents are robots that
// keep circling it and the orange hand marks the time in Vietnam. When a turn passes, the file
// flies from one robot to the next (or back to
// FACIUP). Beside it, the latest handovers; below, the team KPIs.
// Everything comes from /api/faciup-live (times and public names only); agents added in Quản trị →
// Nhóm AI appear on their own. Work is given in the admin pages, never here.
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
 const trail=svg('svg',{class:'fl-trail','aria-hidden':'true'});stage.append(trail);
 const log=h('ul',{class:'fl-log'});
 const side=h('aside',{class:'fl-side'},h('div',{class:'fl-panel'},h('h2',{},'Bàn giao gần đây'),log));
 const kpis=h('section',{class:'fl-kpis','aria-label':'Chỉ số hoạt động'});
 const page=h('div',{class:'fl-live'},h('h1',{class:'sr'},'Faciup Live'),stage,side,kpis);
 show(page,footer());
 let bots=[],key='';const lastTurn=new Map();
 function build(list){
  const k=list.map(a=>a.id+a.name+a.color+a.icon).join('|');if(k===key)return;key=k;
  const keep=new Map(bots.map(b=>[b.id,b]));orbits.replaceChildren();beams.replaceChildren();links=[];
  const rings=Math.min(3,Math.max(1,Math.ceil(list.length/3)));
  for(let r=0;r<rings;r++)orbits.append(svg('circle',{cx:500,cy:500,r:[190,265,335][r],class:'fl-orbit'}));
  bots=list.map((s,j)=>{const i=j+1,old=keep.get(s.id);keep.delete(s.id);
   const ring=j%rings,o=old?.o||{r:[190,265,335][ring],ph:j/list.length*Math.PI*2,sp:(.16-.03*ring)*(ring%2?-1:1),wob:j};
   let el=old?.el;
   if(!el||old.icon!==s.icon||old.color!==s.color){old?.el.remove();el=h('div',{class:'fl-bot fl-new',role:'img','aria-label':s.name});el.style.setProperty('--c',s.color);
    el.innerHTML=`<div class="fl-name"><b></b><span></span></div><i class="fl-pulse"></i><div class="fl-shadow"></div><div class="fl-body">${robot(s.color,s.icon,j+'_'+s.id.replace(/\W/g,''))}</div>`;
    stage.append(el);setTimeout(()=>el.classList.remove('fl-new'),900);}
   return {id:s.id,i,icon:s.icon,color:s.color,el,o,s,pos:[0,0],v:[500,500],left:false};});
  for(const b of keep.values())b.el.remove();
  // links: every robot to FACIUP, and each robot to the next one, so the team reads as one network
  bots.forEach((b,j)=>{link(null,b,b.color);if(bots.length>2||j===0&&bots.length===2)link(b,bots[(j+1)%bots.length],b.color);});}
 let links=[];
 function link(a,b,color){const path=svg('path',{class:'fl-link',stroke:color}),dot=svg('circle',{r:a?5:6,class:'fl-spark',fill:color});beams.append(path,dot);links.push({a,b,path,dot,t:Math.random(),sp:a?.18:.28});}
 const bez=(p,c,q,t)=>[(1-t)*(1-t)*p[0]+2*(1-t)*t*c[0]+t*t*q[0],(1-t)*(1-t)*p[1]+2*(1-t)*t*c[1]+t*t*q[1]];
 function drawLinks(dt,off){const turn=data?.runtime?.sessions?.[0];
  for(const l of links){const q=l.b.v,p=l.a?l.a.v:(()=>{const d=Math.hypot(q[0]-500,q[1]-500)||1;return [500+(q[0]-500)/d*112,500+(q[1]-500)/d*112];})();
   // bend towards the centre so the web curves round FACIUP
   const m=[(p[0]+q[0])/2,(p[1]+q[1])/2],c=l.a?[m[0]+(500-m[0])*.35,m[1]+(500-m[1])*.35]:[m[0]+(q[1]-p[1])*.18,m[1]-(q[0]-p[0])*.18];
   l.path.setAttribute('d',`M${p[0].toFixed(1)} ${p[1].toFixed(1)}Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
   const work=LOOK[l.b.s.state]==='work'||(l.a&&LOOK[l.a.s.state]==='work'),hand=l.a&&turn&&turn.current===l.a.i&&turn.state==='running';
   l.path.classList.toggle('on',!stale&&(work||hand));
   if(!reduce)l.t=(l.t+dt*l.sp*(work?2.6:off?.3:1))%1;
   // FACIUP links carry work in to the centre; robot-to-robot links pass it along
   const [x,y]=bez(p,c,q,l.a?l.t:1-l.t);l.dot.setAttribute('cx',x.toFixed(1));l.dot.setAttribute('cy',y.toFixed(1));}}
 // robots keep circling: faster while working, slower when the team is off
 function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;const r=stage.getBoundingClientRect(),sc=r.width/1000,off=stale||!data?.runtime?.enabled;
  for(const b of bots){const look=stale?'off':LOOK[b.s.state]||'idle',k=look==='work'?2.6:off&&!b.s.live?.35:1;
   if(!reduce){b.o.ph+=b.o.sp*dt*k;b.o.wob+=dt*1.4;}
   b.left=b.o.sp>0?Math.sin(b.o.ph)>0:Math.sin(b.o.ph)<0;
   const x=500+b.o.r*Math.cos(b.o.ph),y=500+b.o.r*Math.sin(b.o.ph)+Math.sin(b.o.wob)*6;b.pos=[x*sc,y*sc];
   b.el.style.transform=`translate(${(x*sc-b.el.offsetWidth/2).toFixed(1)}px,${(y*sc-b.el.offsetHeight*.62).toFixed(1)}px)`;b.el.style.zIndex=5+Math.round(y/50);
   b.el.classList.toggle('fl-left',b.left);
   b.v=[x,y-18];}
  drawLinks(dt,off);
  const p=ang(((Date.now()+clockSkew+7*3600e3)%864e5)/36e5);hand.setAttribute('transform',`translate(${500+462*Math.cos(p)} ${500+462*Math.sin(p)})`);
  if(!stopped)raf=requestAnimationFrame(frame);}
 // the file flies along a curve from one robot to the next (index 0 = FACIUP)
 function fly(from,to,color){if(reduce)return;const r=stage.getBoundingClientRect(),at=i=>{const b=bots.find(x=>x.i===i);return i===0||!b?[r.width/2,r.height/2]:[b.pos[0],b.pos[1]-b.el.offsetHeight*.3];};
  const p0=at(from),p1=at(to);trail.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
  const mid=[(p0[0]+p1[0])/2+(r.width/2-(p0[0]+p1[0])/2)*.5,(p0[1]+p1[1])/2+(r.height/2-(p0[1]+p1[1])/2)*.5-60],path=svg('path',{d:`M${p0[0]} ${p0[1]} Q${mid[0]} ${mid[1]} ${p1[0]} ${p1[1]}`,stroke:color,class:'fl-path'});trail.append(path);
  const doc=h('div',{class:'fl-doc'});doc.innerHTML=DOC;stage.append(doc);
  const L=path.getTotalLength();let k=0;const go=()=>{if(stopped)return;k+=1/85;const q=path.getPointAtLength(Math.min(1,k)*L);doc.style.transform=`translate(${q.x-15}px,${q.y-12}px)`;if(k<1)requestAnimationFrame(go);else{doc.remove();setTimeout(()=>path.remove(),300);}};go();}
 const runFor=s=>s.since?(Date.now()+clockSkew-s.since)/1000:0;
 const nameOf=i=>i===0?'FACIUP':data.runtime.agents[i]?.name||'Agent';
 function tagText(s,look){return look==='paused'?'Tạm dừng':look==='live24'?`Trực 24/7 · ~${fmt(s.avg)}`:look==='work'?`Đang xử lý ${fmt(runFor(s))}`:look==='wait'?`Chờ lượt${s.avg?' · ~'+fmt(s.avg):''}`:look==='review'?'Chờ duyệt':look==='off'?(stale?'Mất kết nối':'Nhóm đang tắt'):s.avg?`TB ${fmt(s.avg)}/lượt`:'Sẵn sàng';}
 function pillText(s,look){return look==='paused'?'Ⅱ':look==='live24'?'24/7':look==='work'?fmt(runFor(s)):look==='review'?'chờ duyệt':look==='off'?'':look==='wait'?'chờ lượt':'';}
 function paint(){const r=data.runtime,lead=r.agents[0],meeting=r.sessions[0]||null;
  // FACIUP runs the whole team all the time: always lit, busier glow while it is putting a result together
  const hl=meeting?.current===0&&meeting.state==='running'||LOOK[lead?.state]==='work'?'work':'on';hub.dataset.state=hl;
  hub.querySelector('small').textContent=hl==='work'?'Đang tổng hợp':meeting?.state==='running'?`Phiên #${meeting.n} · lượt ${meeting.step+1}`:'Vận hành 24/7';
  for(const b of bots){const look=stale?'off':LOOK[b.s.state]||'idle';
   b.el.className='fl-bot fl-'+look+(b.el.classList.contains('fl-new')?' fl-new':'')+(b.left?' fl-left':'')+(b.s.live?' fl-24':'');
   b.el.querySelector('.fl-name b').textContent=b.s.name;b.el.querySelector('.fl-name span').textContent=pillText(b.s,look);b.el.title=b.s.name+' · '+tagText(b.s,look);}
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
  if(stopped)return;page.classList.toggle('fl-stale',stale);if(!data)return;
  const r=data.runtime;r.sessions=r.sessions||[];build(r.agents.slice(1));
  // a session whose turn moved since the last poll hands its file on
  for(const s of r.sessions){const was=lastTurn.get(s.n);if(was!==undefined&&was!==s.current)fly(was,s.current,s.current===0?'#a21caf':r.agents[s.current]?.color||'#f97316');lastTurn.set(s.n,s.current);}
  paint();paintLog();paintKpis();}
 load();raf=requestAnimationFrame(frame);
 const tick=setInterval(()=>{if(data)paint();},1000),poll=setInterval(load,10000),visible=()=>{if(!document.hidden)load();};
 document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;cancelAnimationFrame(raf);clearInterval(tick);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
}
