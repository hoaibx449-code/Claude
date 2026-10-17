export function creativePanel(spec,id,{h,api,busy,fail,save,refresh,helpHint}){
  if(!spec.creative)return null;
  const feedback=h('textarea',{rows:3,maxlength:1200,placeholder:'Ví dụ: Nhịp chậm hơn, bớt chữ, làm rõ nguyên nhân và kết quả; giữ nguyên lời đọc.'});
  const revise=h('button',{type:'button',class:'ghost small',onclick:()=>busy(revise,'AI đang đề xuất…',async()=>{
    try{
      if(feedback.value.trim().length<5)throw new Error('Hãy mô tả điều bạn muốn chỉnh.');
      await save.flush();const current=await api('/api/projects/'+id),snapshot=JSON.stringify(spec);
      const proposal=await api(`/api/projects/${id}/revise`,{method:'POST',body:{feedback:feedback.value,updatedAt:current.updated_at}});
      if(snapshot!==JSON.stringify(spec))throw new Error('Bạn đã chỉnh video trong lúc AI làm việc. Hãy yêu cầu lại trên bản mới.');
      const apply=h('button',{type:'button',onclick:()=>busy(apply,'Đang áp dụng…',async()=>{
        try{
          if(snapshot!==JSON.stringify(spec))throw new Error('Video đã thay đổi, chưa áp dụng đề xuất.');
          await api('/api/projects/'+id,{method:'PUT',body:{spec:proposal.spec,expectedUpdatedAt:proposal.updatedAt}});
          dialog.close();dialog.remove();refresh();
        }catch(e){fail(e);}
      })},'Áp dụng đề xuất');
      const dialog=h('dialog',{class:'help-dialog','aria-label':'Đề xuất chỉnh sửa'},h('h2',{},'AI đề xuất chỉnh sửa'),h('p',{class:'description'},proposal.spec.creative.approach),
        ...(proposal.spec.creative.limitations||[]).map(t=>h('p',{class:'description'},t)),
        h('p',{class:'muted'},'Giữ nguyên lời đọc. Chỉ thay bản dựng khi bạn áp dụng.'),
        h('div',{class:'row'},apply,h('button',{type:'button',class:'ghost',onclick:()=>{dialog.close();dialog.remove();}},'Giữ bản hiện tại')));
      dialog.addEventListener('cancel',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
    }catch(e){fail(e);}
  })},'Đề xuất chỉnh sửa');
  return h('details',{class:'creative-plan card',open:true},h('summary',{},'Hướng dựng AI'),
    h('p',{class:'description'},spec.creative.approach),
    spec.creative.limitations?.length?h('details',{},h('summary',{},'Khả năng đáp ứng'),spec.creative.limitations.map(t=>h('p',{class:'description'},t))):null,
    h('details',{},h('summary',{},'Yêu cầu đã gửi'),h('p',{class:'description'},spec.creative.wish),h('p',{class:'muted'},spec.creative.direction)),
    h('label',{},'Yêu cầu chỉnh sửa bằng lời',feedback),revise,
    helpHint('AI chỉnh sửa','Dùng lượt AI theo gói. Bạn xem đề xuất rồi mới áp dụng. Lời đọc được giữ nguyên.'));
}
