// H.264 High/Main first: Baseline 3.0 (42E01E) cannot encode a 720×1280 portrait frame, which made
// Chrome fail with "The given encoder configuration is not supported by the encoder".
export function recordingTypes(support, audio=true){
  const v=['avc1.640028','avc1.4d0028','avc1.42E01F'],a=audio?',mp4a.40.2':'',w=audio?',opus':'';
  const types=[...v.map(c=>`video/mp4;codecs=${c}${a}`),'video/mp4',`video/webm;codecs=vp9${w}`,`video/webm;codecs=vp8${w}`,'video/webm'];
  return types.filter(t=>support(t));
}
export function recordingType(support, audio=true){return recordingTypes(support,audio)[0]||'';}
export function fittedVoice(lines,duration,estimate){const e=estimate(lines),scale=duration/e.duration;return {duration,lines:e.lines.map(l=>({start:l.start*scale,end:l.end*scale}))};}
export function subtitleFile(spec,timeline){
  const stamp=s=>{const ms=Math.round(s*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};let n=0;
  return timeline.scenes.flatMap((sc,i)=>sc.lines.map((l,j)=>`${++n}\n${stamp(l.start)} --> ${stamp(l.end)}\n${spec.scenes[i].lines[j]}\n`)).join('\n');
}
let current=null;
// encoders that failed while recording on this device: skipped on the next try
const badTypes=new Set();
export async function openBrowserRender(spec,projectId,opts){
  const {h,previewModel,paintFrame,NV,onClose}=opts;
  current?.();
  const controller=new AbortController(),signal=controller.signal,urls=[],sources=[];let ctx,stream,recorder,raf=0,working=false,finished=false,closed=false,wake;
  const canvas=h('canvas',{'aria-label':'Khung hình đang xuất'}),note=h('p',{class:'muted',role:'status'},'Giữ tab này mở trong lúc dựng. Tệp tải về máy, chưa lưu vào thư viện.'),meter=h('progress',{max:100,value:0,'aria-label':'Tiến độ dựng trên trình duyệt'}),result=h('div',{class:'row'});
  // what the person sees while it works: steps, a moving bar, percent, time, a REC badge on the picture
  const STEPS=['Giọng đọc','Khung hình','Ghi video','Hoàn tất'];
  const steps=h('ol',{class:'br-steps'},STEPS.map((t,i)=>h('li',{},h('i',{},String(i+1)),h('span',{},t))));
  const pct=h('strong',{class:'br-pct'},'0%'),clock=h('span',{class:'br-clock'},''),bar=h('div',{class:'br-bar'},h('span',{}));
  const rec=h('span',{class:'br-rec',hidden:true},h('i',{}),'REC');
  const stage=h('div',{class:'browser-render-preview br-stage'},canvas,rec,h('div',{class:'br-shimmer',hidden:true}));
  let t0=0,tick=0;
  const setStep=(i,state='on')=>{[...steps.children].forEach((li,k)=>{li.className=k<i?'done':k===i?state:'';});stage.querySelector('.br-shimmer').hidden=!(i<2&&state==='on');rec.hidden=i!==2;dialog.classList.toggle('br-working',state==='on'&&i<3);};
  const setPct=(v,eta)=>{v=Math.max(0,Math.min(100,v));meter.value=v;bar.firstChild.style.width=v+'%';pct.textContent=Math.round(v)+'%';if(eta!=null)clock.dataset.eta=eta;};
  const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const startClock=()=>{t0=performance.now();clearInterval(tick);tick=setInterval(()=>{const el=(performance.now()-t0)/1000,eta=Number(clock.dataset.eta);clock.textContent=`Đã chạy ${fmt(el)}`+(eta>0?` · còn khoảng ${fmt(eta)}`:'');},500);};
  const cleanup=()=>{clearInterval(tick);dialog.classList.remove('br-working');cancelAnimationFrame(raf);if(recorder?.state==='recording')recorder.stop();sources.forEach(s=>{try{s.stop();}catch{}});stream?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});wake?.release().catch(()=>{});};
  const close=()=>{if(closed)return;closed=true;controller.abort();cleanup();urls.forEach(u=>URL.revokeObjectURL(u));dialog.close();dialog.remove();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('hashchange',close);window.removeEventListener('pagehide',close);if(current===close)current=null;onClose?.();};
  const visibility=()=>{if(working&&document.hidden)controller.abort(new Error('Tab bị ẩn. Giữ tab dựng ở phía trước và dựng lại để tránh video thiếu khung hình.'));};
  const button=h('button',{type:'button',onclick:()=>run()},'Bắt đầu dựng');
  const dialog=h('dialog',{class:'render-desk browser-render','aria-labelledby':'browser-render-title'},h('header',{class:'render-desk-head'},h('h2',{id:'browser-render-title'},'Dựng trên trình duyệt'),h('button',{type:'button',class:'ghost small',onclick:close},'Đóng')),h('p',{},spec.title||'Video mới'),h('p',{class:'muted'},'Xuất hình và lời đọc. Bản tạm thời chưa trộn nhạc nền/hiệu ứng; hỗ trợ video tối đa 3 phút. Giọng AI cần dịch vụ giọng hoạt động, hoặc dùng MP3/WAV bạn tải lên.'),steps,stage,h('div',{class:'br-meter'},bar,pct,clock),note,meter,button,result);meter.hidden=true;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.addEventListener('visibilitychange',visibility);window.addEventListener('hashchange',close);window.addEventListener('pagehide',close);document.body.append(dialog);dialog.showModal();current=close;
  async function run(){
    if(working||finished)return;working=true;button.disabled=true;button.textContent='Đang dựng…';
    try{
      if(!window.MediaRecorder||!canvas.captureStream)throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy dùng Chrome/Edge mới hoặc đổi sang máy cá nhân.');
      const spoken=spec.audio?.voice!=='none';if(!recordingType(t=>MediaRecorder.isTypeSupported(t),spoken))throw new Error('Trình duyệt không hỗ trợ codec xuất video.');
      startClock();setStep(0);setPct(0);
      ctx=new AudioContext();await ctx.resume();if(ctx.state!=='running')throw new Error('Âm thanh chưa được cho phép. Bấm Bắt đầu dựng lại.');
      const estimates=spec.scenes.map(s=>NV.estimateVoice(s.lines));if(estimates.reduce((n,e)=>n+e.duration,0)>180)throw new Error('Bản trình duyệt hỗ trợ tối đa 3 phút. Hãy rút ngắn kịch bản.');
      let voices=estimates,buffers=[],upload=null;
      async function audio(scene){const r=await fetch(`/api/projects/${projectId}/browser-audio`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-nv':'1'},body:JSON.stringify({scene}),signal});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Không tạo được giọng đọc.');}return ctx.decodeAudioData(await r.arrayBuffer());}
      if(spoken&&spec.audio?.voice==='upload'){
        note.textContent='Đang đọc bản thu âm của bạn…';upload=await audio(0);const total=estimates.reduce((n,e)=>n+e.duration,0);voices=spec.scenes.map((s,i)=>fittedVoice(s.lines,upload.duration*estimates[i].duration/total,NV.estimateVoice));
      }else if(spoken){
        for(let i=0;i<spec.scenes.length;i++){note.textContent=`Đang tạo giọng đọc cảnh ${i+1}/${spec.scenes.length}…`;setPct(i/spec.scenes.length*15);const b=await audio(i);buffers.push(b);}
        voices=spec.scenes.map((s,i)=>fittedVoice(s.lines,buffers[i].duration,NV.estimateVoice));
      }
      if(signal.aborted)throw signal.reason;
      const timeline=NV.buildTimeline(spec.scenes,voices,{intro:!!spec.intro?.title&&spec.look!=='act',continuous:!!upload});
      if(timeline.duration>180)throw new Error('Thời lượng giọng thực tế vượt 3 phút. Hãy rút ngắn video.');
      setStep(1);setPct(16);note.textContent='Đang dựng khung hình và chọn bộ mã hoá video…';
      let model,scale=0,recMime='';
      // the biggest picture this device can encode: try sharper first, then smaller
      const candidates=recordingTypes(t=>MediaRecorder.isTypeSupported(t),spoken).filter(t=>!badTypes.has(t));
      for(const sc of [4/3,1,2/3]){
        model=await previewModel(spec,sc,timeline);canvas.width=Math.round(model.W*sc);canvas.height=Math.round(model.H*sc);paintFrame(canvas.getContext('2d'),model,0);
        recMime=await workingType(canvas,recordingTypes(t=>MediaRecorder.isTypeSupported(t),spoken).filter(t=>!badTypes.has(t)),spoken?ctx:null);if(recMime){scale=sc;break;}
      }
      // the probe can be wrong on some machines: still try the first supported type for real (the start timeout below decides)
      if(!recMime&&candidates.length){recMime=candidates[0];scale=1;model=await previewModel(spec,1,timeline);canvas.width=model.W;canvas.height=model.H;paintFrame(canvas.getContext('2d'),model,0);}
      if(!recMime)throw new Error('Trình duyệt không mã hoá được video ở máy này ('+((workingType.errors||[]).slice(-2).join('; ')||'không có bộ mã hoá phù hợp')+'). Hãy dùng Chrome/Edge bản mới trên máy tính, hoặc chuyển sang dựng trên Cloud/máy cá nhân.');
      setPct(20);
      const dest=ctx.createMediaStreamDestination(),gain=ctx.createGain();gain.gain.value=spec.audio?.voiceVolume??1;gain.connect(dest);
      stream=canvas.captureStream(24);if(spoken)dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      recorder=new MediaRecorder(stream,{mimeType:recMime,videoBitsPerSecond:3500000,audioBitsPerSecond:128000});
      const chunks=[];let bytes=0,recordError,startReject;
      recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>120000000)controller.abort(new Error('Tệp vượt 120 MB. Hãy dựng video ngắn hơn.'));}};
      const stopped=new Promise(resolve=>{recorder.onstop=resolve;recorder.onerror=e=>{recordError=e.error||new Error('Bộ ghi video bị lỗi.');badTypes.add(recMime);startReject?.(recordError);controller.abort(recordError);};});
      const started=new Promise((resolve,reject)=>{recorder.onstart=resolve;startReject=reject;});recorder.start(1000);
      // a canvas stream only sends a frame when the picture changes: keep repainting until recording starts
      {const c2=canvas.getContext('2d');let n=0;const keep=setInterval(()=>{paintFrame(c2,model,0);if(n++%2)c2.fillRect(0,0,0,0);},60);
        try{await Promise.race([started,new Promise((_,no)=>setTimeout(()=>no(new Error('Bộ ghi video không khởi động được ('+recMime+'). Bấm Dựng lại để thử định dạng khác.')),6000))]);}
        catch(e){badTypes.add(recMime);throw e;}finally{clearInterval(keep);}}
      const base=ctx.currentTime+.05;
      const schedule=(buffer,time)=>{const src=ctx.createBufferSource();src.buffer=buffer;src.connect(gain);src.start(base+time);sources.push(src);};
      if(upload)schedule(upload,timeline.scenes[0].lines[0].start);else buffers.forEach((b,i)=>schedule(b,timeline.scenes[i].lines[0].start));
      try{wake=await navigator.wakeLock?.request('screen');}catch{}
      setStep(2);note.textContent=`Đang ghi ${spoken?'có lời đọc':'không lời'} · ${recMime.startsWith('video/mp4')?'MP4':'WebM'} · ${canvas.width}×${canvas.height} · giữ tab mở`;
      await new Promise((resolve,reject)=>{const abort=()=>{cancelAnimationFrame(raf);reject(signal.reason||new Error('Đã hủy dựng.'));};signal.addEventListener('abort',abort,{once:true});let last=performance.now();
        const frame=()=>{if(signal.aborted)return abort();if(ctx.state!=='running'){controller.abort(new Error('Âm thanh bị tạm dừng. Giữ tab mở và thử lại.'));return;}const now=performance.now();if(now-last>2500){controller.abort(new Error('Thiết bị bị gián đoạn khi dựng. Giữ tab mở và thử video ngắn hơn.'));return;}last=now;const t=Math.max(0,ctx.currentTime-base);paintFrame(canvas.getContext('2d'),model,Math.min(t,timeline.duration-.01));setPct(20+Math.min(79,t/timeline.duration*79),timeline.duration-t);if(t>=timeline.duration){signal.removeEventListener('abort',abort);resolve();}else raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);
      });
      recorder.stop();await stopped;if(recordError){badTypes.add(recMime);throw recordError;}const blob=new Blob(chunks,{type:recorder.mimeType||recMime});if(blob.size<1000)throw new Error('Tệp video rỗng.');
      const ext=blob.type.startsWith('video/mp4')?'mp4':'webm',url=URL.createObjectURL(blob),srt=URL.createObjectURL(new Blob([subtitleFile(spec,timeline)],{type:'text/plain;charset=utf-8'}));urls.push(url,srt);
      result.replaceChildren(h('a',{class:'btn',href:url,download:`video.${ext}`},`Tải ${ext.toUpperCase()}`),h('a',{class:'btn ghost',href:srt,download:'video.srt'},'Tải phụ đề SRT'),h('video',{src:url,controls:true,playsinline:true,class:'browser-result','aria-label':'Video vừa xuất'}));
      finished=true;setStep(3,'done');setPct(100,0);clearInterval(tick);note.textContent=`Đã xuất ${timeline.duration.toFixed(1)} giây. Tải video về trước khi đóng cửa sổ này.`;button.hidden=true;
    }catch(e){note.textContent=e?.message||'Không xuất được video.';button.disabled=signal.aborted;const at=[...steps.children].findIndex(li=>li.className==='on');if(at>=0)setStep(at,'fail');
      // a fresh window for the next try (this one's work was cancelled)
      const again=h('button',{type:'button',onclick:()=>{close();openBrowserRender(spec,projectId,opts);}},'Dựng lại');button.replaceWith(again);}
    finally{working=false;cleanup();}
  }
}

