// An unpromoted version of the existing Worker for the web-demo branch.
// No database, object storage, cron, account session or write API is bound here.
import {previewAuthConfig,previewRuntime} from './preview-data.ts';
import {PUBLIC_PAGES} from './page-routes.ts';
interface PreviewEnv { ASSETS: Fetcher }
const PREVIEW_BAR = `<aside id="web-demo-note" aria-label="Bản xem trước" style="position:fixed;left:50%;bottom:max(12px,env(safe-area-inset-bottom));translate:-50% 0;z-index:2000;display:flex;align-items:center;gap:10px;max-width:94vw;padding:8px 12px;background:#fffffff5;border:1px solid #ded1f3;border-radius:12px;box-shadow:0 5px 25px #37205222;color:#625075;font:12px/1.4 system-ui"><span><b>web-demo</b> · Dữ liệu minh họa</span><button type="button" data-live-preview style="border:1px solid #d8c5ef;background:#f4efff;color:#6d28d9;border-radius:8px;padding:6px 10px;font:600 12px system-ui;white-space:nowrap;cursor:pointer">Thử tin nhắn</button></aside><style>@media(max-width:700px){#web-demo-note{bottom:74px!important;font-size:10px!important;padding:6px 9px!important;gap:6px!important}#web-demo-note button{font-size:10px!important}}body{padding-bottom:46px!important}</style>`;
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
      .on('head',{element(el){el.append('<meta name="robots" content="noindex,nofollow"><script type="application/json" id="route-metadata">'+JSON.stringify({pages:PUBLIC_PAGES,brand:'FACIUP'}).replace(/</g,'\\u003c')+'</script>',{html:true});}})
      .on('body',{element(el){el.append(PREVIEW_BAR+'<script src="/web-demo-controls.js" defer></script>',{html:true});}})
      .transform(response);
    const result = new Response(rewritten.body,rewritten);
    result.headers.set('X-Robots-Tag','noindex, nofollow');
    result.headers.set('Cache-Control','no-store');
    return result;
  }
};
