/** Native video previews: bounded to visible cards and cleaned up on every route/filter change. */
export function mountVideoPreviews(root,{paused=false}={}){
 let stopped=false,pausedByUser=paused;const visible=new Set(),videos=[...root.querySelectorAll('video[data-preview-src]')];
 const sync=()=>{for(const v of videos){if(stopped||pausedByUser||document.hidden||!visible.has(v)){v.pause();continue;}if(!v.getAttribute('src'))v.src=v.dataset.previewSrc;v.play().catch(()=>{if(!stopped)v.parentElement.dataset.playback='blocked';});}};
 const handlers=new Map();for(const v of videos){v.muted=true;v.loop=true;v.playsInline=true;const playing=()=>{v.parentElement.dataset.playback='playing';},error=()=>{v.parentElement.dataset.playback='error';};v.addEventListener('playing',playing);v.addEventListener('error',error);handlers.set(v,{playing,error});}
 const io=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting&&e.intersectionRatio>=.25)visible.add(e.target);else visible.delete(e.target);}sync();},{threshold:[0,.25]});videos.forEach(v=>io.observe(v));
 const visibility=()=>{root.classList.toggle('library-background',document.hidden);sync();};document.addEventListener('visibilitychange',visibility);
 root.classList.toggle('library-paused',pausedByUser);
 return {setPaused(value){pausedByUser=value;root.classList.toggle('library-paused',value);sync();},dispose(){if(stopped)return;stopped=true;io.disconnect();document.removeEventListener('visibilitychange',visibility);for(const v of videos){const e=handlers.get(v);v.removeEventListener('playing',e.playing);v.removeEventListener('error',e.error);v.pause();v.removeAttribute('src');v.load();}visible.clear();}};
}
export function libraryPlaceholder(p,h,icon){
 const state=['queued','running','failed'].includes(p.last_job)?p.last_job:'draft';
 const label={draft:'Bản nháp',queued:'Chờ máy dựng',running:'Đang dựng',failed:'Dựng lỗi'}[state];
 const detail={draft:'Chưa xuất MP4',queued:'Đã vào hàng chờ',running:'Tiến độ thực tế',failed:'Mở để kiểm tra'}[state];
 const progress=Math.max(0,Math.min(100,Number(p.last_progress)||0));
 return h('span',{class:'lib-state-frame','data-state':state,role:'img','aria-label':label+': '+p.title},h('span',{class:'lib-state-art','aria-hidden':'true'},h('i'),h('i'),h('i'),icon(state==='failed'?'film':'pen')),h('b',{},label),state==='running'?h('span',{class:'lib-state-progress','data-project-progress':p.id},progress+'%'):h('small',{},detail),h('span',{class:'lib-state-track','aria-hidden':'true'},h('i')));
}
