import * as WhiteboardEngine from './faciup-ink.js';
export function compile(d,D,w,h,index){
const K='#24232b',P='#7155bd',O='#e77e36',scenes=Array(index||0);let s;
function scene(title){s={title,strokes:[],labels:[],fills:[]};scenes.push(s);}
function st(points,color=K,width=7){s.strokes.push({points,color,width});}
function fill(points,color,after=s.strokes.length-1){
  const palettes={
    '#f0eaff':[['#dcf8ef','#a8e8d5'],['#e2efff','#abcafa'],['#fff2c9','#ffdb7d'],['#ffe3ed','#f7b9d1'],['#eae1ff','#cbb5f6']],
    '#c7b5ed':[['#40c6a2','#189c82'],['#5596ef','#316bd0'],['#ffbe45','#ed962a'],['#f47daa','#d85087'],['#a078e8','#7948c0']],
    '#ffd17a':[['#ffe658','#ffb62e']],
    '#bda3ed':[['#ff86b7','#e64f91'],['#4bd2c6','#20a49d'],['#9d7aee','#714bce'],['#69b9fb','#3487d3']],
    '#ffad75':[['#ffce54','#f6a02d']],
    '#ffcfad':[['#ffd5b3','#eeb486']],
    '#ffb881':[['#ff9a62','#ee6543'],['#65c6ef','#348acd']],
    '#ece7ff':[['#c0efff','#78cbe8']],
    '#fff0d5':[['#e3ffd2','#a7df81']]
  };
  const pool=palettes[color];s.colorCounts=s.colorCounts||{};
  const n=s.colorCounts[color]||0;s.colorCounts[color]=n+1;
  const pair=pool?pool[(scenes.length-1+n)%pool.length]:[color,color];
  s.fills.push({points,color:pair[0],colorEnd:pair[1],after});
}
function txt(text,x,y,at=3,size=38,color=K,maxWidth=750){s.labels.push({text,x,y,at,size,color,maxWidth});}
function curve(a,b,c,d,color=K,width=7){st(Array.from({length:45},(_,i)=>{let t=i/44,u=1-t;return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];}),color,width);}
function arc(x,y,rx,ry,a=0,b=Math.PI*2,color=K,width=7){st(Array.from({length:55},(_,i)=>[x+rx*Math.cos(a+(b-a)*i/54),y+ry*Math.sin(a+(b-a)*i/54)]),color,width);}
function page(x,y,w,h){const n=s.strokes.length;st([[x,y],[x+w-45,y],[x+w,y+45],[x+w,y+h],[x,y+h],[x,y]]);st([[x+w-45,y],[x+w-45,y+45],[x+w,y+45]]);fill(s.strokes[n].points,'#f0eaff');fill(s.strokes[n+1].points,'#c7b5ed');}
function check(x,y,k=1){st([[x,y],[x+28*k,y+30*k],[x+92*k,y-48*k]],P,10);}
function arrow(x,y,x2,y2){let a=Math.atan2(y2-y,x2-x),r=24;st([[x,y],[x2,y2]],P,8);st([[x2-r*Math.cos(a-.6),y2-r*Math.sin(a-.6)],[x2,y2],[x2-r*Math.cos(a+.6),y2-r*Math.sin(a+.6)]],P,8);}
function bulb(x,y,r){const n=s.strokes.length;curve([x-r*.52,y+r*.7],[x-r*1.7,y-r*.7],[x-r*.8,y-r*1.45],[x,y-r*1.2]);curve([x,y-r*1.2],[x+r*.8,y-r*1.45],[x+r*1.7,y-r*.7],[x+r*.52,y+r*.7]);st([[x-r*.52,y+r*.7],[x-r*.4,y+r],[x+r*.4,y+r],[x+r*.52,y+r*.7]]);st([[x-r*.35,y+r*1.18],[x+r*.35,y+r*1.18]]);st([[x-r*.2,y+r*1.35],[x+r*.2,y+r*1.35]]);st([[x-r*.2,y+r*.64],[x-r*.2,y],[x,y+r*.16],[x+r*.2,y],[x+r*.2,y+r*.64]],O,6);fill([...s.strokes[n].points,...s.strokes[n+1].points,...s.strokes[n+2].points],'#ffd17a',n+2);}
function pen(x,y,k=1){const n=s.strokes.length;const p=[[0,0],[22,-67],[135,-180],[166,-149],[53,-36],[0,0]];st(p.map(([a,b])=>[x+a*k,y+b*k]));st([[x+22*k,y-67*k],[x+53*k,y-36*k]],O,7);st([[x+135*k,y-180*k],[x+149*k,y-195*k],[x+181*k,y-163*k],[x+166*k,y-149*k]]);fill(s.strokes[n].points,'#bda3ed');fill([[x,y],[x+22*k,y-67*k],[x+53*k,y-36*k]],'#ffd17a',n);fill(s.strokes[n+2].points,'#ffad75');}
function people(x,y,k=1){const n=s.strokes.length;arc(x,y,34*k,39*k);curve([x-67*k,y+135*k],[x-68*k,y+48*k],[x+68*k,y+48*k],[x+67*k,y+135*k]);st([[x-67*k,y+135*k],[x+67*k,y+135*k]]);fill(s.strokes[n].points,'#ffcfad',n);fill(s.strokes[n+1].points,'#bda3ed');}
function shoe(x,y,k=1){const n=s.strokes.length;curve([x,y],[x+50*k,y-60*k],[x+80*k,y+8*k],[x+155*k,y+12*k]);curve([x+155*k,y+12*k],[x+195*k,y+20*k],[x+195*k,y+48*k],[x+165*k,y+48*k]);st([[x+165*k,y+48*k],[x-15*k,y+48*k],[x-15*k,y+10*k],[x,y]]);st([[x+42*k,y-8*k],[x+67*k,y+8*k],[x+84*k,y-5*k],[x+109*k,y+13*k]],O,6);fill([...s.strokes[n].points,...s.strokes[n+1].points,...s.strokes[n+2].points],'#ffb881');}
function heart(x,y,r){const n=s.strokes.length;curve([x,y+r],[x-r*1.5,y],[x-r,y-r],[x,y-r*.35]);curve([x,y-r*.35],[x+r,y-r],[x+r*1.5,y],[x,y+r]);fill([...s.strokes[n].points,...s.strokes[n+1].points],'#ff79a8');}
function book(x,y,w,h){const n=s.strokes.length;st([[x,y+20],[x+w/2,y],[x+w,y+20],[x+w,y+h],[x+w/2,y+h-20],[x,y+h],[x,y+20]]);st([[x+w/2,y],[x+w/2,y+h-20]]);fill(s.strokes[n].points,'#f0eaff');}
function bag(x,y,w,h){const n=s.strokes.length;st([[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]);st([[x+w*.35,y],[x+w*.35,y-40],[x+w*.65,y-40],[x+w*.65,y]]);st([[x,y+h*.35],[x+w,y+h*.35]]);fill(s.strokes[n].points,'#ffb881');}
function battery(x,y,w,h,low=false){const n=s.strokes.length;st([[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]);st([[x+w,y+h*.35],[x+w+25,y+h*.35],[x+w+25,y+h*.65],[x+w,y+h*.65]]);fill(s.strokes[n].points,'#f0eaff');st([[x+15,y+15],[x+w*(low?.18:.8),y+15],[x+w*(low?.18:.8),y+h-15],[x+15,y+h-15],[x+15,y+15]],low?O:P);fill(s.strokes.at(-1).points,low?'#ffb881':'#bda3ed');}
function house(x,y,w,h,door=true){const n=s.strokes.length;st([[x,y+75],[x+w/2,y],[x+w,y+75],[x+w,y+h],[x,y+h],[x,y+75]]);if(door)st([[x+w*.4,y+h],[x+w*.4,y+h*.6],[x+w*.65,y+h*.6],[x+w*.65,y+h]]);fill(s.strokes[n].points,'#f0eaff');}
function clock(x,y,r){arc(x,y,r,r);fill(s.strokes.at(-1).points,'#fff0d5');st([[x,y-r*.65],[x,y],[x+r*.5,y+r*.3]],P,8);}
function compass(x,y,r){arc(x,y,r,r);fill(s.strokes.at(-1).points,'#ece7ff');st([[x,y-r*.73],[x-r*.3,y+r*.55],[x+r*.3,y+r*.55],[x,y-r*.73]],O);fill(s.strokes.at(-1).points,'#ffad75');txt('ĐÍCH ĐẾN',x,y+r+55,3.5,35,P,350);}
function hourglass(x,y,w,h){const n=s.strokes.length;st([[x,y],[x+w,y],[x+w*.55,y+h*.5],[x+w,y+h],[x,y+h],[x+w*.45,y+h*.5],[x,y]]);st([[x-15,y],[x+w+15,y]]);st([[x-15,y+h],[x+w+15,y+h]]);fill(s.strokes[n].points,'#ffd17a');}
function cross(x,y,r){st([[x-r,y-r],[x+r,y+r]],O,12);st([[x-r,y+r],[x+r,y-r]],O,12);}
function organic(points,closed=false){
  const input=closed?[...points,points[0]]:points,out=[];
  const warp=([x,y])=>[x+2.3*Math.sin(y*.025+x*.012)+1.3*Math.sin(y*.009),y+2.1*Math.sin(x*.031+y*.008)];
  for(let i=1;i<input.length;i++){const a=input[i-1],b=input[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12));for(let j=0;j<n;j++)out.push(warp([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]));}
  out.push(warp(input.at(-1)));return out;
}

scene(d.title||'');s.width=w;s.height=h;s.titleY=h<w?65:150;
const wide=w>h;if(d.textOnly){s.textOnly=true;s.labels=(d.lines||[]).map((text,i)=>({text,x:w/2,y:wide?480+i*100:700+i*120,at:.1,size:48,maxWidth:w-180}));return WhiteboardEngine.prepare(s);}
const px=v=>wide?110+1700*v:80+920*v,py=v=>wide?300+550*v:340+1160*v;
(d.objects||[]).forEach((o,oi)=>{
 const x=px(o.x),y=py(o.y),before=s.fills.length;const k=Math.max(.3,Math.min((o.scale||1)*(wide?.82:1),(x-70)/165,(w-70-x)/165,(y-(wide?240:330))/165,(h-180-y)/220));
 switch(o.kind){
 case 'bulb':bulb(x,y,82*k);break;
 case 'person':case 'people':people(x,y-45*k,k);break;
 case 'book':book(x-110*k,y-100*k,220*k,230*k);break;
 case 'paper':page(x-105*k,y-110*k,210*k,245*k);break;
 case 'pen':pen(x-72*k,y+76*k,k);break;
 case 'heart':heart(x,y,80*k);break;
 case 'clock':clock(x,y,92*k);break;
 case 'calendar':page(x-115*k,y-90*k,230*k,190*k);st([[x-115*k,y-40*k],[x+115*k,y-40*k]],O);st([[x-60*k,y-115*k],[x-60*k,y-65*k]]);st([[x+60*k,y-115*k],[x+60*k,y-65*k]]);break;
 case 'house':house(x-110*k,y-100*k,220*k,230*k);break;
 case 'battery':battery(x-120*k,y-50*k,225*k,100*k,/cạn|kiệt|hết|low/i.test(o.label||''));break;
 case 'bag':bag(x-105*k,y-75*k,210*k,150*k);break;
 case 'shoe':shoe(x-80*k,y,k);break;
 case 'compass':arc(x,y,94*k,94*k);fill(s.strokes.at(-1).points,'#ece7ff');st([[x,y-65*k],[x-30*k,y+55*k],[x+30*k,y+55*k],[x,y-65*k]],O);fill(s.strokes.at(-1).points,'#ffad75');break;
 case 'hourglass':hourglass(x-70*k,y-100*k,140*k,210*k);break;
 case 'magnifier':arc(x-15*k,y-20*k,65*k,65*k);fill(s.strokes.at(-1).points,'#ece7ff');st([[x+30*k,y+28*k],[x+85*k,y+85*k]],K,15);break;
 case 'check':check(x-40*k,y,k);break;
 case 'cross':cross(x,y,70*k);break;
 case 'arrow':arrow(x,y,px((o.to||[.6,.6])[0]),py((o.to||[.6,.6])[1]));break;
 case 'filter':st([[x-120*k,y-100*k],[x+120*k,y-100*k],[x+30*k,y+50*k],[x+30*k,y+115*k],[x-30*k,y+140*k],[x-30*k,y+50*k],[x-120*k,y-100*k]]);fill(s.strokes.at(-1).points,'#ffd17a');break;
 case 'phone':page(x-58*k,y-115*k,116*k,225*k);st([[x-20*k,y+88*k],[x+20*k,y+88*k]]);break;
 case 'laptop':st([[x-110*k,y-90*k],[x+110*k,y-90*k],[x+110*k,y+50*k],[x-110*k,y+50*k],[x-110*k,y-90*k]]);fill(s.strokes.at(-1).points,'#ece7ff');st([[x-110*k,y+50*k],[x-150*k,y+90*k],[x+150*k,y+90*k],[x+110*k,y+50*k]]);break;
 case 'sun':arc(x,y,63*k,63*k);fill(s.strokes.at(-1).points,'#ffd17a');for(let a=0;a<8;a++){let t=a*Math.PI/4;st([[x+Math.cos(t)*85*k,y+Math.sin(t)*85*k],[x+Math.cos(t)*110*k,y+Math.sin(t)*110*k]],O)}break;
 case 'cloud':curve([x-115*k,y+40*k],[x-165*k,y-30*k],[x-90*k,y-70*k],[x-50*k,y-35*k]);curve([x-50*k,y-35*k],[x-30*k,y-130*k],[x+90*k,y-120*k],[x+85*k,y-30*k]);curve([x+85*k,y-30*k],[x+170*k,y-55*k],[x+170*k,y+50*k],[x+105*k,y+50*k]);st([[x+105*k,y+50*k],[x-115*k,y+40*k]]);break;
 case 'tree':st([[x-20*k,y+135*k],[x-20*k,y+20*k],[x+20*k,y+20*k],[x+20*k,y+135*k]]);arc(x,y-35*k,85*k,105*k);fill(s.strokes.at(-1).points,'#f0eaff');break;
 case 'plant':st([[x,y+100*k],[x,y-60*k]]);curve([x,y],[x-110*k,y-90*k],[x-90*k,y-140*k],[x,y-60*k]);curve([x,y-25*k],[x+90*k,y-125*k],[x+100*k,y-70*k],[x,y+20*k]);break;
 case 'mountain':st([[x-140*k,y+90*k],[x-35*k,y-115*k],[x+55*k,y+60*k],[x+95*k,y-25*k],[x+150*k,y+90*k],[x-140*k,y+90*k]]);fill(s.strokes.at(-1).points,'#ece7ff');break;
 case 'cup':st([[x-80*k,y-80*k],[x+65*k,y-80*k],[x+50*k,y+80*k],[x-55*k,y+80*k],[x-80*k,y-80*k]]);fill(s.strokes.at(-1).points,'#ffb881');curve([x+65*k,y-55*k],[x+160*k,y-80*k],[x+150*k,y+65*k],[x+58*k,y+48*k]);break;
 case 'target':arc(x,y,105*k,105*k);fill(s.strokes.at(-1).points,'#ffad75');arc(x,y,65*k,65*k);arc(x,y,20*k,20*k);arrow(x+130*k,y-130*k,x,y);break;
 case 'shield':st([[x,y-120*k],[x+105*k,y-75*k],[x+80*k,y+65*k],[x,y+125*k],[x-80*k,y+65*k],[x-105*k,y-75*k],[x,y-120*k]]);fill(s.strokes.at(-1).points,'#f0eaff');check(x-40*k,y,k*.8);break;
 case 'key':arc(x-60*k,y-35*k,48*k,48*k);st([[x-28*k,y],[x+105*k,y+100*k],[x+135*k,y+65*k],[x+105*k,y+45*k],[x+85*k,y+65*k]],O,13);break;
 case 'custom':(o.paths||[]).forEach(p=>{var pts=p.points.map(v=>[x+v[0]*k,y+v[1]*k]);if(p.closed)pts.push(pts[0]);st(pts);if(p.fill)fill(pts,p.fill)});break;
 default:throw Error('Biểu tượng chưa được hỗ trợ: '+o.kind);
 }
 if(o.color)for(let j=before;j<s.fills.length;j++){s.fills[j].color=o.color;s.fills[j].colorEnd=o.color;}
 if(o.label)txt(o.label,x,y+(wide?130:170)*k,.8+oi*.8,wide?38:36,K,Math.min(wide?400:350,2*(x-70),2*(w-70-x)));
});
s.strokes.forEach((p,i)=>{p.points=organic(p.points);p.width=(p.width||7)*(1+.1*Math.sin(i*1.7));});s.fills.forEach(p=>p.points=organic(p.points,true));
const sum=s.strokes.reduce((n,p)=>n+p.points.slice(1).reduce((a,v,i)=>a+Math.hypot(v[0]-p.points[i][0],v[1]-p.points[i][1]),0),0),gap=.09;
let cursor=.18,budget=Math.max(1,D*.73-.18-gap*(s.strokes.length-1));
s.strokes.forEach(p=>{let len=p.points.slice(1).reduce((n,v,i)=>n+Math.hypot(v[0]-p.points[i][0],v[1]-p.points[i][1]),0);p.start=cursor;p.duration=.07+Math.max(0,budget-.07*s.strokes.length)*len/Math.max(1,sum);cursor+=p.duration+gap;});
s.labels.forEach(l=>l.at=Math.min(D*.65,l.at));return WhiteboardEngine.prepare(s);
}
