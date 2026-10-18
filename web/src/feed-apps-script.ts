import {body,HttpError,json,randomId,sha256,timingSafeEqual,useQuota} from './util.ts';
import type {XEnv} from './worker.ts';
import {bounded,feedConfig,ingestFeedRows,storeFeedImage,type FeedConfig} from './image-feed.ts';
import {runFeedTests} from './feed-test.ts';

export const bridgeRevision=async(c:FeedConfig)=>sha256(JSON.stringify([c.sheet,c.gid,c.header,c.image,c.id,c.caption,c.initial]));
async function tasks(env:XEnv,c:FeedConfig){
 const tests=(await env.DB.prepare("SELECT DISTINCT i.id,i.file_id FROM feed_image_tests t JOIN image_feed_items i ON i.id=t.item_id WHERE t.status='pending' AND t.expires>? AND i.source=? AND i.expires<? LIMIT 3").bind(Date.now(),c.sheet+'|'+c.gid,Date.now()+60000).all<any>()).results;
 const regular=(await env.DB.prepare(`SELECT i.id,i.file_id FROM image_feed_items i LEFT JOIN feed_bridge_failures f ON f.item_id=i.id WHERE i.source=? AND i.baseline=0 AND i.expires<? AND COALESCE(f.next_at,0)<?
 AND EXISTS(SELECT 1 FROM image_feed_subscribers s LEFT JOIN image_feed_deliveries d ON d.item_id=i.id AND d.chat_id=s.chat_id
 WHERE s.active=1 AND s.joined_at<i.created_at AND COALESCE(d.status,'') NOT IN ('sent','unknown') AND COALESCE(d.attempts,0)<5)
 ORDER BY i.created_at,i.id LIMIT 3`).bind(c.sheet+'|'+c.gid,Date.now()+3600000,Date.now()).all<any>()).results;
 return [...tests,...regular].filter((i,n,all)=>all.findIndex(x=>x.id===i.id)===n).slice(0,3);
}
export async function bridgeAdmin(req:Request,env:XEnv,sub:string){
 if(!sub.startsWith('image-feed/apps-script'))return null;
 if(req.method==='GET'&&sub==='image-feed/apps-script'){
  const key=await env.DB.prepare("SELECT 1 AS configured FROM settings WHERE key='feed-bridge:key'").first();
  const s=await env.DB.prepare('SELECT received_at,error FROM feed_bridge_snapshot WHERE id=1').first<any>();return json({configured:!!key,receivedAt:s?.received_at||0,error:s?.error||''});
 }
 if(req.method==='POST'&&sub==='image-feed/apps-script/setup'){
  const key=randomId(32);await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('feed-bridge:key',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(await sha256(key),Date.now()).run();
  return json({script:appsScript(new URL(req.url).origin,key)});
 }
 if(req.method==='POST'&&sub==='image-feed/apps-script/disconnect'){
  await env.DB.prepare("DELETE FROM settings WHERE key='feed-bridge:key'").run();return json({ok:true});
 }
 throw new HttpError(404,'Không tìm thấy thao tác Apps Script.');
}
export async function bridgeReceive(req:Request,env:XEnv,path:string){
 const key=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]||'';
 const saved=await env.DB.prepare("SELECT value FROM settings WHERE key='feed-bridge:key'").first<any>();
 if(!key||!saved||!timingSafeEqual(await sha256(key),saved.value))throw new HttpError(401,'Khóa Apps Script không hợp lệ hoặc đã bị thu hồi.');
 await useQuota(env,'feed-bridge','bridge',2000);
 const c=await feedConfig(env);if(c.transport!=='apps-script')return json({active:false});
 const source=c.sheet+'|'+c.gid,revision=await bridgeRevision(c);
 if(path==='config'&&req.method==='POST'){
  const b=await body<any>(req,1000),state=await env.DB.prepare('SELECT received_at,revision FROM feed_bridge_snapshot WHERE id=1').first<any>();
  return json({active:true,config:c,revision,due:b.force===true||!state||state.revision!==revision||Date.now()-state.received_at>=c.poll*60000,images:await tasks(env,c)});
 }
 if(path==='rows'&&req.method==='POST'){
  const b=await body<any>(req,2_000_000);
  if(b.revision!==revision)throw new HttpError(409,'Cấu hình nguồn vừa thay đổi; đồng bộ lại.');
  if(!Array.isArray(b.headers)||b.headers.length>200||!Array.isArray(b.rows)||b.rows.length>10000||b.rows.some((r:any)=>!Array.isArray(r)||r.length>200))throw new HttpError(400,'Dữ liệu tối đa 10.000 dòng và 200 cột.');
  const headers=b.headers.map((v:any)=>String(v??'').slice(0,300)),rows=b.rows.map((r:any[])=>r.map(v=>String(v??'').slice(0,16000)));
  let result;try{result=await ingestFeedRows(env,c,{headers,rows});}catch(e){if(!(e instanceof HttpError)||e.status!==400)throw e;
   await env.DB.prepare('INSERT INTO feed_bridge_snapshot(id,source,revision,headers,rows,received_at,error,header_row) VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,revision=excluded.revision,headers=excluded.headers,rows=excluded.rows,received_at=excluded.received_at,error=excluded.error,header_row=excluded.header_row').bind(source,revision,JSON.stringify(headers),JSON.stringify(rows),Date.now(),e.message,c.header).run();
   await env.DB.prepare('UPDATE image_feed SET error=? WHERE id=1').bind(e.message).run();return json({warning:e.message,images:[]});
  }
  // Recheck the source after ingestion so an old snapshot cannot replace a newer configuration.
  if(await bridgeRevision(await feedConfig(env))!==revision)throw new HttpError(409,'Cấu hình nguồn vừa thay đổi; đồng bộ lại.');
  await env.DB.prepare("INSERT INTO feed_bridge_snapshot(id,source,revision,headers,rows,received_at,error,header_row) VALUES(1,?,?,?,?,?,'',?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,revision=excluded.revision,headers=excluded.headers,rows=excluded.rows,received_at=excluded.received_at,error='',header_row=excluded.header_row").bind(source,revision,JSON.stringify(headers),JSON.stringify(rows),Date.now(),c.header).run();
  return json({...result,images:await tasks(env,c)});
 }
 const image=path.match(/^image\/([a-f0-9]{64})$/);
 if(image&&req.method==='POST'){
  const item=await env.DB.prepare("SELECT * FROM image_feed_items WHERE id=? AND source=? AND (baseline=0 OR EXISTS(SELECT 1 FROM feed_image_tests t WHERE t.item_id=image_feed_items.id AND t.status='pending' AND t.expires>?))").bind(image[1],source,Date.now()).first<any>();if(!item)throw new HttpError(404,'Ảnh không thuộc nguồn đang chọn.');
  if(Number(req.headers.get('content-length'))>8*1024*1024)throw new HttpError(413,'Ảnh tối đa 8 MB.');
  await storeFeedImage(env,item,await bounded(new Response(req.body),8*1024*1024));await env.DB.prepare('DELETE FROM feed_bridge_failures WHERE item_id=?').bind(item.id).run();await runFeedTests(env);return json({ok:true});
 }
 if(path==='error'&&req.method==='POST'){
  const b=await body<any>(req,1000);const error=String(b.error||'Apps Script lỗi.').slice(0,300).replaceAll(key,'[key]');
  if(/^[a-f0-9]{64}$/.test(b.item_id||'')){
   const item=await env.DB.prepare('SELECT 1 FROM image_feed_items WHERE id=? AND source=?').bind(b.item_id,source).first();
   if(item)await env.DB.prepare('INSERT INTO feed_bridge_failures(item_id,attempts,next_at) VALUES(?,1,?) ON CONFLICT(item_id) DO UPDATE SET attempts=attempts+1,next_at=?').bind(b.item_id,Date.now()+600000,Date.now()+1800000).run();
  }
  await env.DB.prepare('UPDATE feed_bridge_snapshot SET error=? WHERE id=1').bind(error).run();
  await env.DB.prepare('UPDATE image_feed SET error=? WHERE id=1').bind(error).run();return json({ok:true});
 }
 throw new HttpError(404,'Không tìm thấy API Apps Script.');
}

