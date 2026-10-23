// Review-only data for web-demo. Never reads production accounts or databases.
import {defaultConfig,publicConfig} from './settings.ts';
import type {Env} from './util.ts';
export function previewAuthConfig(){
  const cfg=defaultConfig({} as Env);
  cfg.brand={name:'FACIUP',accent:'',tagline:cfg.brand.tagline};
  cfg.labels.navigation={...cfg.labels.navigation,home:'Trang chủ',mau:'Gợi ý','cong-dong':'Cộng đồng','kham-pha':'Khám phá','prompt-hunter':'Prompt',video:'Của tôi'};
  cfg.site.menu={hidden:['goi','tro-giup'],order:['home','mau','cong-dong','kham-pha','faciup-live','prompt-hunter','video','tao']};
  cfg.site.helpBot.enabled=false;
  return {clientId:null,dev:false,ui:publicConfig(cfg),ai:{gemini:false,openai:false,ollama:false}};
}
export function previewRuntime(now=Date.now()){
  const phase=Math.floor(now/12000),turn=phase%6;
  const names=['FACIUP','Chiến lược','Nghiên cứu','Biên kịch','Phản biện','Tin tức','Thiết kế','Marketing','Dữ liệu','Zalo Bot'];
  const icons=['coordinator','target','search','pen','check','news','design','mega','chart','zalo'];
  const colors=['#f97316','#ec4899','#8b5cf6','#2563eb','#14b8a6','#e8337f','#0d9488','#eab308','#0ea5a4','#0878ff'];
  const agents=names.map((name,i)=>({id:i===9?'zalo':'preview-'+i,name,icon:icons[i],color:colors[i],seat:i+1,state:i===turn?'running':i===9?'live24':'idle',avg:55+i*4,since:now-now%12000,completed:3+i%5,live:i===9,received:i===9?8:0,replies:i===9?8:0}));
  return {preview:true,updatedAt:now,runtime:{enabled:true,polledAt:now,office:{title:'Faciup Live',subtitle:'Văn phòng vận hành của đội AI'},rooms:[{id:'exec',name:'Điều hành'},{id:'ops',name:'Sáng tạo'},{id:'admin',name:'Vận hành'}],agents,sessions:[{n:1,current:turn,state:'running',step:turn}],running:1,queued:0,review:2,board:{progress:42+turn*5,efficiency:86,quality:94,support:98,internal:90},kpi:{today:26}}};
}
