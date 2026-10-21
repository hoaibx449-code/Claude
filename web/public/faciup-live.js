// Faciup Live: the AI team on a 24-hour dial. The coordinator glows in the centre, the other agents
// are orbs on their own orbits, joined to it by light; a dot on the ring marks each hour an agent
// worked today. Everything shown is real server state (/api/faciup-live): an agent only moves while
// it really is working. Giving work happens in Quản trị → Nhóm AI.
const STATES={idle:'Sẵn sàng',disabled:'Nhóm đang tắt',queued:'Chờ tới lượt',retry:'Chờ thử lại',running:'Đang xử lý',review:'Chờ duyệt',paused:'Tạm dừng',unknown:'Mất kết nối'};
const COLORS=['#f26b1d','#e8336d','#7c4dff','#1e88e5','#0097a7','#c9a227','#43a047','#37474f'];
const ICONS={
 'Điều phối':'<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>',
 'Chiến lược':'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
 'Nghiên cứu':'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
 'Biên kịch':'<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
 'Phản biện':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 12l2 2 4-4"/>',
};
const DEFAULT_ICON='<path d="M5 18l4-12 3 8 2-4 5 8"/>';
const NS='http://www.w3.org/2000/svg';
const pad=n=>String(n).padStart(2,'0');
const vnParts=t=>{const d=new Date(t+7*3600000);return {h:d.getUTCHours(),m:d.getUTCMinutes(),s:d.getUTCSeconds()};};
const hm=t=>{const p=vnParts(t);return pad(p.h)+':'+pad(p.m);};
/** angle (radians) of a time of day on the dial: 00 at the top, 06 right, 12 bottom, 18 left */
const dialAngle=hours=>hours/24*2*Math.PI-Math.PI/2;
function el(tag,attrs={},...kids){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);e.append(...kids);return e;}
function icon(paths){const s=el('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'});const d=new DOMParser().parseFromString(`<svg xmlns="${NS}">${paths}</svg>`,'image/svg+xml');for(const n of [...d.documentElement.childNodes])s.append(document.importNode(n,true));return s;}
function until(ms){const m=Math.max(0,Math.round(ms/60000));return m<60?`${m} phút`:`${Math.floor(m/60)} giờ ${m%60} phút`;}