export function appsScript(site:string,key:string){return `// FACIUP Studio — Apps Script riêng tư. Không triển khai Web App; không chia sẻ mã chứa khóa.
const FACIUP_WEB = ${JSON.stringify(site)};
const FACIUP_KEY = ${JSON.stringify(key)};
${APPS_SCRIPT}`;}
const APPS_SCRIPT=String.raw`
function caiDat() {
  const p = PropertiesService.getScriptProperties();
  p.setProperties({FACIUP_WEB:FACIUP_WEB,FACIUP_KEY:FACIUP_KEY});
  // Chỉ thay trigger của chức năng này; giữ trigger khác trong dự án.
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dongBoAnh').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dongBoAnh').timeBased().everyMinutes(5).create();
  dongBoAnh(true);
  console.log('Đã cài đồng bộ mỗi 5 phút. Lịch gửi Zalo được quản lý trên website.');
}
function dungDongBo() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dongBoAnh').forEach(t => ScriptApp.deleteTrigger(t));
}
function faciupRequest_(path, value, blob) {
  const p = PropertiesService.getScriptProperties();
  const site = p.getProperty('FACIUP_WEB') || FACIUP_WEB;
  const key = p.getProperty('FACIUP_KEY') || FACIUP_KEY;
  const response = UrlFetchApp.fetch(site + '/api/image-feed/bridge/' + path, {
    method:'post', headers:{Authorization:'Bearer ' + key},
    contentType:blob ? blob.getContentType() : 'application/json',
    payload:blob ? blob.getBytes() : JSON.stringify(value || {}),
    muteHttpExceptions:true, followRedirects:false
  });
  const code=response.getResponseCode();
  if(code < 200 || code >= 300) throw new Error('Website trả HTTP ' + code + '. Kiểm tra nguồn và khóa trong quản trị.');
  const result=JSON.parse(response.getContentText());
  if(result.error) throw new Error(result.error);
  return result;
}
function dongBoAnh(force) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try {
    let state=faciupRequest_('config',{force:force === true});
    if(!state.active) return;
    let images=state.images || [];
    if(state.due) {
      const c=state.config;
      const ss=SpreadsheetApp.openById(c.sheet);
      const tab=ss.getSheets().find(s => String(s.getSheetId()) === c.gid);
      if(!tab) throw new Error('Không tìm thấy gid trong Sheet.');
      const last=tab.getLastRow(),width=tab.getLastColumn();
      if(width>200 || last>10000) throw new Error('Nguồn tối đa 10.000 dòng và 200 cột.');
      const values=last && width ? tab.getRange(1,1,last,width).getDisplayValues() : [];
      const result=faciupRequest_('rows',{revision:state.revision,headers:values[c.header-1] || [],rows:values.slice(c.header)});
      if(result.warning) console.warn(result.warning);
      images=result.images || [];
    }
    let failed=0;
    images.forEach(item => {
      try {
        const file=DriveApp.getFileById(item.file_id);
        if(file.getSize()>8*1024*1024) throw new Error('Ảnh vượt 8 MB.');
        faciupRequest_('image/' + item.id,{},file.getBlob());
      } catch(e) { failed++; console.warn('Không chuyển được ảnh ' + item.file_id + ': ' + String(e.message || e));try { faciupRequest_('error',{item_id:item.id,error:'Không chuyển được ảnh '+item.file_id+'. Kiểm tra quyền đọc và định dạng ảnh.'}); } catch(ignored) {} }
    });
    if(failed) throw new Error(failed + ' ảnh chưa chuyển được. Xem Executions trong Apps Script và kiểm tra quyền đọc ảnh.');
  } catch(e) {
    try { faciupRequest_('error',{error:String(e.message || e).slice(0,300)}); } catch(ignored) {}
    throw e;
  } finally { lock.releaseLock(); }
}
`;
