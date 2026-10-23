// Faciup Live, continuous operation (a show mode set in Quản trị → Nhóm AI): the office plays out a
// working day with no AI and nothing written anywhere. Everything is worked out from the clock and a
// seeded random stream per day, so every viewer sees the same sessions, hand-overs and Zalo chats at
// the same moment, and a day never repeats the same order or timings.
const DAY=864e5,VN=7*3600e3;
// timings in seconds as [least, spread]. The three levels share one pace and differ in how many sessions
// run side by side (8, 16, 24); the Zalo desk and the admin room scale with them, Zalo always the busiest
const PACE={rounds:3,review:[15,40],intake:[2,2],member:[4,5],synth:[3,2],gap:[1,3],task:[9,14],rest:[4,10],chat:[8,10],proc:[2.5,4.5]};
const STREAMS={normal:8,high:16,max:24};
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const pick=(r,list)=>list[Math.floor(r()*list.length)];
// slow drifting value in [0,1] for the wall-board bars
const drift=(t,k)=>.5+.32*Math.sin(t/(613e3+k*97e3)+k)+.18*Math.sin(t/(171e3+k*31e3)+k*2.3);

// the default Zalo script: what a new visitor usually asks, answered as a short guide (set your own in
// Quản trị → Nhóm AI → Phòng & luồng)
export const GUIDE=[
 ['Mình mới vào, dùng thử thế nào?','Bạn bấm Tạo video ngay trên trang chủ là thử được liền, không cần đăng nhập. Nhập một chủ đề, hệ thống gợi ý kịch bản cho bạn.'],
 ['Có cần đăng nhập không?','Dùng thử thì không cần. Đăng nhập bằng Google hoặc email để lưu video, tải bản đẹp và theo dõi đội AI làm việc cho riêng bạn.'],
 ['Đăng nhập ở đâu vậy?','Bạn bấm Đăng nhập ở góc trên bên phải, chọn Google hoặc nhận mã qua email, chỉ khoảng 10 giây.'],
 ['Làm sao kết nối Zalo với tài khoản?','Sau khi đăng nhập, vào mục Zalo và bấm Liên kết. Hệ thống gửi mã, bạn nhắn mã đó cho Zalo Bot là xong.'],
 ['Liên kết Zalo để làm gì?','Bạn nhắn yêu cầu qua Zalo là đội AI nhận việc, video xong sẽ báo về Zalo. Trên Faciup Live bạn còn xem được hội thoại của mình.'],
 ['Faciup Live là gì vậy?','Là văn phòng trực tuyến của đội AI. Bạn xem từng agent nhận việc, bàn giao hồ sơ và hoàn thành theo thời gian thực.'],
 ['Mình có xem được video của mình đang làm không?','Có ạ. Đăng nhập rồi mở Faciup Live, video của bạn hiện thẻ "Của bạn" ở bàn đang xử lý và bay về FACIUP khi xong.'],
 ['Tạo video đầu tiên mất bao lâu?','Chỉ vài phút: chọn mẫu, nhập chủ đề, bấm Tạo. Video 1 phút thường dựng xong trong vài phút.'],
 ['Có mẫu nào để bắt đầu nhanh không?','Bạn xem mục Gợi ý sáng tạo hoặc Khám phá, chọn một mẫu rồi bấm Dùng mẫu này là có ngay kịch bản.'],
 ['Video có lồng tiếng không?','Có, bạn chọn giọng nam hoặc nữ, Bắc hoặc Nam ở bước Lồng tiếng, phụ đề tạo tự động theo lời đọc.'],
 ['Mình muốn tải video về','Video xong bạn vào Video của tôi, bấm Tải về. Khung 9:16 hợp TikTok, Reels, Shorts.'],
 ['Gói miễn phí được gì?','Bạn dùng thử miễn phí ngay, số lượt còn lại hiện ở mục Tài khoản. Cần nhiều hơn thì xem mục Gói cước.'],
 ['Thanh toán thế nào?','Chọn gói ở Gói cước, quét mã VietQR bằng app ngân hàng. Gói kích hoạt tự động sau vài giây.'],
 ['Mình cần hỗ trợ trực tiếp','Bạn nhắn ngay tại Zalo này, đội hỗ trợ trực 24/7. Cứ mô tả việc cần làm, mình chuyển cho đúng người.'],
 ['Đội AI gồm những ai?','Có FACIUP điều phối, Chiến lược, Nghiên cứu, Săn tin, Biên kịch, Thiết kế, Phản biện, cùng Nhân sự, Kế toán và Zalo Bot.'],
 ['Mình gửi ý tưởng qua Zalo được không?','Được ạ, bạn nhắn chủ đề hoặc gửi ảnh sản phẩm, đội AI sẽ lên kịch bản và báo lại khi có bản nháp.'],
 ['Làm sao xem lại các video đã tạo?','Bạn vào Video của tôi sau khi đăng nhập, mọi video và bản nháp được lưu ở đó.'],
 ['Có dùng trên điện thoại được không?','Được ạ, bạn mở web trên điện thoại hoặc thêm vào màn hình chính để dùng như ứng dụng.'],
 ['Video có được dùng thương mại không?','Video bạn tạo bằng gói trả phí được dùng cho kênh và quảng cáo của bạn, không có logo.'],
 ['Mình muốn video theo phong cách vẽ tay','Bạn chọn phong cách Vẽ tay khi tạo video, nét vẽ hiện dần như đang vẽ trên bảng.'],
];
const ADMIN={
 hr:['Cập nhật lịch trực','Tổng hợp chấm công','Rà soát quy trình','Đánh giá hiệu suất tuần','Hướng dẫn trợ lý mới','Sắp xếp ca hỗ trợ'],
 accounting:['Đối soát chi phí AI','Kiểm tra đơn hàng','Lập báo cáo doanh thu','Đối chiếu VietQR','Cập nhật sổ quỹ','Xuất hóa đơn'],
};

