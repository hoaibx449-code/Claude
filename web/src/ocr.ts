import {HttpError} from './util.ts';
/** Only Zalo media CDN URLs, including every redirect target, may be fetched. */
export function zaloImageURL(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw new HttpError(400,'Đường dẫn ảnh không hợp lệ.');}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!['zadn.vn','zdn.vn','zaloapp.com','zalo.me'].some(d=>host===d||host.endsWith('.'+d)))throw new HttpError(400,'Ảnh cần được gửi trực tiếp qua Zalo, không dùng đường dẫn ngoài.');
 return u.href;
}
export async function downloadZaloImage(raw:string){
 let url=zaloImageURL(raw);const signal=AbortSignal.timeout(15000);
 for(let redirects=0;redirects<4;redirects++){
  const r=await fetch(url,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(r.status)){const to=r.headers.get('location');await r.body?.cancel();if(!to)break;url=zaloImageURL(new URL(to,url).href);continue;}
  if(!r.ok){await r.body?.cancel();throw new HttpError(502,'Không tải được ảnh Zalo; đường dẫn có thể đã hết hạn. Hãy gửi lại ảnh.');}
  const max=8*1024*1024;if(Number(r.headers.get('content-length'))>max){await r.body?.cancel();throw new HttpError(413,'Ảnh tối đa 8 MB.');}
  if(!r.body)break;const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new HttpError(413,'Ảnh tối đa 8 MB.');chunks.push(value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const is=(sig:number[],offset=0)=>sig.every((v,i)=>bytes[i+offset]===v);
  const mime=is([137,80,78,71,13,10,26,10])?'image/png':is([255,216,255])?'image/jpeg':is([82,73,70,70])&&is([87,69,66,80],8)?'image/webp':'';
  if(!mime)throw new HttpError(415,'Chỉ đọc ảnh PNG, JPG hoặc WebP; hãy gửi ảnh thay vì tệp khác.');
  return {mime,data:Buffer.from(bytes).toString('base64')};
 }
 throw new HttpError(502,'Không lấy được ảnh. Bạn gửi lại ảnh giúp mình.');
}
