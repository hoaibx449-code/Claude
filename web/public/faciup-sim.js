// Faciup Live, continuous operation (a show mode set in Quản trị → Nhóm AI): the office plays out a
// working day with no AI and nothing written anywhere. Everything is worked out from the clock and a
// seeded random stream per day, so every viewer sees the same sessions, hand-overs and Zalo chats at
// the same moment, and a day never repeats the same order or timings.
const DAY=864e5,VN=7*3600e3;
// timings in seconds as [least, spread]; "max" runs three sessions side by side so files keep moving
const PROFILE={
 normal:{streams:1,intake:[8,12],member:[18,50],synth:[12,18],gap:[20,90],task:[35,80],rest:[120,360],chat:[30,90]},
 high:{streams:1,intake:[5.2,7.8],member:[11.7,32.5],synth:[7.8,11.7],gap:[13,58],task:[23,52],rest:[78,234],chat:[20,58]},
 max:{streams:3,intake:[3,3],member:[5,10],synth:[4,4],gap:[2,4],task:[12,20],rest:[15,40],chat:[15,15]}};
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const pick=(r,list)=>list[Math.floor(r()*list.length)];
// slow drifting value in [0,1] for the wall-board bars
const drift=(t,k)=>.5+.32*Math.sin(t/(613e3+k*97e3)+k)+.18*Math.sin(t/(171e3+k*31e3)+k*2.3);

const CHATS=[
 ['Cho mình hỏi gói Pro bao nhiêu một tháng?','Gói Pro hiện có giá theo tháng ở mục Gói cước, kèm nhiều lượt dựng video hơn. Bạn muốn mình gửi link xem chi tiết không?'],
 ['Mình muốn làm video bán hàng 30 giây thì bắt đầu sao?','Bạn vào Tạo video, chọn mẫu Bán hàng và nhập tên sản phẩm. Hệ thống tự gợi ý kịch bản 30 giây cho bạn.'],
 ['Có giọng đọc miền Nam không bạn?','Có ạ, bạn chọn giọng ở bước Lồng tiếng, có cả giọng nam và nữ miền Nam.'],
 ['Video xuất ra được 9:16 cho TikTok không?','Được bạn nhé, khi xuất chọn khung 9:16 là đăng TikTok, Reels, Shorts đều vừa.'],
 ['Thanh toán VietQR bao lâu thì kích hoạt?','Thường chỉ vài giây sau khi chuyển khoản đúng nội dung là gói được kích hoạt tự động.'],
 ['Mình có thể dùng ảnh sản phẩm của mình không?','Được ạ, bạn tải ảnh lên ở bước Hình ảnh, hệ thống sẽ đưa vào từng cảnh.'],
 ['Làm sao để có phụ đề tiếng Việt?','Phụ đề được tạo tự động theo lời đọc, bạn có thể chỉnh chữ trước khi xuất.'],
 ['Dùng thử miễn phí được mấy video?','Bạn được dùng thử ngay không cần thẻ, số lượt hiện ở mục Tài khoản sau khi đăng nhập.'],
 ['Video hoạt hình vẽ tay làm được không?','Có ạ, bạn chọn phong cách Vẽ tay trong Tạo video, nét vẽ sẽ hiện dần như đang vẽ.'],
 ['Mình cần ý tưởng video cho quán cà phê','Bạn thử mục Gợi ý sáng tạo, gõ "quán cà phê" là có ngay vài ý tưởng kèm kịch bản mẫu.'],
 ['Xuất video mất bao lâu vậy?','Video 1 phút thường dựng xong trong vài phút, bạn sẽ nhận thông báo khi hoàn tất.'],
 ['Có hóa đơn cho doanh nghiệp không?','Có bạn nhé, bạn để lại thông tin công ty, bộ phận kế toán sẽ gửi hóa đơn.'],
 ['Mình quên mật khẩu thì làm sao?','Bạn bấm Đăng nhập, chọn đăng nhập bằng email, hệ thống gửi mã cho bạn ngay.'],
 ['Có thể đổi nhạc nền không?','Được ạ, ở bước Âm thanh bạn chọn nhạc khác hoặc tắt nhạc nền.'],
 ['Video dài nhất được bao nhiêu phút?','Hiện tối đa 10 phút mỗi video, phù hợp cả YouTube lẫn video ngắn.'],
 ['Mình muốn video giới thiệu khóa học','Bạn chọn mẫu Giáo dục, nhập tên khóa học và 3 ý chính, mình sẽ dựng kịch bản giúp bạn.'],
 ['Có kênh hỗ trợ ngoài Zalo không?','Bạn có thể nhắn ngay tại đây hoặc dùng khung chat trên web, đội hỗ trợ trực 24/7.'],
 ['Video có bị gắn logo không?','Gói trả phí xuất video không có logo, bản dùng thử có logo nhỏ ở góc.'],
 ['Làm video review sách được không bạn?','Được ạ, chọn mẫu Review sách, hệ thống gợi ý mở đầu, ý chính và lời kêu gọi.'],
 ['Có nhân vật hoạt hình riêng cho thương hiệu không?','Có, bạn tải ảnh nhân vật tham chiếu, các cảnh sẽ giữ đúng nhân vật đó.'],
 ['Mình muốn hủy gói thì sao?','Bạn vào Tài khoản → Gói cước để tắt gia hạn, gói vẫn dùng đến hết kỳ.'],
 ['Có làm được video tiếng Anh không?','Được ạ, bạn chọn ngôn ngữ tiếng Anh ở bước Kịch bản và Lồng tiếng.'],
 ['Gửi mình bảng giá với','Mình gửi bạn link Gói cước nhé, có so sánh chi tiết từng gói.'],
 ['Có mẫu video tuyển dụng không?','Có mẫu Tuyển dụng, bạn nhập vị trí và quyền lợi là có video đăng ngay.'],
 ['Mình làm shop mỹ phẩm, nên làm video gì?','Bạn thử video trước–sau và mẹo dùng sản phẩm 20 giây, tỉ lệ xem hết rất cao.'],
 ['Có hướng dẫn sử dụng không?','Có video hướng dẫn ở trang chủ, chỉ khoảng 3 phút là bạn làm được video đầu tiên.'],
 ['Tải video về máy được không?','Được ạ, xong video bạn bấm Tải về, có cả bản HD.'],
 ['Có làm slide thuyết trình thành video được không?','Được bạn nhé, bạn dán nội dung từng slide, hệ thống chuyển thành cảnh có lời đọc.'],
];
const ADMIN={
 hr:['Cập nhật lịch trực','Tổng hợp chấm công','Rà soát quy trình','Đánh giá hiệu suất tuần','Hướng dẫn trợ lý mới','Sắp xếp ca hỗ trợ'],
 accounting:['Đối soát chi phí AI','Kiểm tra đơn hàng','Lập báo cáo doanh thu','Đối chiếu VietQR','Cập nhật sổ quỹ','Xuất hóa đơn'],
};