export function showLive({h,show,api,footer,admin=false}){
 let stopped=false,busy=false,data=null,stale=false,raf=0,selected=-1,fingerprint='',last=performance.now();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 // dial (SVG, 1000×1000): ring, hour ticks, today's activity, orbits, links
 const ring=el('g',{class:'fl-ring'}),marks=el('g',{class:'fl-marks'}),orbits=el('g',{class:'fl-orbits'}),links=el('g',{class:'fl-links'});
 const hand=el('g',{class:'fl-hand'},el('line',{x1:0,y1:0,x2:-34,y2:0}),el('circle',{r:13,class:'fl-hand-glow'}),el('circle',{r:7}));
 const dial=el('svg',{viewBox:'0 0 1000 1000',class:'fl-dial','aria-hidden':'true'},
  el('defs',{},el('linearGradient',{id:'fl-day',x1:0,y1:0,x2:0,y2:1},el('stop',{offset:'0','stop-color':'var(--fl-night)'}),el('stop',{offset:'.5','stop-color':'var(--fl-night)'}),el('stop',{offset:'.5','stop-color':'var(--fl-day)'}),el('stop',{offset:'1','stop-color':'var(--fl-day)'}))),
  ring,orbits,links,marks,hand);
 ring.append(el('circle',{cx:500,cy:500,r:430,class:'fl-track'}));
 for(let i=0;i<24;i++){const a=dialAngle(i),big=i%3===0,r1=big?396:410,r2=418;ring.append(el('line',{x1:500+r1*Math.cos(a),y1:500+r1*Math.sin(a),x2:500+r2*Math.cos(a),y2:500+r2*Math.sin(a),class:big?'fl-tick fl-tick-big':'fl-tick'}));
  if(big)ring.append(el('text',{x:500+372*Math.cos(a),y:500+372*Math.sin(a)+7,class:'fl-hour'},pad(i)));}
 ring.append(el('text',{x:500,y:205,class:'fl-half'},'ĐÊM'),el('text',{x:500,y:808,class:'fl-half'},'NGÀY'));
 const hub=h('button',{type:'button',class:'fl-hub','aria-label':'Tác nhân điều phối',onclick:()=>pick(0)},h('span',{class:'fl-hub-core'},h('span',{class:'fl-hub-mark'},'✎')),h('span',{class:'fl-hub-pill'},''));
 const stage=h('div',{class:'fl-stage'},dial,hub);
 const pop=h('div',{class:'fl-pop',hidden:true,role:'dialog','aria-label':'Chi tiết tác nhân'});
 stage.append(pop);
 // the one card under the dial: time, team, what comes next
 const clock=h('time',{class:'fl-time'}),line1=h('p',{class:'fl-line1'},'Đang kết nối…'),line2=h('p',{class:'fl-line2'},'');
 const status=h('section',{class:'fl-status','aria-live':'polite'},h('div',{class:'fl-clock'},clock,h('small',{},'GIỜ VN')),h('div',{class:'fl-lines'},line1,line2),
  admin?h('a',{class:'fl-admin',href:'/admin/nhom-ai'},'Giao việc ↗'):null);
 const shell=h('section',{class:'fl-live'},h('h1',{class:'sr'},'Faciup Live — đội AI đang vận hành'),stage,status);
 show(shell,footer());
 let agents=[];// {i,name,role,color,state,orb,label,link,orbit:{rx,ry,rot,phase,speed}}
 const team=()=>data?.runtime?.agents||[];
 function build(){
  const list=team(),key=list.map(a=>a.id+a.name).join('|');if(key===fingerprint)return;fingerprint=key;
  agents.forEach(a=>{a.orb.remove();a.label.remove();});orbits.replaceChildren();links.replaceChildren();
  const others=list.slice(1),n=Math.max(1,others.length);
  agents=others.map((a,k)=>{
   const i=k+1,color=COLORS[i%COLORS.length];
   // each agent its own tilted ellipse, spread evenly around the centre
   const rot=(k%2?.32:-.32)+(k%3)*.12,rx=290+(k%2)*40,ry=200+(k%3)*30,phase=-Math.PI/2+k*2*Math.PI/n+Math.PI/n,speed=(.08+(k%3)*.025)*(k%2?-1:1);
   const path=el('ellipse',{cx:500,cy:500,rx,ry,transform:`rotate(${rot*180/Math.PI} 500 500)`,class:'fl-orbit'});orbits.append(path);
   const link=el('line',{x1:500,y1:500,x2:500,y2:500,class:'fl-link',stroke:color});links.append(link);
   const orb=h('button',{type:'button',class:'fl-orb',style:`--c:${color}`,'aria-label':a.name,onclick:e=>{e.stopPropagation();pick(i);}},icon(ICONS[a.name]||DEFAULT_ICON));
   const label=h('div',{class:'fl-label',style:`--c:${color}`},h('strong',{},a.name),h('span',{},''));
   stage.append(orb,label);
   return {i,name:a.name,role:a.role,color,orb,label,link,orbit:{rx,ry,rot,phase,speed}};
  });
 }
 function place(){
  for(const a of agents){const o=a.orbit,x0=o.rx*Math.cos(o.phase),y0=o.ry*Math.sin(o.phase),x=500+x0*Math.cos(o.rot)-y0*Math.sin(o.rot),y=500+x0*Math.sin(o.rot)+y0*Math.cos(o.rot);
   a.x=x;a.y=y;a.orb.style.left=x/10+'%';a.orb.style.top=y/10+'%';a.link.setAttribute('x2',x);a.link.setAttribute('y2',y);
   // label outward from the centre, flipped to stay inside the dial
   // outward from the centre, but towards it near the edge so cards stay on screen
   const narrow=stage.clientWidth<560,right=x<300?true:x>700?false:x>=500;
   // phones: a short name tag right under the orb; wider screens: a card beside it
   a.label.classList.toggle('fl-under',narrow);
   if(narrow){a.label.style.left=x/10+'%';a.label.style.top=(y/10+5.2)+'%';}
   else{a.label.style.left=(x/10+(right?3.4:-3.4))+'%';a.label.style.top=(y/10+(y>500?3.2:-3.2))+'%';}
   a.label.classList.toggle('fl-left',!narrow&&!right);a.label.classList.toggle('fl-up',y<=500);}
  if(selected>0){const a=agents.find(x=>x.i===selected);if(a){pop.style.left=a.x/10+'%';pop.style.top=a.y/10+'%';pop.classList.toggle('fl-left',a.x>560);pop.classList.toggle('fl-up',a.y>560);}}
 }
 function frame(t){const dt=Math.min(.1,(t-last)/1000);last=t;
  // only a working agent travels its orbit: real activity, not decoration
  if(!reduce&&!stale)for(const a of agents)if(a.state==='running')a.orbit.phase+=a.orbit.speed*dt*6;
  place();raf=requestAnimationFrame(frame);}
 function paintMarks(){
  marks.replaceChildren();const list=team();
  list.forEach((a,i)=>{const color=COLORS[i%COLORS.length];for(const [hour,n] of a.hours||[]){const ang=dialAngle(hour+.5),r=430;
   marks.append(el('circle',{cx:500+r*Math.cos(ang),cy:500+r*Math.sin(ang),r:Math.min(14,7+n),fill:color,class:'fl-mark'},el('title',{},`${a.name}: ${n} lượt lúc ${pad(hour)}:00`)));
   marks.append(el('text',{x:500+478*Math.cos(ang),y:500+478*Math.sin(ang)+7,fill:color,class:'fl-mark-time'},pad(hour)+':00'));}});
 }
 function paint(){
  build();const r=data.runtime,list=team();
  hub.querySelector('.fl-hub-pill').textContent='FACIUP · '+(list[0]?.name||'Điều phối').toUpperCase();
  hub.dataset.state=stale?'unknown':list[0]?.state||'idle';hub.style.setProperty('--c',COLORS[0]);
  for(const a of agents){const s=list[a.i];a.state=stale?'unknown':s?.state||'idle';a.orb.dataset.state=a.state;a.label.dataset.state=a.state;a.link.dataset.state=a.state;
   a.label.querySelector('span').textContent=a.state==='running'?'Đang xử lý':a.state==='idle'&&s?.last?`Gần nhất ${hm(s.last)} · ${s.completed} lượt`:STATES[a.state]||'';}
  paintMarks();
  const total=list.length,busyN=r.running;
  if(stale){line1.textContent='Mất kết nối trạng thái';line2.textContent='Chưa xác minh hoạt động hiện tại · đang thử lại';}
  else if(!r.enabled){line1.replaceChildren(h('b',{},`${total} agent`),' · nhóm đang tắt');line2.textContent=r.completed?`Hôm nay đã xong ${r.completed} lượt`:'Chưa nhận nhiệm vụ';}
  else{line1.replaceChildren(h('b',{},`${total} agent`),busyN?` · ${busyN} đang xử lý`:' đang trực');
   const nx=r.next,who=nx?list[nx.agent]?.name:'';
   line2.replaceChildren(...(nx?['Việc kế tiếp: ',h('b',{},who),nx.at>Date.now()?` · ${hm(nx.at)} (còn ${until(nx.at-Date.now())})`:' · ngay khi tới lượt']
    :r.review?['Chờ duyệt: ',h('b',{},r.review+' kết quả')]:[r.completed?`Hôm nay xong ${r.completed} lượt · gần nhất ${hm(r.lastActivity)}`:'Chưa có việc trong hàng đợi']));}
  if(selected>=0)detail();
 }
 function pick(i){selected=selected===i?-1:i;detail();}
 function detail(){
  const s=team()[selected];if(selected<0||!s){pop.hidden=true;return;}
  pop.style.setProperty('--c',COLORS[selected%COLORS.length]);
  pop.replaceChildren(h('strong',{},s.name),h('span',{class:'fl-pop-state','data-state':stale?'unknown':s.state},STATES[stale?'unknown':s.state]),h('p',{},s.role),
   h('dl',{},h('dt',{},'Hôm nay'),h('dd',{},`${s.completed||0} lượt`),h('dt',{},'Gần nhất'),h('dd',{},s.last?hm(s.last):'—')));
  pop.hidden=false;
  if(selected===0){pop.style.left='50%';pop.style.top='58%';pop.classList.remove('fl-left','fl-up');}
 }
 stage.addEventListener('click',e=>{if(!pop.contains(e.target)&&selected>=0&&!e.target.closest('.fl-orb,.fl-hub')){selected=-1;pop.hidden=true;}});
 function tick(){const p=vnParts(Date.now());clock.textContent=pad(p.h)+':'+pad(p.m);const a=dialAngle(p.h+p.m/60+p.s/3600);
  hand.setAttribute('transform',`translate(${500+430*Math.cos(a)} ${500+430*Math.sin(a)}) rotate(${a*180/Math.PI})`);}
 async function load(){if(stopped||busy||document.hidden)return;busy=true;
  try{data=await api('/api/faciup-live');stale=false;}catch{stale=true;}
  finally{busy=false;}
  if(!stopped&&data){shell.classList.toggle('fl-stale',stale);paint();}
  else if(!stopped&&stale){line1.textContent='Mất kết nối trạng thái';line2.textContent='Đang thử lại…';}}
 tick();load();raf=requestAnimationFrame(frame);
 const t=setInterval(tick,1000),poll=setInterval(load,15000),visible=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',visible);
 return ()=>{stopped=true;cancelAnimationFrame(raf);clearInterval(t);clearInterval(poll);document.removeEventListener('visibilitychange',visible);};
}
