// Only declarative scene data. No expressions, external URLs or executable AI code.
const text=(x:any,n:number)=>typeof x==='string'?x.trim().slice(0,n):'';
export function cleanIllustrated(x:any){
 if(!x||typeof x!=='object')return undefined;
 const layers=(Array.isArray(x.layers)?x.layers:[]).slice(0,3).map((a:any,i:number)=>({
  role:['character','object','metaphor'].includes(a?.role)?a.role:'object',
  prompt:text(a?.prompt,900),cue:text(a?.cue,80),line:Math.max(0,Math.min(2,Number.isInteger(a?.line)?a.line:0)),
  enter:['rise','pop','slide','fade'].includes(a?.enter)?a.enter:(i?'pop':'rise'),
  idle:['none','breathe','float'].includes(a?.idle)?a.idle:'none',
 }));
 if(!layers.length||layers.some((a:any)=>!a.prompt))return undefined;
 return {headline:text(x.headline,80),emphasis:text(x.emphasis,30),
  layout:['duo','hero','reverse','trio'].includes(x.layout)?x.layout:(layers.length===3?'trio':layers.length===1?'hero':'duo'),
  accent:/^#[a-f0-9]{6}$/i.test(x.accent)?x.accent:'#f7ce3b',layers};
}
export const ILLUSTRATED_BRIEF=`HOẠT HÌNH MINH HỌA NHIỀU LỚP. Không làm slideshow toàn cảnh. Mỗi cảnh có nhân vật nguyên hình và 1-2 đạo cụ/ẩn dụ riêng, xuất hiện theo cụm từ đúng của lời kể. Chuyển động nhẹ nguyên hình, không tách/xoay tay chân. Hình minh họa diễn đạt rõ ý, không hình tròn/vuông vô nghĩa. Không tự thêm tên kênh, thương hiệu hay nhân vật từ mẫu. Nhân vật, giới tính, trang phục phải theo yêu cầu người dùng; nếu không có chỉ định, chọn chủ thể phù hợp lời kể và mô tả nhận diện nhất quán ở TẤT CẢ prompt nhân vật. Đạo cụ phải riêng theo ý từng cảnh, không mặc định sách/đồng hồ/tiền. Giữ nguyên lời đọc khi có sẵn. Chữ ngắn 3-8 từ trên đầu, từ nhấn có trong tiêu đề; không chữ trong ảnh. X của mỗi cảnh: {illustrated:{headline,emphasis,layout:"duo|hero|reverse|trio",accent:"#f7ce3b",layers:[{role:"character|object|metaphor",prompt:"English detailed single full character/isolated object on pure white, no text",line:0,cue:"cụm từ chép đúng từ câu",enter:"rise|pop|slide|fade",idle:"none|breathe|float"}]}}. Tối đa 3 lớp, ít nhất 1 lớp. Mỗi layer tương ứng một ảnh riêng; giữ nguyên tỉ lệ. Xen kẽ bố cục hợp nội dung, không lặp máy móc. Nhịp xuất hiện căn theo câu/cụm từ ước tính, không tuyên bố đồng bộ từng từ chính xác.`;
export function planIllustrated(lines:string[],candidate?:any){
 return cleanIllustrated(candidate)||cleanIllustrated({headline:lines[0].split(/\s+/).slice(0,8).join(' '),layout:'hero',layers:[{role:'metaphor',prompt:'Create one meaningful colored cartoon illustration, depicting the specific situation in this narration, without any written text. Avoid arbitrary props. Narration: '+lines.join(' '),line:0,enter:'rise'}]});
}