/**
 * First type whose encoder really starts on this canvas: isTypeSupported can say yes and still fail.
 * The probe uses the page's running AudioContext (a new one would be suspended without a click and
 * the recorder would wait for sound forever); only a recorder error counts as a failure.
 */
async function workingType(canvas,types,ctx){
  const errors=[];
  for(const type of types){
    const stream=canvas.captureStream(24);
    let dest=null;if(ctx){try{dest=ctx.createMediaStreamDestination();const o=ctx.createOscillator(),g=ctx.createGain();g.gain.value=0;o.connect(g).connect(dest);o.start();o.stop(ctx.currentTime+2);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch{}}
    const ok=await new Promise(resolve=>{
      let rec;try{rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:3500000});}catch(e){errors.push(type+': '+(e?.message||e));resolve(false);return;}
      const c2=canvas.getContext('2d');let n=0;const draw=setInterval(()=>{c2.fillStyle=n++%2?'#000':'#111';c2.fillRect(0,0,2,2);},40);
      let failed=false;
      const done=v=>{clearInterval(draw);try{if(rec.state!=='inactive')rec.stop();}catch{}resolve(v);};
      rec.onerror=e=>{failed=true;errors.push(type+': '+(e?.error?.message||'lỗi bộ mã hoá'));done(false);};
      try{rec.start(250);}catch(e){errors.push(type+': '+(e?.message||e));done(false);return;}
      setTimeout(()=>{if(!failed)done(rec.state==='recording');},1500);
    });
    stream.getVideoTracks().forEach(t=>t.stop());
    if(ok)return type;
  }
  workingType.errors=errors;
  return '';
}
