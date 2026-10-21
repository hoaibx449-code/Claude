/** Human-facing names; opaque IDs remain only in URLs/callbacks and database keys. */
export function councilTitle(job:any){
  const snapshot=typeof job.snapshot==='string'?JSON.parse(job.snapshot):job.snapshot;
  return titleText(snapshot?.sessionTitle||job.brief||'Phiên nội dung mới');
}
export function titleText(value:string){
  return String(value).split('\n')[0].replace(/\*+|^#+\s*/g,'').replace(/\s+/g,' ').trim().slice(0,90)||'Phiên nội dung mới';
}
export const councilState:Record<string,string>={queued:'Đang xếp hàng',running:'Đang làm',pending:'Chờ duyệt',approved:'Đã duyệt',revision:'Chờ chỉnh sửa',rejected:'Đã từ chối',paused:'Tạm dừng',cancelled:'Đã hủy'};
export const councilMenu=()=>({inline_keyboard:[
  [{text:'Giao nhiệm vụ',callback_data:'ui:new'},{text:'Tiến độ',callback_data:'ui:status'}],
  [{text:'Phiên gần đây',callback_data:'ui:history'}],
]});
export function councilButtons(id:string,status:string){
  if(status==='pending')return{inline_keyboard:[
    [{text:'Duyệt nội dung',callback_data:'approved:'+id},{text:'Yêu cầu sửa',callback_data:'revision:'+id}],
    [{text:'Từ chối',callback_data:'rejected:'+id},{text:'Đổi tên phiên',callback_data:'ui:rename:'+id}],
    [{text:'Menu',callback_data:'ui:menu'}],
  ]};
  if(status==='approved')return{inline_keyboard:[
    [{text:'Xem nội dung',callback_data:'ui:view:'+id},{text:'Làm phiên bản tiếp',callback_data:'ui:revise:'+id}],
    ...councilMenu().inline_keyboard,
  ]};
  if(status==='revision')return{inline_keyboard:[
    [{text:'Gửi yêu cầu sửa',callback_data:'ui:revise:'+id},{text:'Xem nội dung',callback_data:'ui:view:'+id}],
    ...councilMenu().inline_keyboard,
  ]};
  return{inline_keyboard:[
    [{text:'Xem tiến độ',callback_data:'ui:status:'+id},{text:'Đổi tên phiên',callback_data:'ui:rename:'+id}],
    ...councilMenu().inline_keyboard,
  ]};
}

/** Telegram entities provide bold without parsing HTML supplied by a user or model. */
export function councilTelegramFormat(value:string){
  const entities:{type:'bold';offset:number;length:number}[]=[];
  let output='';
  const lines=value.replace(/\*{3,}/g,'').split('\n');
  lines.forEach((original,index)=>{
    const line=original.replace(/^#{1,6}\s+/,'').replace(/^\*\s+/,'• '),start=output.length;
    const pattern=/\*\*([^*\n]+)\*\*/g;let cursor=0,match:RegExpExecArray|null;
    while((match=pattern.exec(line))){
      output+=line.slice(cursor,match.index).replace(/\*\*/g,'');
      entities.push({type:'bold',offset:output.length,length:match[1].length});output+=match[1];cursor=match.index+match[0].length;
    }
    output+=line.slice(cursor).replace(/\*\*/g,'');
    const length=output.length-start;
    if(length&&(index===0||line.startsWith('Phiên: ')||/^\d+\.\s/.test(line)||['PHÂN CÔNG','CÁCH LÀM','NHIỆM VỤ','TÌNH TRẠNG','BƯỚC TIẾP THEO'].includes(line))&&
      !entities.some(e=>e.offset>=start))entities.push({type:'bold',offset:start,length});
    if(index<lines.length-1)output+='\n';
  });
  return{text:output,entities};
}
