export function openVoicePicker({h,voices,value,speed=1,audio={},apply}){
  let chosen=value,rate=speed,sound={voice:'tts',voiceVolume:1,...audio},player=null,url=null,request=null;
  const stop=()=>{request?.abort();request=null;player?.pause();player=null;if(url)URL.revokeObjectURL(url);url=null;};
  const close=()=>{stop();dialog.close();dialog.remove();};
  const status=h('p',{class:'muted',role:'status'});
  const search=h('input',{type:'search',placeholder:'Tìm tên giọng, vùng miền…','aria-label':'Tìm giọng đọc',oninput:()=>paint()});
  const provider=h('select',{'aria-label':'Dịch vụ giọng đọc',onchange:()=>paint()},h('option',{value:''},'Tất cả dịch vụ'),... [...new Set(voices.map(v=>v.provider))].map(p=>h('option',{value:p},({everai:'EverAI',google:'Google',free:'Giọng máy',elevenlabs:'ElevenLabs'})[p]||p)));
  const list=h('div',{class:'voice-picker-list',role:'radiogroup','aria-label':'Danh sách giọng đọc'});
  async function preview(v){
    stop();const pending=request=new AbortController();status.textContent='Đang chuẩn bị bản nghe thử…';
    try{
      const r=await fetch('/api/voices/preview?code='+encodeURIComponent(v.code),{credentials:'same-origin',signal:pending.signal});
      if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||'Chưa nghe thử được giọng này.');}
      if(!dialog.isConnected)return;
      const blob=await r.blob();if(pending.signal.aborted||!dialog.isConnected)return;url=URL.createObjectURL(blob);player=new Audio(url);player.playbackRate=rate;player.volume=Math.min(1,sound.voiceVolume??1);
      await player.play();status.textContent=r.headers.get('x-voice-source')==='standin'?'Đang nghe bản tham khảo; dịch vụ giọng này chưa sẵn sàng.':'Đang nghe: '+v.label;
    }catch(e){if(e.name!=='AbortError')status.textContent=e.message;}
  }
  function paint(){
    const q=search.value.toLocaleLowerCase('vi'),items=voices.filter(v=>(!provider.value||v.provider===provider.value)&&v.label.toLocaleLowerCase('vi').includes(q));
    list.replaceChildren(...(items.length?items.map(v=>h('div',{class:'voice-picker-row'+(chosen===v.code?' selected':'')},
      h('button',{type:'button',role:'radio','aria-checked':String(chosen===v.code),onclick:()=>{chosen=v.code;paint();}},h('span',{},v.label),h('small',{class:'muted'},v.provider)),
      h('button',{type:'button',class:'ghost small','aria-label':'Nghe thử '+v.label,onclick:()=>preview(v)},'Nghe thử'))):[h('p',{class:'muted'},'Không tìm thấy giọng phù hợp.')]));
  }
  const rateOut=h('output',{},rate+'×'),volumeOut=h('output',{},Math.round((sound.voiceVolume??1)*100)+'%');
  const ai=h('section',{},h('div',{class:'voice-picker-filters'},search,provider),list,
    h('label',{class:'voice-picker-slider'},'Tốc độ đọc',h('input',{type:'range',min:.8,max:1.2,step:.05,value:rate,'aria-label':'Tốc độ đọc',oninput:e=>{rate=Number(e.target.value);rateOut.textContent=rate.toFixed(2)+'×';if(player)player.playbackRate=rate;}}),rateOut));
  const uploadNote=h('p',{class:'muted'},sound.voiceFile?'Đã có bản thu âm. Bạn có thể thay tệp.':'MP3, M4A hoặc WAV, tối đa 25 MB.');
  const file=h('input',{type:'file',accept:'.mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav','aria-label':'Tải giọng của tôi',onchange:async()=>{
    const f=file.files?.[0];if(!f)return;if(f.size>25e6){uploadNote.textContent='Tệp tối đa 25 MB.';return;}
    save.disabled=true;uploadNote.textContent='Đang tải lên…';
    try{const r=await fetch('/api/voice-upload',{method:'POST',credentials:'same-origin',headers:{'x-nv':'1','content-type':f.type||(/\.wav$/i.test(f.name)?'audio/wav':/\.m4a$/i.test(f.name)?'audio/mp4':'audio/mpeg')},body:f});const j=await r.json();if(!r.ok)throw new Error(j.error||'Không tải được bản thu âm.');if(!dialog.isConnected)return;sound.voiceFile=j.ref;uploadNote.textContent='Đã tải: '+f.name;}catch(e){uploadNote.textContent=e.message;}finally{save.disabled=false;}
  }});
  const upload=h('section',{},file,uploadNote);
  const volume=h('label',{class:'voice-picker-slider'},'Âm lượng lời đọc',h('input',{type:'range',min:0,max:1.5,step:.05,value:sound.voiceVolume??1,'aria-label':'Âm lượng lời đọc',oninput:e=>{sound.voiceVolume=Number(e.target.value);volumeOut.textContent=Math.round(sound.voiceVolume*100)+'%';if(player)player.volume=Math.min(1,sound.voiceVolume);}}),volumeOut);
  const tabs=h('div',{class:'seg',role:'radiogroup','aria-label':'Nguồn lời đọc'});
  function source(){stop();tabs.replaceChildren(...[['tts','Giọng AI'],['upload','Giọng của tôi'],['none','Không lời']].map(([k,t])=>h('button',{type:'button',role:'radio','aria-checked':String(sound.voice===k),class:sound.voice===k?'on':'',onclick:()=>{sound.voice=k;source();}},t)));ai.hidden=sound.voice!=='tts';upload.hidden=sound.voice!=='upload';volume.hidden=sound.voice==='none';status.textContent='';}
  const save=h('button',{type:'button',onclick:()=>{if(sound.voice==='upload'&&!sound.voiceFile){status.textContent='Hãy tải bản thu âm trước khi áp dụng.';return;}apply({value:chosen,speed:rate,audio:sound});close();}},'Áp dụng');
  const dialog=h('dialog',{class:'voice-picker','aria-label':'Thiết lập giọng đọc'},h('header',{},h('h2',{},'Giọng đọc'),h('button',{type:'button',class:'ghost small','aria-label':'Đóng thiết lập giọng đọc',onclick:close},'Đóng')),
    h('div',{class:'voice-picker-body'},tabs,ai,upload,volume,status),h('footer',{},h('button',{type:'button',class:'ghost',onclick:close},'Hủy'),save));
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',stop);document.body.append(dialog);paint();source();dialog.showModal();
}
