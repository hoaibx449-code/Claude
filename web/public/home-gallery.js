/** Public home playlist; preserve legacy hero uploads, skip empty entries and duplicates. */
export function galleryItems(site = {}) {
  const list = [];
  if (site.heroMedia) list.push({src:site.heroMedia,poster:site.heroPoster||'',title:'Video giới thiệu',caption:'',video:/\.(mp4|webm)(?:[?#]|$)/i.test(site.heroMedia)});
  for (const m of site.showcase || []) if (m.video) list.push({src:m.video,poster:m.poster||'',title:m.title||'Video mẫu',caption:m.caption||'',video:true});
  const seen = new Set();
  return list.filter(m => !seen.has(m.src) && seen.add(m.src)).slice(0,13);
}

/** Only the active video loads/plays. Rotation waits for its end, never truncates it. */
export function mountGallery(items, {h,siteUrl}) {
  let index=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,visible=false,hover=false,focused=false,elapsed=0,failed=false,disposed=false;
  const track=h('div',{class:'hero-track'}),viewport=h('div',{class:'hero-viewport'}),dots=h('div',{class:'hero-dots',role:'group','aria-label':'Chọn video mẫu'});
  const title=h('span',{class:'hero-caption'}),count=h('span',{class:'hero-count'}),status=h('span',{class:'sr-only',role:'status','aria-live':'polite'});
  const slides=items.map((m,i)=>{
    const media=m.video?h('video',{muted:true,playsinline:true,controls:true,preload:'none','aria-label':m.title}):h('img',{alt:m.title,loading:'lazy'});
    if(m.video){media.muted=true;media.addEventListener('ended',()=>{elapsed=0;});media.addEventListener('error',()=>{if(i===index)failed=true;});}
    const slide=h('div',{class:'hero-slide',role:'group','aria-roledescription':'slide','aria-label':`${i+1} / ${items.length}: ${m.title}`},media);
    track.append(slide);return {slide,media};
  });
  viewport.append(track);
  const allowed=()=>visible&&!paused&&!hover&&!focused&&!document.hidden;
  const sync=()=>{const v=slides[index].media;if(v.tagName==='VIDEO'){if(!visible||paused||document.hidden)v.pause();else if(!v.ended)v.play().catch(()=>{});}};
  const go=(n,manual=false)=>{
    if(disposed)return;
    slides[index].media.tagName==='VIDEO'&&slides[index].media.pause();
    index=(n+items.length)%items.length;elapsed=0;failed=false;
    track.style.transform=`translateX(-${index*100}%)`;
    slides.forEach(({slide,media},i)=>{slide.setAttribute('aria-hidden',String(i!==index));slide.inert=i!==index;if(i===index&&!media.getAttribute('src')){media.src=siteUrl(items[i].src);if(items[i].poster&&media.tagName==='VIDEO')media.poster=siteUrl(items[i].poster);}});
    const active=slides[index].media;if(active.tagName==='VIDEO'){try{active.currentTime=0;}catch{}}
    title.textContent=items[index].title;title.title=items[index].caption||items[index].title;count.textContent=`${index+1} / ${items.length}`;
    if(manual)status.textContent=`${items[index].title}, ${index+1} / ${items.length}`;
    Array.from(dots.children).forEach((dot,i)=>{dot.classList.toggle('on',i===index);dot.setAttribute('aria-current',String(i===index));});
    sync();
  };
  const pause=h('button',{type:'button',class:'ghost small',onclick:()=>{paused=!paused;paintPause();sync();}},'');
  const paintPause=()=>{pause.textContent=paused?'▶':'❚❚';pause.setAttribute('aria-label',paused?'Tiếp tục trình diễn':'Tạm dừng trình diễn');};paintPause();
  const controls=h('div',{class:'hero-controls'},items.length>1?h('button',{type:'button',class:'ghost small','aria-label':'Video trước',onclick:()=>go(index-1,true)},'←'):null,pause,items.length>1?h('button',{type:'button',class:'ghost small','aria-label':'Video tiếp theo',onclick:()=>go(index+1,true)},'→'):null);
  const element=h('figure',{class:'home-preview home-gallery',role:'region','aria-roledescription':'carousel','aria-label':'Video giới thiệu'},viewport,h('figcaption',{},title,items.length>1?count:null),h('div',{class:'hero-nav'},items.length>1?dots:null,controls),status);
  element.addEventListener('mouseenter',()=>{hover=true;});element.addEventListener('mouseleave',()=>{hover=false;});
  element.addEventListener('focusin',()=>{focused=true;});element.addEventListener('focusout',e=>{focused=element.contains(e.relatedTarget);});
  const visibility=()=>sync();document.addEventListener('visibilitychange',visibility);
  const io=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:.35});io.observe(element);
  const timer=setInterval(()=>{if(!allowed()||items.length<2)return;const v=slides[index].media;if(v.tagName==='VIDEO'&&!failed){if(v.ended)go(index+1);return;}elapsed+=.5;if(elapsed>=8)go(index+1);},500);
  dots.append(...items.map((m,i)=>h('button',{type:'button',class:'hero-dot','aria-label':`Xem video ${i+1}: ${m.title}`,onclick:()=>go(i,true)})));
  go(0);
  return {element,dispose(){disposed=true;clearInterval(timer);io.disconnect();document.removeEventListener('visibilitychange',visibility);slides.forEach(({media})=>{if(media.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load();}});}};
}