export function createSim(){
 let cache=null,prevT=0,prevTurn=[],prevDone=-1,prevAdmin={},prevZalo=-1;
 // the day's plan for these members: sessions, admin tasks per desk, Zalo chats
 function plan(day,members,admins,level,script){
  const key=[day,members.join(','),admins.map(a=>a.i).join(','),level,hash(JSON.stringify(script))].join('|');
  if(cache?.key===key)return cache;
  const X=PACE,N=STREAMS[level]||STREAMS.high,start=day*DAY-VN,end=start+DAY,sec=(r,[a,b])=>(a+r()*b)*1e3;
  const streams=[];for(let q=0;q<N;q++){const r=rng(hash(key+'s'+q)),sessions=[];let t=start+r()*30e3+q*X.member[0]*1e3*1.7;
   while(t<end){const order=members.filter(()=>r()<.85).sort(()=>r()-.5),team=order.length>=2?order:members.slice(0,2),rounds=1+Math.floor(r()*X.rounds),turns=[{who:0,kind:'intake',dur:sec(r,X.intake)}];
    for(let k=0;k<rounds;k++)for(const m of team)turns.push({who:m,kind:'member',dur:sec(r,X.member)});
    turns.push({who:0,kind:'synth',dur:sec(r,X.synth)});
    let at=t;for(const x of turns){x.at=at;at+=x.dur;}
    sessions.push({start:t,end:at,turns,team:[0,...new Set(team)],review:sec(r,X.review)});t=at+sec(r,X.gap);}
   streams.push(sessions);}
  // each admin desk works through a few queues at once (its share grows with the level)
  const tasks={};for(const a of admins){const list=[];for(let q=0;q<Math.ceil(N/4);q++){const r=rng(hash(key+'a'+a.i+'/'+q));let t=start+r()*90e3;
   while(t<end){const dur=sec(r,X.task);list.push({at:t,end:t+dur,text:pick(r,ADMIN[a.role]||ADMIN.hr)});t+=dur+sec(r,X.rest);}}
   list.sort((x,y)=>x.end-y.end);tasks[a.i]=list;}
  // Zalo talks to several customers at once and answers the most
  const chats=[];for(let q=0;q<Math.ceil(N*.5);q++){const r=rng(hash(key+'z'+q));let t=start+r()*40e3;const recent=[];
   while(t<end){let n;do n=Math.floor(r()*script.length);while(script.length>9&&recent.includes(n));recent.push(n);if(recent.length>8)recent.shift();
    const proc=sec(r,X.proc);chats.push({at:t,reply:t+proc,q:script[n][0],a:script[n][1],pass:r()<.3});t+=proc+sec(r,X.chat);}}
  chats.sort((x,y)=>x.at-y.at);
  return cache={key,streams,tasks,chats};
 }
 const upto=(list,t,f)=>{let lo=0,hi=list.length;while(lo<hi){const m=lo+hi>>1;if(f(list[m])<=t)lo=m+1;else hi=m;}return lo;};
 /** the office at time t; `events` are what happened since the last call (for hand-overs and sounds) */
 return function at(t,agents,level,{mainBusy=false,script=null}={}){
  const day=Math.floor((t+VN)/DAY),lead=0;
  const members=[],admins=[];let zalo=-1;
  agents.forEach((a,i)=>{if(i===lead)return;if(a.icon==='zalo'){zalo=i;return;}if(a.room==='admin')admins.push({i,role:a.icon==='chart'?'accounting':'hr'});else members.push(i);});
  const P=plan(day,members,admins,level,Array.isArray(script)&&script.length?script:GUIDE),out={desk:{},count:{},events:[],done:0,pending:0,working:0,progress:0,chat:[],zaloBusy:false};
  const add=(i,n)=>{out.count[i]=(out.count[i]||0)+n;};
  // sessions: a finished one counts once for everyone who took part; open ones decide who works, watches and waits
  let leadWork=null,leadWatch=false;
  P.streams.forEach((sessions,q)=>{
   const n=upto(sessions,t,s=>s.start),cur=n>0?sessions[n-1]:null;
   for(let j=0;j<n;j++){const s=sessions[j];if(s.end<=t){if(t-s.end<s.review)out.pending++;else{out.done++;for(const w of s.team)add(w,1);}}}
   let turnKey='';
   if(cur&&cur.end>t&&!mainBusy){
    const k=cur.turns.findIndex(x=>t<x.at+x.dur),x=cur.turns[k];turnKey=cur.start+':'+k;
    if(q===0)out.progress=Math.round(k/cur.turns.length*100);
    if(x.kind==='member'){leadWatch=true;if(out.desk[x.who]?.look!=='work')out.desk[x.who]={look:'work'};}else leadWork=x.kind==='intake'?'Nhận việc':'Tổng hợp kết quả';
    for(const y of cur.turns.slice(k+1))if(y.who!==lead&&!out.desk[y.who])out.desk[y.who]={look:'wait'};
    out.working++;
    const pk=prevTurn[q];if(pk&&turnKey!==pk){const [ps,pi]=pk.split(':').map(Number),prev=sessions.find(s=>s.start===ps)?.turns[pi];
     if(prev&&prev.who!==x.who)out.events.push({type:'hand',from:prev.who,to:x.who,toLead:x.who===lead});}
   }
   if(!mainBusy)prevTurn[q]=turnKey;});
  if(leadWork)out.desk[lead]={look:'work',task:leadWork};else if(leadWatch)out.desk[lead]={look:'watch',task:'Giám sát phiên'};
  out.working=Object.values(out.desk).filter(d=>d.look==='work').length;
  if(prevDone>=0&&out.done+out.pending>prevDone)out.events.push({type:'done'});
  prevDone=out.done+out.pending;
  // the admin room: internal jobs, each reported to the lead when done
  for(const a of admins){const list=P.tasks[a.i]||[],finished=upto(list,t,x=>x.end),open=list.find(x=>x.at<=t&&x.end>t);add(a.i,finished);
   if(open){out.desk[a.i]={look:'work',task:open.text};out.working++;}
   if(prevAdmin[a.i]!==undefined&&finished>prevAdmin[a.i])out.events.push({type:'hand',from:a.i,to:lead,toLead:true});
   prevAdmin[a.i]=finished;}
  // Zalo: customers write, the bot answers a few seconds later
  if(zalo>=0){const m=upto(P.chats,t,c=>c.at),from=upto(P.chats,prevT-15e3,c=>c.at);let replies=0;
   for(let q=Math.max(0,m-40);q<m;q++)if(P.chats[q].reply>t)replies--;replies+=m;add(zalo,replies);
   if(P.chats.slice(Math.max(0,m-12),m).some(c=>c.reply>t)){out.desk[zalo]={look:'work'};out.zaloBusy=true;out.working++;}
   for(const c of P.chats.slice(Math.max(0,m-4),m)){out.chat.push({role:'user',text:c.q,at:c.at});if(c.reply<=t)out.chat.push({role:'bot',text:c.a,at:c.reply});}
   if(prevZalo>=0)for(const c of P.chats.slice(from,m)){if(c.at>prevT)out.events.push({type:'zalo',role:'user',text:c.q,reply:c.a});if(c.reply>prevT&&c.reply<=t){out.events.push({type:'zalo',role:'bot',text:c.a});if(c.pass)out.events.push({type:'hand',from:zalo,to:lead,toLead:true});}}
   prevZalo=m;}
  const share=Object.values(out.count).reduce((a,b)=>a+b,0),adminShare=admins.reduce((s,a)=>s+(out.count[a.i]||0),0);
  out.bars={efficiency:Math.round(74+22*drift(t,1)),quality:Math.round(86+12*drift(t,2)),support:Math.round(93+7*drift(t,3)),internal:share?Math.round(adminShare/share*100):0};
  if(!prevT)out.events.length=0;
  prevT=t;return out;
 };
}