export function createSim(){
 let cache=null,prevT=0,prevTurn=[],prevDone=-1,prevAdmin={},prevZalo=-1;
 // the day's plan for these members: sessions, admin tasks per desk, Zalo chats
 function plan(day,members,admins,level){
  const key=[day,members.join(','),admins.map(a=>a.i).join(','),level].join('|');
  if(cache?.key===key)return cache;
  const X=PROFILE[level]||PROFILE.high,start=day*DAY-VN,end=start+DAY,sec=(r,[a,b])=>(a+r()*b)*1e3;
  const streams=[];for(let q=0;q<X.streams;q++){const r=rng(hash(key+'s'+q)),sessions=[];let t=start+r()*30e3+q*X.member[0]*1e3*1.7;
   while(t<end){const order=members.filter(()=>r()<.85),team=order.length>=2?order:members.slice(0,2),rounds=r()<.25?2:1,turns=[{who:0,kind:'intake',dur:sec(r,X.intake)}];
    for(let k=0;k<rounds;k++)for(const m of team)turns.push({who:m,kind:'member',dur:sec(r,X.member)});
    turns.push({who:0,kind:'synth',dur:sec(r,X.synth)});
    let at=t;for(const x of turns){x.at=at;at+=x.dur;}
    sessions.push({start:t,end:at,turns,review:(70+r()*260)*1e3});t=at+sec(r,X.gap);}
   streams.push(sessions);}
  const tasks={};for(const a of admins){const r=rng(hash(key+'a'+a.i)),list=[];let t=start+r()*90e3;
   while(t<end){const dur=sec(r,X.task);list.push({at:t,end:t+dur,text:pick(r,ADMIN[a.role]||ADMIN.hr)});t+=dur+sec(r,X.rest);}tasks[a.i]=list;}
  const chats=[];{const r=rng(hash(key+'z'));let t=start+r()*40e3;const recent=[];
   while(t<end){let n;do n=Math.floor(r()*CHATS.length);while(recent.includes(n));recent.push(n);if(recent.length>8)recent.shift();
    const proc=(2.5+r()*4.5)*1e3;chats.push({at:t,reply:t+proc,q:CHATS[n][0],a:CHATS[n][1]});t+=proc+sec(r,X.chat);}}
  return cache={key,streams,tasks,chats};
 }
 const upto=(list,t,f)=>{let lo=0,hi=list.length;while(lo<hi){const m=lo+hi>>1;if(f(list[m])<=t)lo=m+1;else hi=m;}return lo;};
 /** the office at time t; `events` are what happened since the last call (for hand-overs and sounds) */
 return function at(t,agents,level,{mainBusy=false}={}){
  const day=Math.floor((t+VN)/DAY),lead=0;
  const members=[],admins=[];let zalo=-1;
  agents.forEach((a,i)=>{if(i===lead)return;if(a.icon==='zalo'){zalo=i;return;}if(a.room==='admin')admins.push({i,role:a.icon==='chart'?'accounting':'hr'});else members.push(i);});
  const P=plan(day,members,admins,level),out={desk:{},count:{},events:[],done:0,pending:0,working:0,progress:0,chat:[],zaloBusy:false};
  const add=(i,n)=>{out.count[i]=(out.count[i]||0)+n;};
  // sessions: finished ones count for every turn; open ones decide who works, watches and waits
  let leadWork=null,leadWatch=false;
  P.streams.forEach((sessions,q)=>{
   const n=upto(sessions,t,s=>s.start),cur=n>0?sessions[n-1]:null;
   for(let j=0;j<n;j++){const s=sessions[j];if(s.end<=t){for(const x of s.turns)add(x.who,1);if(t-s.end<s.review)out.pending++;else out.done++;}}
   let turnKey='';
   if(cur&&cur.end>t&&!mainBusy){
    const k=cur.turns.findIndex(x=>t<x.at+x.dur),x=cur.turns[k];turnKey=cur.start+':'+k;
    for(let z=0;z<k;z++)add(cur.turns[z].who,1);
    if(q===0)out.progress=Math.round(k/cur.turns.length*100);
    if(x.kind==='member'){leadWatch=true;if(out.desk[x.who]?.look!=='work')out.desk[x.who]={look:'work'};}else leadWork=x.kind==='intake'?'Nhận việc':'Tổng hợp kết quả';
    for(const y of cur.turns.slice(k+1))if(y.who!==lead&&!out.desk[y.who])out.desk[y.who]={look:'wait'};
    out.working++;
    const pk=prevTurn[q];if(pk&&turnKey!==pk){const [ps,pi]=pk.split(':').map(Number),prev=sessions.find(s=>s.start===ps)?.turns[pi];
     if(prev&&prev.who!==x.who)out.events.push({type:'hand',from:prev.who,to:x.who,toLead:x.who===lead});}
   }
   if(!mainBusy)prevTurn[q]=turnKey;});
  if(leadWork)out.desk[lead]={look:'work',task:leadWork};else if(leadWatch)out.desk[lead]={look:'watch',task:'Giám sát phiên'};
  if(prevDone>=0&&out.done+out.pending>prevDone)out.events.push({type:'done'});
  prevDone=out.done+out.pending;
  // the admin room: short internal jobs, reported to the lead when done
  for(const a of admins){const list=P.tasks[a.i]||[],m=upto(list,t,x=>x.at),x=m>0?list[m-1]:null,finished=x&&x.end<=t?m:m-1;add(a.i,Math.max(0,finished));
   if(x&&x.end>t){out.desk[a.i]={look:'work',task:x.text};out.working++;}
   if(prevAdmin[a.i]!==undefined&&finished>prevAdmin[a.i])out.events.push({type:'hand',from:a.i,to:lead,toLead:true});
   prevAdmin[a.i]=finished;}
  // Zalo: customers write, the bot answers a few seconds later
  if(zalo>=0){const m=upto(P.chats,t,c=>c.at),replies=upto(P.chats,t,c=>c.reply);add(zalo,replies);
   const last=m>0?P.chats[m-1]:null;if(last&&last.reply>t){out.desk[zalo]={look:'work'};out.zaloBusy=true;out.working++;}
   for(const c of P.chats.slice(Math.max(0,m-4),m)){out.chat.push({role:'user',text:c.q,at:c.at});if(c.reply<=t)out.chat.push({role:'bot',text:c.a,at:c.reply});}
   if(prevZalo>=0)for(const c of P.chats.slice(Math.max(0,m-5),m)){if(c.at>prevT)out.events.push({type:'zalo',role:'user',text:c.q});if(c.reply>prevT&&c.reply<=t)out.events.push({type:'zalo',role:'bot',text:c.a});}
   prevZalo=m;}
  const share=Object.values(out.count).reduce((a,b)=>a+b,0),adminShare=admins.reduce((s,a)=>s+(out.count[a.i]||0),0);
  out.bars={efficiency:Math.round(74+22*drift(t,1)),quality:Math.round(86+12*drift(t,2)),support:Math.round(93+7*drift(t,3)),internal:share?Math.round(adminShare/share*100):0};
  if(!prevT)out.events.length=0;
  prevT=t;return out;
 };
}
