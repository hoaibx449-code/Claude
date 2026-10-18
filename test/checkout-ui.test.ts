import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const file=readFileSync('web/public/app.js','utf8'),source=file.slice(file.indexOf('function payModal('),file.indexOf('// ---------- Zalo'));
class El{children:any[]=[];parent:any=null;style:any={};classList:any={toggle(){}};textContent='';props:any;constructor(props:any={}){this.props=props;}replaceChildren(...kids:any[]){this.children=kids.flat().filter(x=>x!=null&&x!==false);for(const k of this.children)if(k instanceof El)k.parent=this;}append(...kids:any[]){this.replaceChildren(...this.children,...kids);}remove(){if(this.parent)this.parent.children=this.parent.children.filter((x:any)=>x!==this);this.parent=null;}contains(node:any):boolean{return this===node||this.children.some(x=>x instanceof El&&x.contains(node));}}
const text=(n:any):string=>n instanceof El?n.textContent+n.children.map(text).join(' '):String(n);
async function scenario(states:any[],credit=false){
 const body=new El(),timers=new Map(),listeners=new Map();let next=0,refreshed=0;
 body['dataset']={page:'video'};
 const h=(_tag:any,props:any,...kids:any[])=>{const el=new El(props);el.replaceChildren(...kids);return el;};
 const context:any={h,document:{body,hidden:false,querySelector:()=>null,addEventListener:(k:any,f:any)=>listeners.set(k,f),removeEventListener:(k:any)=>listeners.delete(k)},window:{addEventListener:(k:any,f:any)=>listeners.set(k,f),removeEventListener:(k:any)=>listeners.delete(k)},setTimeout:(f:any,ms:any)=>{timers.set(++next,{f,ms});return next;},clearTimeout:(id:any)=>timers.delete(id),bankOf:()=>({name:'Bank'}),bankLogo:()=>new El(),money:String,track(){},refreshMemberState:async()=>{refreshed++;},showAccount(){},location:{hash:''},api:async()=>{const state=states.shift();if(state instanceof Error)throw state;return {order:{status:state}};}};
 runInNewContext(source+';payModal',context)({code:'NVTEST01',plan:credit?'credit:test':'pro',amount:100,account:'123',memo:'NVTEST01',qr:'test',auto:true,created_at:Date.now()},{name:'Test'});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};await flush();
 const poll=async()=>{const entry=[...timers].find(([,v])=>v.ms===4000);assert.ok(entry);timers.delete(entry[0]);await entry[1].f();await flush();};
 return {body,timers,listeners,poll,get refreshed(){return refreshed;}};
}
test('checkout observes manual payment, refreshes entitlements and stops pending display',async()=>{const s=await scenario(['pending','paid'],true);assert.match(text(s.body),/chờ xác nhận/);await s.poll();assert.match(text(s.body),/Thanh toán thành công/);assert.match(text(s.body),/Credit đã được cộng/);assert.equal(s.refreshed,1);assert.equal(s.timers.size,0);assert.equal(s.listeners.size,0);});
test('checkout displays connection failure and recovers on retry',async()=>{const s=await scenario([new Error('offline'),'paid']);assert.match(text(s.body),/thử kết nối lại/);await s.poll();assert.match(text(s.body),/Thanh toán thành công/);assert.equal(s.refreshed,1);});
test('cancelled orders stop waiting without granting entitlements',async()=>{const s=await scenario(['cancelled']);assert.match(text(s.body),/Đơn đã huỷ/);assert.equal(s.refreshed,0);assert.equal(s.timers.size,0);});
