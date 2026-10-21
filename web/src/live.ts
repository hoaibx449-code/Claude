import type {Env} from './util.ts';
import type {Config} from './settings.ts';
/** Public inventory only. Never expose jobs, messages, schedules, keys or customer data. */
export async function liveOverview(env:Env,config:Config){
 const [prompts,solutions]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS n FROM hunter_prompts WHERE status='published'").first<{n:number}>(),
  env.DB.prepare("SELECT COUNT(*) AS n FROM solutions WHERE status='published'").first<{n:number}>(),
 ]);
 return {updatedAt:Date.now(),timezone:'Asia/Ho_Chi_Minh',
  counts:{prompts:Number(prompts?.n||0),solutions:Number(solutions?.n||0)},
  features:{assistant:config.site.helpBot.enabled,zalo:config.zalo.enabled&&config.visibility['feature:zalo']!=='hidden',community:config.visibility['feature:community']!=='hidden'},
 };
}
