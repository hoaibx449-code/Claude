import {fillLegal} from './legal.ts';
import type {Config} from './settings.ts';
import type {Env} from './util.ts';
/** Public page addresses are shared by metadata and the sitemap. */
export const PUBLIC_PAGES: Record<string, [string,string]> = {
 '/':['Trang chủ','Tạo video, tìm prompt và khám phá giải pháp AI phục vụ công việc.'],
 '/prompt-hunter':['Prompt Hunter','Khám phá và chia sẻ prompt AI đã được kiểm duyệt trong cộng đồng.'],
 '/cong-dong':['Cộng đồng','Khám phá các video được cộng đồng chia sẻ công khai.'],
 '/mau':['Gợi ý sáng tạo','Khám phá hướng sáng tạo để mô tả video bạn mong muốn.'],
 '/goi':['Bảng giá','Xem các gói sử dụng, hạn mức và credit tạo video.'],
 '/tao':['Tạo video','Mô tả ý tưởng và kết quả mong muốn để tạo dự án video với AI.'],
 '/thu':['Trải nghiệm','Trải nghiệm công cụ sáng tạo video.'],
 '/tro-giup':['Trợ giúp','Hướng dẫn sử dụng và hỗ trợ các công cụ của website.'],
 '/dieu-khoan':['Điều khoản sử dụng','Điều khoản sử dụng dịch vụ và tài nguyên.'],
 '/bao-mat':['Chính sách bảo mật','Cách website thu thập, sử dụng và bảo vệ thông tin của bạn.'],
 '/hoan-tien':['Chính sách hoàn tiền','Điều kiện và hướng dẫn yêu cầu hoàn tiền.'],
};
export function isAppPage(path:string) {
 return !!PUBLIC_PAGES[path] || /^\/(admin(?:\/[a-z0-9-]+)?|video|tai-khoan|zalo|dang-nhap-loi)$/.test(path)
 || /^\/p\/[a-f0-9]{24}$/.test(path) || /^\/xem\/[a-f0-9]{24}\/[a-f0-9]{24}$/.test(path);
}
export function pageMetadata(path:string,brand:string,origin:string,search='') {
 const page=PUBLIC_PAGES[path];
 return {title:(page?.[0]||'Khu vực cá nhân')+' | '+brand,
 description:page?.[1]||'Khu vực dành cho tài khoản đã đăng nhập.',
 canonical:origin+path,noindex:!page||!!search};
}
export function pageSitemap(origin:string) {
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Object.keys(PUBLIC_PAGES).map(path=>'<url><loc>'+origin+path+'</loc></url>').join('')+'</urlset>';
}

const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function initialPageContent(path:string,config:Config,env:Env) {
 const page=PUBLIC_PAGES[path];if(!page)return '';
 let body='<h1>'+escape(page[0])+'</h1><p>'+escape(page[1])+'</p>';
 const legalKey=({'/dieu-khoan':'terms','/bao-mat':'privacy','/hoan-tien':'refund'} as const)[path as '/dieu-khoan'];
 if(legalKey){
  const brand=[config.brand.name,config.brand.accent].filter(Boolean).join(' ');
  body='<h1>'+escape(page[0])+'</h1>'+fillLegal(config.legal[legalKey],config.legal,brand).split('\n').filter(Boolean).map(line=>line.startsWith('## ')?'<h2>'+escape(line.slice(3))+'</h2>':'<p>'+escape(line)+'</p>').join('');
 }else if(path==='/prompt-hunter'){
  const {results}=await env.DB.prepare("SELECT title,description FROM hunter_prompts WHERE status='published' ORDER BY updated_at DESC LIMIT 24").all<{title:string;description:string}>();
  body+=results.map(p=>'<article><h2>'+escape(p.title)+'</h2><p>'+escape(p.description||'')+'</p></article>').join('');
 }
 return '<section class="doc card" data-server-content>'+body+'<nav aria-label="Khám phá website"><a href="/kham-pha">Khám phá giải pháp</a> · <a href="/prompt-hunter">Prompt Hunter</a> · <a href="/tro-giup">Trợ giúp</a></nav></section>';
}

export const PRIMARY_NAVIGATION = [
 ['home','Trang chủ','/'],['mau','Gợi ý sáng tạo','/mau'],['cong-dong','Cộng đồng','/cong-dong'],
 ['kham-pha','Khám phá','/kham-pha'],['prompt-hunter','Prompt Hunter','/prompt-hunter'],
 ['goi','Bảng giá','/goi'],['video','Video của tôi','/video'],
] as const;
export function publicNavigation(config:Config,active='') {
 return PRIMARY_NAVIGATION.filter(([key])=>!(key==='goi'&&(config.beta.enabled||(config.visibility['feature:plans']||'on')!=='on'))&&!(key==='cong-dong'&&config.visibility['feature:community']==='hidden')).map(([key,label,href])=>'<a href="'+href+'" data-route="'+key+'"'+(key===active?' class="on" aria-current="page"':'')+'>'+escape(config.labels.navigation[key]||label)+'</a>').join('');
}
