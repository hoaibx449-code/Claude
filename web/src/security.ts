/** Defense-in-depth headers also cover API errors and Worker-generated responses. */
export function secureResponse(req:Request,res:Response){
 const h=new Headers(res.headers),api=new URL(req.url).pathname.startsWith('/api/');
 h.set('x-content-type-options','nosniff');h.set('x-frame-options','DENY');
 h.set('referrer-policy',api?'no-referrer':'strict-origin-when-cross-origin');
 h.set('permissions-policy','camera=(), microphone=(), geolocation=()');
 if(new URL(req.url).protocol==='https:')h.set('strict-transport-security','max-age=31536000');
 if(!h.has('content-security-policy'))h.set('content-security-policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
 if(/^\/api\/(admin\/|auth\/)/.test(new URL(req.url).pathname))h.set('cache-control','no-store');
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
}
