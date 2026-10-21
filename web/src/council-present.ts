/** Human-facing names; opaque IDs remain only in URLs/callbacks and database keys. */
export function councilTitle(job:any){
  const snapshot=typeof job.snapshot==='string'?JSON.parse(job.snapshot):job.snapshot;
  return titleText(snapshot?.sessionTitle||job.brief||'Phiên nội dung mới');
}
export function titleText(value:string){
  return String(value).split('\n')[0].replace(/\*+|^#+\s*/g,'').replace(/\s+/g,' ').trim().slice(0,90)||'Phiên nội dung mới';
}
export const councilState:Record<string,string>={answered:'Trợ lý đã trả lời',delegating:'Đang phân công đội ngũ',queued:'Đang xếp hàng',running:'Đang làm',pending:'Chờ duyệt',approved:'Đã duyệt',revision:'Chờ chỉnh sửa',rejected:'Đã từ chối',paused:'Tạm dừng',cancelled:'Đã hủy'};
export const councilMenu=()=>({inline_keyboard:[
  [{text:'Trò chuyện với trợ lý chung',callback_data:'ui:assistant'}],
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

/** Normalize presentation only; never interpret user/model text as HTML. */
export function councilPlain(value:string,preserveBold=false){
  let text=String(value).normalize('NFC').replace(/\r\n?/g,'\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\uE000\uE001]/g,'')
    .replace(/[\u{1D400}-\u{1D7FF}\uFF01-\uFF5E]/gu,ch=>ch.normalize('NFKC'))
    .replace(/^\s*```[^\n]*$/gm,'').replace(/`([^`\n]+)`/g,'$1')
    .replace(/\*{2,}([^*\n]+)\*{2,}/g,'\uE000$1\uE001')
    .replace(/!?(\[([^\]\n]+)\])\((https?:\/\/[^\s)]+)\)/g,'$2 ($3)')
    .replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/^\s*>\s?/gm,'')
    .replace(/^(\s*)[-*+]\s+/gm,'$1• ')
    .replace(/(?<=\d)\s*\*\s*(?=\d)/g,' × ').replace(/\*/g,'')
    .replace(/(?<![\p{L}\p{N}])_{1,2}([^_\n]+)_{1,2}(?![\p{L}\p{N}])/gu,'$1')
    .replace(/~~([^~\n]+)~~/g,'$1');
  const lines=text.split('\n'),result:string[]=[];
  for(let i=0;i<lines.length;i++){
    const cells=(line:string)=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
    if(lines[i].trim().startsWith('|')&&i+1<lines.length&&cells(lines[i+1]).every(c=>/^:?-{3,}:?$/.test(c))){
      const headers=cells(lines[i++]);
      while(i+1<lines.length&&lines[i+1].trim().startsWith('|')){
        const row=cells(lines[++i]);result.push('',...row.map((cell,j)=>(headers[j]?headers[j]+': ':'')+cell),'');
      }
    }else result.push(lines[i].replace(/[ \t]+$/,''));
  }
  text=result.join('\n').replace(/^\s*[-_=]{3,}\s*$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
  return preserveBold?text:text.replace(/[\uE000\uE001]/g,'');
}

/** Telegram entities provide bold without parsing HTML supplied by a user or model. */
export function councilTelegramFormat(value:string){
  const entities:{type:'bold';offset:number;length:number}[]=[];
  let output='';
  const lines=councilPlain(value,true).split('\n');
  lines.forEach((original,index)=>{
    const line=original.replace(/^#{1,6}\s+/,'').replace(/^\*\s+/,'• '),start=output.length;
    const pattern=/\uE000([^\uE001\n]+)\uE001/g;let cursor=0,match:RegExpExecArray|null;
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
