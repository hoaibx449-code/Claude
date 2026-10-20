import {currentUser} from './auth.ts';
import {isAdmin} from './settings.ts';
import type {XEnv} from './worker.ts';
export function solutionAmount(price:unknown){const s=String(price||'').trim();return /^\d{1,9}$/.test(s)&&Number(s)>0?Number(s):0;}
export async function solutionAccess(req:Request,env:XEnv,solution:any){
 if(solution.pricing!=='paid')return true;
 const user=await currentUser(env,req);if(!user)return false;
 if(await env.DB.prepare('SELECT 1 FROM blocked_users WHERE user_id=?').bind(user.id).first())return false;
 if(await isAdmin(env,env.config,user))return true;
 return !!await env.DB.prepare("SELECT 1 FROM orders WHERE user_id=? AND plan=? AND status='paid'").bind(user.id,'solution:'+solution.id).first();
}
