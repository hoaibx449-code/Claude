import {body,HttpError,json,randomId,sha256,timingSafeEqual} from './util.ts';
import type {XEnv} from './worker.ts';
import {origin,zaloApi} from './zalo.ts';
import {googleAccess,googleGet} from './feed-google.ts';

export interface FeedConfig { schedule?:'windows'|'fixed'; times?:string[]; transport?:'google'|'apps-script'; enabled:boolean; sheet:string; gid:string; header:number; image:string; id:string; caption:string; timezone:string; days:number[]; windows:string[]; interval:number; poll:number; initial:'skip'|'send'; }
export const feedDefault:FeedConfig={schedule:'windows',times:['08:00','12:30','19:00'],transport:'google',enabled:false,sheet:'1362B6hviAe69_o5pgfOs_5RFvZi1-peaUxtQ4fwil20',gid:'102',header:1,image:'Link ảnh Google Drive',id:'ID',caption:'Caption đề xuất',timezone:'Asia/Ho_Chi_Minh',days:[0,1,2,3,4,5,6],windows:['08:00-21:00'],interval:15,poll:5,initial:'skip'};
export function cleanFeed(v:any):FeedConfig{
 const sheet=String(v.sheet||'').match(/\/d\/([\w-]+)/)?.[1]||String(v.sheet||'').trim();
 const gid=String(v.gid??'0');
 if(!/^[\w-]{20,100}$/.test(sheet)||!/^\d{1,15}$/.test(gid))throw new HttpError(400,'Link Sheet hoặc gid không hợp lệ.');
 try{new Intl.DateTimeFormat('en',{timeZone:v.timezone}).format();}catch{throw new HttpError(400,'Múi giờ không hợp lệ.');}
 const schedule=v.schedule==='fixed'?'fixed':'windows';
 const times=[...new Set<string>((Array.isArray(v.times)?v.times:[]).map((t:any)=>String(t).trim()))].sort();
 if(schedule==='fixed'&&(!times.length||times.length>48||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))throw new HttpError(400,'Giờ chỉ định cần dạng HH:mm, ví dụ 08:00, 12:30; tối đa 48 mốc/ngày.');
 const inputWindows=Array.isArray(v.windows)?v.windows:[];
 const windows=schedule==='fixed'&&(!inputWindows.length||inputWindows.length>12||inputWindows.some((w:any)=>typeof w!=='string'||!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(w)||w.slice(0,5)===w.slice(6)))?feedDefault.windows:inputWindows;
 if(!windows.length||windows.length>12||windows.some((w:any)=>!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(w)||w.slice(0,5)===w.slice(6)))throw new HttpError(400,'Khung giờ cần dạng 08:00-12:00; hỗ trợ qua nửa đêm.');
 const occupied=new Set<number>();for(const w of schedule==='windows'?windows:[]){const [a,b]=w.split('-').map((t:string)=>+t.slice(0,2)*60+ +t.slice(3));for(let m=a;m!==b;m=(m+1)%1440){if(occupied.has(m))throw new HttpError(400,'Các khung giờ gửi không được trùng nhau.');occupied.add(m);}}
 const n=(x:any,min:number,max:number)=>Math.min(max,Math.max(min,Math.round(Number(x)||min)));
 const col=(x:any)=>String(x||'').trim().slice(0,150);
 return {schedule,times:times.filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)),transport:v.transport==='apps-script'?'apps-script':'google',enabled:!!v.enabled,sheet,gid,header:n(v.header,1,100),image:col(v.image),id:col(v.id),caption:col(v.caption),timezone:String(v.timezone),days:[...new Set<number>((v.days||[]).filter((d:any)=>Number.isInteger(d)&&d>=0&&d<=6))],windows,interval:n(v.interval,1,1440),poll:n(v.poll,1,1440),initial:v.initial==='send'?'send':'skip'};
}
export function csvRows(text:string){
 const rows:string[][]=[];let row:string[]=[],s='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(s);s='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r'||quoted)s+=c;}
 if(quoted)throw new HttpError(400,'CSV chưa đóng dấu ngoặc kép.');if(s||row.length){row.push(s);rows.push(row);}return rows;
}
export function column(headers:string[],mapping:string){
 if(!mapping)return -1;
 if(/^#[A-Za-z]+$/.test(mapping))return [...mapping.slice(1).toUpperCase()].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1;
 const keys=mapping.split('|').map(x=>x.trim().normalize('NFC').toLowerCase());
 const matches=headers.map((h,i)=>keys.includes(h.trim().normalize('NFC').toLowerCase())?i:-1).filter(i=>i>=0);
 if(matches.length!==1)throw new HttpError(400,'Không tìm thấy cột duy nhất: '+mapping+'. Chọn lại cột từ bản xem trước.');return matches[0];
}
export function driveImage(raw:string){
 let u:URL;try{u=new URL(raw.trim());}catch{throw new HttpError(400,'Link ảnh không hợp lệ.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname!=='drive.google.com')throw new HttpError(400,'Nguồn ảnh hiện hỗ trợ link HTTPS Google Drive.');
 const id=u.pathname.match(/\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');
 if(!id||!/^[\w-]{10,150}$/.test(id))throw new HttpError(400,'Không xác định được mã ảnh Drive.');return id;
}
export function sendSlot(c:FeedConfig,now:number){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:c.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=Date.UTC(+parts.year,+parts.month-1,+parts.day),minute=+parts.hour*60+ +parts.minute,dow=new Date(day).getUTCDay();
 if(c.schedule==='fixed'){
  // A scheduled start opens a bounded 10-minute delivery round, so cron jitter and fan-out do not drop recipients.
  const candidates:{start:number;key:string}[]=[];
  for(const previous of [false,true])for(const time of c.times||[]){
   const start=+time.slice(0,2)*60+ +time.slice(3)-(previous?1440:0),wd=previous?(dow+6)%7:dow;
   if(c.days.includes(wd)&&minute>=start&&minute<start+10)candidates.push({start,key:`${day-(previous?86400000:0)}:at:${time}`});
  }
  return candidates.sort((a,b)=>b.start-a.start)[0]?.key||'';
 }
 for(const w of c.windows){const [a,b]=w.split('-').map(t=>+t.slice(0,2)*60+ +t.slice(3)),overnight=a>b;
  if((overnight?(minute>=a||minute<b):(minute>=a&&minute<b))){const previous=overnight&&minute<b,wd=previous?(dow+6)%7:dow;if(!c.days.includes(wd))continue;
   const elapsed=previous?minute+1440-a:minute-a;return `${day-(previous?86400000:0)}:${w}:${Math.floor(elapsed/c.interval)}`;
  }
 }return '';
}
export async function feedConfig(env:XEnv){const r=await env.DB.prepare("SELECT config FROM image_feed WHERE id=1").first<any>();return r?JSON.parse(r.config) as FeedConfig:feedDefault;}
async function sheetRows(env:XEnv,c:FeedConfig){
 if(c.transport==='apps-script'){const snapshot=await env.DB.prepare('SELECT source,headers,rows,header_row FROM feed_bridge_snapshot WHERE id=1').first<any>();if(!snapshot||snapshot.source!==c.sheet+'|'+c.gid||snapshot.header_row!==c.header)throw new HttpError(409,'Chưa có dữ liệu Apps Script. Hãy cài mã và chạy dongBoAnh.');return {headers:JSON.parse(snapshot.headers),rows:JSON.parse(snapshot.rows)};}

 if(await googleAccess(env)){
  const meta:any=await (await googleGet(env,`https://sheets.googleapis.com/v4/spreadsheets/${c.sheet}?fields=sheets(properties(sheetId,title,gridProperties))`)).json();
  const tab=meta.sheets?.find((s:any)=>String(s.properties?.sheetId)===c.gid)?.properties;
  if(!tab)throw new HttpError(400,'Không tìm thấy gid trong Sheet. Hãy kiểm tra mã tab.');
  const count=Math.min(tab.gridProperties?.columnCount||26,200);let letters='',n=count;while(n){letters=String.fromCharCode(65+(n-1)%26)+letters;n=Math.floor((n-1)/26);}
  const range="'"+String(tab.title).replace(/'/g,"''")+"'!A1:"+letters+Math.min(tab.gridProperties?.rowCount||10000,10000);
  const r=await googleGet(env,`https://sheets.googleapis.com/v4/spreadsheets/${c.sheet}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
  const data=JSON.parse(new TextDecoder().decode(await bounded(r,2_000_000)));
  const rows:string[][]=(data.values||[]).map((row:any[])=>row.map(v=>String(v??'')));
  return {headers:rows[c.header-1]||[],rows:rows.slice(c.header)};
 }
 const r=await fetch(`https://docs.google.com/spreadsheets/d/${c.sheet}/export?format=csv&gid=${c.gid}`,{signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new HttpError(400,`Google Sheet chưa đọc được (HTTP ${r.status}). Kiểm tra quyền xem bằng liên kết.`);
 const text=await bounded(r,2_000_000);if(/text\/html/i.test(r.headers.get('content-type')||''))throw new HttpError(400,'Google trả về trang đăng nhập, chưa phải dữ liệu Sheet.');
 const rows=csvRows(new TextDecoder().decode(text));if(rows.length>10001)throw new HttpError(400,'Nguồn tối đa 10.000 dòng.');
 return {headers:rows[c.header-1]||[],rows:rows.slice(c.header)};
}
export async function bounded(r:Response,max:number){const reader=r.body?.getReader();if(!reader)throw new HttpError(400,'Tệp rỗng.');const chunks:Uint8Array[]=[];let n=0;try{while(true){const v=await reader.read();if(v.done)break;n+=v.value.length;if(n>max)throw new HttpError(400,'Tệp vượt giới hạn tải.');chunks.push(v.value);}}finally{await reader.cancel().catch(()=>{});}const out=new Uint8Array(n);let p=0;for(const a of chunks){out.set(a,p);p+=a.length;}return out;}
export async function scanFeed(env:XEnv,c:FeedConfig){
 return ingestFeedRows(env,c,await sheetRows(env,c));
}
export async function ingestFeedRows(env:XEnv,c:FeedConfig,{headers,rows}:{headers:string[];rows:string[][]}){
 const img=column(headers,c.image),id=column(headers,c.id),caption=column(headers,c.caption);
 if(img<0)throw new HttpError(400,'Chọn cột chứa link ảnh trước.');
 const state=await env.DB.prepare('SELECT initialized FROM image_feed WHERE id=1').first<any>();
 const known=new Set((await env.DB.prepare('SELECT id FROM image_feed_items').all<any>()).results.map(r=>r.id));
 let added=0,invalid=0;const now=Date.now();let statements:D1PreparedStatement[]=[];
 const flush=async()=>{if(!statements.length)return;const results=await env.DB.batch(statements);added+=results.reduce((n,r)=>n+Number(r.meta.changes||0),0);statements=[];};
 for(const row of rows){if(!row[img]?.trim())continue;let file:string;try{file=driveImage(row[img]);}catch{invalid++;continue;}
  // Stable across row moves, header renames, captions and Drive sharing-URL variants.
  const key=await sha256(c.sheet+'|'+c.gid+'|'+file);
  if(known.has(key))continue;known.add(key);
  const skip=!state?.initialized&&c.initial==='skip';
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO image_feed_items(id,file_id,caption,created_at,baseline,source,external_id) VALUES(?,?,?,?,?,?,?)').bind(key,file,(row[caption]||'').slice(0,1800),now,skip?1:0,c.sheet+'|'+c.gid,(row[id]||'').slice(0,150)));if(statements.length>=100)await flush();
 }
 await flush();
 await env.DB.prepare("UPDATE image_feed SET initialized=1,last_poll=?,error=?,updated_at=? WHERE id=1").bind(now,invalid?`${invalid} dòng có link ảnh không hợp lệ.`:'',now).run();
 return {added,invalid,rows:rows.length};
}
async function cacheImage(env:XEnv,item:any,c:FeedConfig){
 const key='feed/'+item.id,now=Date.now();if(item.expires>now+60000&&await env.BUCKET.head(key))return;
 if(c.transport==='apps-script')throw new HttpError(409,'Chờ Apps Script chuyển ảnh gốc lên.');
 let url=`https://drive.usercontent.google.com/download?id=${encodeURIComponent(item.file_id)}&export=download`;
 let data:Uint8Array|undefined;
 if(await googleAccess(env))data=await bounded(await googleGet(env,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.file_id)}?alt=media`),8*1024*1024);
 for(let i=0;!data&&i<5;i++){
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||!(['drive.google.com','drive.usercontent.google.com'].includes(u.hostname)||u.hostname.endsWith('.googleusercontent.com')))throw new Error('Drive chuyển hướng không hợp lệ.');
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location')||'',url).href;await r.body?.cancel();continue;}
  if(!r.ok)throw new Error('Ảnh Drive chưa đọc được: HTTP '+r.status);data=await bounded(r,8*1024*1024);break;
 }
 if(!data)throw new Error('Drive chuyển hướng quá nhiều.');
 await storeFeedImage(env,item,data);
}
export async function storeFeedImage(env:XEnv,item:any,data:Uint8Array){
 const key='feed/'+item.id,now=Date.now();
 const mime=data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71?'image/png':data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP'?'image/webp':'';
 if(!mime)throw new HttpError(400,'Tệp chưa phải ảnh PNG/JPEG/WebP hợp lệ. Kiểm tra định dạng và quyền đọc ảnh.');
 item.token=randomId(32);item.expires=now+86400000;
 await env.BUCKET.put(key,data,{httpMetadata:{contentType:mime}});
 await env.DB.prepare('UPDATE image_feed_items SET token=?,expires=? WHERE id=?').bind(item.token,item.expires,item.id).run();
}
export async function feedPhoto(env:XEnv,id:string,token:string){
 const item=await env.DB.prepare('SELECT token,expires FROM image_feed_items WHERE id=?').bind(id).first<any>();
 if(!item||item.expires<Date.now()||!token||!timingSafeEqual(item.token||'',token))throw new HttpError(404,'Ảnh đã hết hạn.');
 const object=await env.BUCKET.get('feed/'+id);if(!object)throw new HttpError(404,'Ảnh chưa sẵn sàng.');
 return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/jpeg','cache-control':'private, max-age=300','x-content-type-options':'nosniff'}});
}
export async function feedSubscription(env:XEnv,chat:string,name:string,on:boolean){
 await env.DB.prepare('INSERT INTO image_feed_subscribers(chat_id,name,active,joined_at) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET active=excluded.active,name=excluded.name').bind(chat,name.slice(0,100),on?1:0,Date.now()).run();
 return on?'Đã đăng ký nhận ảnh mới theo lịch của quản trị. Chỉ nhận ảnh phát sinh sau lần đăng ký đầu tiên. Gõ HỦY NHẬN ẢNH để dừng.':'Đã hủy nhận ảnh tự động. Gõ NHẬN ẢNH nếu muốn đăng ký lại.';
}
export async function tickFeed(env:XEnv){
 const now=Date.now();
 const c=await feedConfig(env);
 // One lease for overlapping cron invocations, including temporary-object cleanup.
 const lease=randomId(16);const lock=await env.DB.prepare('UPDATE image_feed SET lease=?,lease_until=? WHERE id=1 AND lease_until<? RETURNING *').bind(lease,now+240000,now).first<any>();if(!lock)return;
 try{
 // Temporary binaries expire even when sending is switched off.
 const expired=await env.DB.prepare('SELECT id FROM image_feed_items WHERE expires>0 AND expires<? LIMIT 20').bind(now).all<any>();
 for(const i of expired.results){await env.BUCKET.delete('feed/'+i.id);await env.DB.prepare('UPDATE image_feed_items SET expires=0,token=NULL WHERE id=? AND expires<?').bind(i.id,now).run();}
 if(!c.enabled||!env.config.zalo.enabled||!(env as any).ZALO_BOT_TOKEN)return;
  if(c.transport!=='apps-script'&&now-lock.last_poll>=c.poll*60000)await scanFeed(env,c);
  const slot=sendSlot(c,now);if(slot){
   // Ten API calls per tick; unserved recipients continue next minute in this same slot.
   const deliveries=await env.DB.prepare(`SELECT * FROM (SELECT i.*,s.chat_id,ROW_NUMBER() OVER(PARTITION BY s.chat_id ORDER BY i.created_at,i.id) AS rn FROM image_feed_items i CROSS JOIN image_feed_subscribers s
    LEFT JOIN image_feed_deliveries d ON d.item_id=i.id AND d.chat_id=s.chat_id
    WHERE i.source=? AND (?=0 OR i.expires>?) AND i.baseline=0 AND s.active=1 AND i.created_at>s.joined_at AND COALESCE(d.status,'') NOT IN ('sent','unknown') AND COALESCE(d.attempts,0)<5
    AND NOT EXISTS(SELECT 1 FROM zalo_links l JOIN blocked_users b ON b.user_id=l.user_id WHERE l.chat_id=s.chat_id)
    AND NOT EXISTS(SELECT 1 FROM image_feed_deliveries x WHERE x.chat_id=s.chat_id AND x.slot=? AND x.status IN ('sent','unknown','sending'))
    ) WHERE rn=1 ORDER BY created_at,id LIMIT 10`).bind(c.sheet+'|'+c.gid,c.transport==='apps-script'?1:0,now+60000,slot).all<any>();
   const used=new Set<string>();for(const item of deliveries.results){if(Date.now()-now>45000)break;if(used.has(item.chat_id))continue;used.add(item.chat_id);
    // Persist intent before network I/O. Unknown outcomes require explicit admin retry (no blind duplicate).
    await env.DB.prepare("INSERT INTO image_feed_deliveries(item_id,chat_id,status,attempts,slot,updated_at) VALUES(?,?,'sending',1,?,?) ON CONFLICT(item_id,chat_id) DO UPDATE SET status='sending',attempts=attempts+1,slot=excluded.slot,updated_at=excluded.updated_at").bind(item.id,item.chat_id,slot,now).run();
    let status='failed',error='',message='';try{
     // Recheck opt-out immediately before sending.
     const active=await env.DB.prepare('SELECT active FROM image_feed_subscribers WHERE chat_id=?').bind(item.chat_id).first<any>();if(!active?.active)throw new Error('Đã hủy đăng ký.');
     await cacheImage(env,item,c);const site=origin(env)||lock.origin;if(!site?.startsWith('https://'))throw new Error('Chưa có địa chỉ web HTTPS để gửi ảnh.');
     const r=await zaloApi((env as any).ZALO_BOT_TOKEN,'sendPhoto',{chat_id:item.chat_id,photo:`${site}/api/image-feed/photo/${item.id}?t=${item.token}`,caption:item.caption||undefined});
     status=r.ok?'sent':r.status===0?'unknown':'failed';error=r.error;message=String(r.result?.message_id||'');
    }catch(e:any){error=e.message;}
    await env.DB.prepare('UPDATE image_feed_deliveries SET status=?,error=?,message_id=?,updated_at=? WHERE item_id=? AND chat_id=?').bind(status,error.slice(0,300),message,Date.now(),item.id,item.chat_id).run();
   }
  }
  // A process killed after send may have delivered: never automatically resend it.
  await env.DB.prepare("UPDATE image_feed_deliveries SET status='unknown',error='Tác vụ bị ngắt; cần kiểm tra Zalo trước khi thử lại.' WHERE status='sending' AND updated_at<?").bind(now-300000).run();
 }catch(e:any){await env.DB.prepare('UPDATE image_feed SET error=? WHERE id=1').bind(String(e.message).slice(0,300)).run();}
 finally{await env.DB.prepare("UPDATE image_feed SET lease='',lease_until=0 WHERE id=1 AND lease=?").bind(lease).run();}
}
export async function feedAdmin(req:Request,env:XEnv,sub:string){
 if(!sub.startsWith('image-feed'))return null;
 if(sub==='image-feed'&&req.method==='GET'){
  const state=await env.DB.prepare('SELECT last_poll,error,initialized FROM image_feed WHERE id=1').first<any>();
  const subscribers=await env.DB.prepare('SELECT chat_id,name,active,joined_at FROM image_feed_subscribers ORDER BY joined_at DESC LIMIT 100').all<any>();
  const deliveries=await env.DB.prepare('SELECT d.*,i.caption,s.name FROM image_feed_deliveries d JOIN image_feed_items i ON i.id=d.item_id LEFT JOIN image_feed_subscribers s ON s.chat_id=d.chat_id ORDER BY d.updated_at DESC LIMIT 50').all<any>();
  return json({config:await feedConfig(env),state,subscribers:subscribers.results,deliveries:deliveries.results});
 }
 if(sub==='image-feed'&&req.method==='PUT'){
  const c=cleanFeed(await body<any>(req,12000));if(c.enabled&&!c.image)throw new HttpError(400,'Chọn cột link ảnh trước khi bật.');
  const old=await feedConfig(env),changed=old.sheet!==c.sheet||old.gid!==c.gid;
  await env.DB.prepare("INSERT INTO image_feed(id,config,origin) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,origin=excluded.origin,initialized=CASE WHEN ? THEN 0 ELSE initialized END,last_poll=0,error='' ").bind(JSON.stringify(c),new URL(req.url).origin,changed?1:0).run();return json({config:c});
 }
 if(sub==='image-feed/preview'&&req.method==='POST'){
  const c=cleanFeed(await body<any>(req,12000)),s=await sheetRows(env,c);return json({headers:s.headers,rows:s.rows.slice(0,5),total:s.rows.length});
 }
 if(sub==='image-feed/scan'&&req.method==='POST')return json(await scanFeed(env,await feedConfig(env)));
 if(sub==='image-feed/subscriber'&&req.method==='POST'){
  const b=await body<any>(req,1000);await env.DB.prepare('UPDATE image_feed_subscribers SET active=0 WHERE chat_id=?').bind(String(b.chat_id)).run();return json({ok:true});
 }
 if(sub==='image-feed/retry'&&req.method==='POST'){
  const b=await body<any>(req,1000);await env.DB.prepare("UPDATE image_feed_deliveries SET status='failed',attempts=0,error='' WHERE item_id=? AND chat_id=? AND status IN ('unknown','failed')").bind(String(b.item_id),String(b.chat_id)).run();return json({ok:true});
 }
 throw new HttpError(404,'Không tìm thấy thao tác nguồn ảnh.');
}
