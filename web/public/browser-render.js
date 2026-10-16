export function recordingType(support, audio=true){
  const types=audio?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  return types.find(t=>support(t))||'';
}
export function fittedVoice(lines,duration,estimate){const e=estimate(lines),scale=duration/e.duration;return {duration,lines:e.lines.map(l=>({start:l.start*scale,end:l.end*scale}))};}
export function subtitleFile(spec,timeline){
  const stamp=s=>{const ms=Math.round(s*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};let n=0;
  return timeline.scenes.flatMap((sc,i)=>sc.lines.map((l,j)=>`${++n}\n${stamp(l.start)} --> ${stamp(l.end)}\n${spec.scenes[i].lines[j]}\n`)).join('\n');
}
let current=null;
export async function openBrowserRender(spec,projectId,{h,previewModel,paintFrame,NV,onClose}){
  current?.();
  const controller=new AbortController(),signal=controller.signal,urls=[],sources=[];let ctx,stream,recorder,raf=0,working=false,finished=false,closed=false,wake;
  const canvas=h('canvas',{'aria-label':'Khung hình đang xuất'}),note=h('p',{class:'muted',role:'status'},'Giữ tab này mở trong lúc dựng. Tệp tải về máy, chưa lưu vào thư viện.'),meter=h('progress',{max:100,value:0,'aria-label':'Tiến độ dựng trên trình duyệt'}),result=h('div',{class:'row'});
  const cleanup=()=>{cancelAnimationFrame(raf);if(recorder?.state==='recording')recorder.stop();sources.forEach(s=>{try{s.stop();}catch{}});stream?.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});wake?.release().catch(()=>{});};
  const close=()=>{if(closed)return;closed=true;controller.abort();cleanup();urls.forEach(u=>URL.revokeObjectURL(u));dialog.close();dialog.remove();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('hashchange',close);window.removeEventListener('pagehide',close);if(current===close)current=null;onClose?.();};
  const visibility=()=>{if(working&&document.hidden)controller.abort(new Error('Tab bị ẩn. Giữ tab dựng ở phía trước và dựng lại để tránh video thiếu khung hình.'));};
  const button=h('button',{type:'button',onclick:()=>run()},'Bắt đầu dựng');
  const dialog=h('dialog',{class:'render-desk browser-render','aria-labelledby':'browser-render-title'},h('header',{class:'render-desk-head'},h('h2',{id:'browser-render-title'},'Dựng trên trình duyệt'),h('button',{type:'button',class:'ghost small',onclick:close},'Đóng')),h('p',{},spec.title||'Video mới'),h('p',{class:'muted'},'Xuất hình và lời đọc. Bản tạm thời chưa trộn nhạc nền/hiệu ứng; hỗ trợ video tối đa 3 phút. Giọng AI cần dịch vụ giọng hoạt động, hoặc dùng MP3/WAV bạn tải lên.'),h('div',{class:'browser-render-preview'},canvas),note,meter,button,result);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});document.addEventListener('visibilitychange',visibility);window.addEventListener('hashchange',close);window.addEventListener('pagehide',close);document.body.append(dialog);dialog.showModal();current=close;
  async function run(){
    if(working||finished)return;working=true;button.disabled=true;
    try{
      if(!window.MediaRecorder||!canvas.captureStream)throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy dùng Chrome/Edge mới hoặc đổi sang máy cá nhân.');
      const spoken=spec.audio?.voice!=='none',mime=recordingType(t=>MediaRecorder.isTypeSupported(t),spoken);if(!mime)throw new Error('Trình duyệt không hỗ trợ codec xuất video.');
      ctx=new AudioContext();await ctx.resume();if(ctx.state!=='running')throw new Error('Âm thanh chưa được cho phép. Bấm Bắt đầu dựng lại.');
      const estimates=spec.scenes.map(s=>NV.estimateVoice(s.lines));if(estimates.reduce((n,e)=>n+e.duration,0)>180)throw new Error('Bản trình duyệt hỗ trợ tối đa 3 phút. Hãy rút ngắn kịch bản.');
      let voices=estimates,buffers=[],upload=null;
      async function audio(scene){const r=await fetch(`/api/projects/${projectId}/browser-audio`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-nv':'1'},body:JSON.stringify({scene}),signal});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Không tạo được giọng đọc.');}return ctx.decodeAudioData(await r.arrayBuffer());}
      if(spoken&&spec.audio?.voice==='upload'){
        note.textContent='Đang đọc bản thu âm của bạn…';upload=await audio(0);const total=estimates.reduce((n,e)=>n+e.duration,0);voices=spec.scenes.map((s,i)=>fittedVoice(s.lines,upload.duration*estimates[i].duration/total,NV.estimateVoice));
      }else if(spoken){
        for(let i=0;i<spec.scenes.length;i++){note.textContent=`Chuẩn bị giọng đọc: cảnh ${i+1}/${spec.scenes.length}`;const b=await audio(i);buffers.push(b);}
        voices=spec.scenes.map((s,i)=>fittedVoice(s.lines,buffers[i].duration,NV.estimateVoice));
      }
      if(signal.aborted)throw signal.reason;
      const timeline=NV.buildTimeline(spec.scenes,voices,{intro:!!spec.intro?.title&&spec.look!=='act',continuous:!!upload});
      if(timeline.duration>180)throw new Error('Thời lượng giọng thực tế vượt 3 phút. Hãy rút ngắn video.');
      note.textContent='Đang chuẩn bị hình…';const model=await previewModel(spec,4/3,timeline);canvas.width=Math.round(model.W*4/3);canvas.height=Math.round(model.H*4/3);paintFrame(canvas.getContext('2d'),model,0);
      const dest=ctx.createMediaStreamDestination(),gain=ctx.createGain();gain.gain.value=spec.audio?.voiceVolume??1;gain.connect(dest);
      stream=canvas.captureStream(24);if(spoken)dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3500000,audioBitsPerSecond:128000});
      const chunks=[];let bytes=0,recordError,startReject;
      recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>120000000)controller.abort(new Error('Tệp vượt 120 MB. Hãy dựng video ngắn hơn.'));}};
      const stopped=new Promise(resolve=>{recorder.onstop=resolve;recorder.onerror=e=>{recordError=e.error||new Error('Bộ ghi video bị lỗi.');startReject?.(recordError);controller.abort(recordError);};});
      const started=new Promise((resolve,reject)=>{recorder.onstart=resolve;startReject=reject;});recorder.start(1000);await started;
      const base=ctx.currentTime+.05;
      const schedule=(buffer,time)=>{const src=ctx.createBufferSource();src.buffer=buffer;src.connect(gain);src.start(base+time);sources.push(src);};
      if(upload)schedule(upload,timeline.scenes[0].lines[0].start);else buffers.forEach((b,i)=>schedule(b,timeline.scenes[i].lines[0].start));
      try{wake=await navigator.wakeLock?.request('screen');}catch{}
      note.textContent=`Đang dựng ${spoken?'có lời đọc':'không lời'} · ${mime.startsWith('video/mp4')?'MP4':'WebM'} · giữ tab mở`;
      await new Promise((resolve,reject)=>{const abort=()=>{cancelAnimationFrame(raf);reject(signal.reason||new Error('Đã hủy dựng.'));};signal.addEventListener('abort',abort,{once:true});let last=performance.now();
        const frame=()=>{if(signal.aborted)return abort();if(ctx.state!=='running'){controller.abort(new Error('Âm thanh bị tạm dừng. Giữ tab mở và thử lại.'));return;}const now=performance.now();if(now-last>2500){controller.abort(new Error('Thiết bị bị gián đoạn khi dựng. Giữ tab mở và thử video ngắn hơn.'));return;}last=now;const t=Math.max(0,ctx.currentTime-base);paintFrame(canvas.getContext('2d'),model,Math.min(t,timeline.duration-.01));meter.value=Math.min(99,t/timeline.duration*100);if(t>=timeline.duration){signal.removeEventListener('abort',abort);resolve();}else raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);
      });
      recorder.stop();await stopped;if(recordError)throw recordError;const blob=new Blob(chunks,{type:recorder.mimeType||mime});if(blob.size<1000)throw new Error('Tệp video rỗng.');
      const ext=blob.type.startsWith('video/mp4')?'mp4':'webm',url=URL.createObjectURL(blob),srt=URL.createObjectURL(new Blob([subtitleFile(spec,timeline)],{type:'text/plain;charset=utf-8'}));urls.push(url,srt);
      result.replaceChildren(h('a',{class:'btn',href:url,download:`video.${ext}`},`Tải ${ext.toUpperCase()}`),h('a',{class:'btn ghost',href:srt,download:'video.srt'},'Tải phụ đề SRT'),h('video',{src:url,controls:true,playsinline:true,class:'browser-result','aria-label':'Video vừa xuất'}));
      finished=true;meter.value=100;note.textContent=`Đã xuất ${timeline.duration.toFixed(1)} giây. Tải video về trước khi đóng cửa sổ này.`;button.hidden=true;
    }catch(e){note.textContent=e?.message||'Không xuất được video.';button.disabled=signal.aborted;}
    finally{working=false;cleanup();}
  }
}
