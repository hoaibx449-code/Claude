// An unpromoted version of the existing Worker for the web-demo branch.
// No database, object storage, cron, account session or write API is bound here.
import {previewAuthConfig,previewRuntime} from './preview-data.ts';
import {PUBLIC_PAGES} from './page-routes.ts';
interface PreviewEnv { ASSETS: Fetcher }
const PREVIEW_BAR = '<aside id="web-demo-note" aria-label="Bản xem trước"><span><b>web-demo</b> · Dữ liệu minh họa</span><button type="button" data-live-preview>Thử tin nhắn</button></aside>';
export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);
    const noWrite = () => Response.json({error:'Bản demo chỉ xem giao diện; thao tác tài khoản và ghi dữ liệu bị tắt.'},{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
    if (!['GET','HEAD'].includes(request.method)) return noWrite();
    const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
    if(url.pathname==='/api/auth/config')return json(previewAuthConfig());
    if(url.pathname==='/api/faciup-live')return json(previewRuntime());
    if(url.pathname==='/api/faciup-live/pulse')return json({jobs:String(Math.floor(Date.now()/12000)),zalo:'preview'});
    if (url.pathname.startsWith('/api/')) return Response.json({error:'Demo không dùng tài khoản hoặc dữ liệu riêng tư.'},{status:401,headers:{'Cache-Control':'no-store'}});
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/oauth/')) return noWrite();
    const response = await env.ASSETS.fetch(request);
    if (!response.headers.get('Content-Type')?.includes('text/html')) return response;
    const rewritten = new HTMLRewriter()
      .on('head',{element(el){el.append('<link rel="stylesheet" href="/web-demo-controls.css"><meta name="robots" content="noindex,nofollow"><script type="application/json" id="route-metadata">'+JSON.stringify({pages:PUBLIC_PAGES,brand:'FACIUP'}).replace(/</g,'\\u003c')+'</script>',{html:true});}})
      .on('body',{element(el){el.append(PREVIEW_BAR+'<script src="/web-demo-controls.js" defer></script>',{html:true});}})
      .transform(response);
    const result = new Response(rewritten.body,rewritten);
    result.headers.set('X-Robots-Tag','noindex, nofollow');
    result.headers.set('Cache-Control','no-store');
    return result;
  }
};
