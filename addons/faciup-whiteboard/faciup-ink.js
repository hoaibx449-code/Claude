'use strict';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function prepare(scene){
  if(scene.textOnly)return {...scene,strokes:[]};
  if(!Array.isArray(scene.strokes)||!scene.strokes.length)throw Error('Whiteboard scene has no vector strokes. Raster reveal is not a substitute.');
  const strokes=scene.strokes.map(s=>{if(!Array.isArray(s.points)||s.points.length<2)throw Error('Invalid stroke points');let len=0;const lengths=[0];for(let i=1;i<s.points.length;i++){const p=s.points[i],q=s.points[i-1];if(!p.every(Number.isFinite))throw Error('Non-finite stroke');len+=Math.hypot(p[0]-q[0],p[1]-q[1]);lengths.push(len);}if(!len)throw Error('Zero length stroke');return {...s,lengths,length:len};});
  return {...scene,strokes};
}
function sample(s,f){const d=clamp(f)*s.length;let i=1;while(i<s.lengths.length-1&&s.lengths[i]<d)i++;const a=s.points[i-1],b=s.points[i],u=(d-s.lengths[i-1])/Math.max(.000001,s.lengths[i]-s.lengths[i-1]);return {point:[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],index:i};}
function captionGroups(text){let groups=[];for(const sentence of text.split(/(?<=[.?!])\s+/)){const w=sentence.trim().split(/\s+/),n=Math.ceil(w.length/12),size=Math.ceil(w.length/n);for(let i=0;i<w.length;i+=size)groups.push(w.slice(i,i+size).join(' '));}return groups;}
function path(ctx,s,f){if(f<=0)return;const p=sample(s,f);ctx.beginPath();ctx.moveTo(...s.points[0]);for(let i=1;i<p.index;i++)ctx.lineTo(...s.points[i]);ctx.lineTo(...p.point);ctx.strokeStyle=s.color||'#24232b';ctx.lineWidth=s.width||7;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function hand(ctx,p,alpha=1){
  ctx.save();ctx.translate(p[0],p[1]);ctx.scale(.85,.85);ctx.globalAlpha=alpha;
  // One complete fixed right-hand drawing; its nib is exactly (0,0).
  ctx.strokeStyle='#26252d';ctx.lineWidth=4;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.fillStyle='#26252d';ctx.beginPath();ctx.moveTo(-3,-11);ctx.lineTo(0,0);ctx.lineTo(8,-7);ctx.closePath();ctx.fill();
  ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(5,-12);ctx.lineTo(51,-107);ctx.stroke();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,-18);ctx.lineTo(48,-101);ctx.stroke();
  ctx.strokeStyle='#26252d';ctx.lineWidth=4;ctx.fillStyle='#fff';
  ctx.beginPath();ctx.moveTo(43,-64);ctx.bezierCurveTo(47,-84,66,-87,74,-75);ctx.bezierCurveTo(90,-70,98,-60,105,-44);ctx.bezierCurveTo(115,-31,124,-15,138,0);ctx.lineTo(180,40);ctx.lineTo(131,88);ctx.lineTo(91,53);ctx.bezierCurveTo(64,43,40,22,33,-2);ctx.bezierCurveTo(24,-12,13,-28,17,-39);ctx.bezierCurveTo(21,-49,31,-48,43,-36);ctx.bezierCurveTo(36,-44,30,-56,36,-64);ctx.bezierCurveTo(39,-68,42,-67,43,-64);ctx.closePath();ctx.fill();ctx.stroke();
  // Index gripping the shaft; middle, ring and little finger contours.
  ctx.beginPath();ctx.moveTo(43,-64);ctx.bezierCurveTo(32,-58,29,-49,36,-41);ctx.bezierCurveTo(42,-34,50,-28,61,-26);ctx.stroke();
  ctx.beginPath();ctx.moveTo(66,-60);ctx.bezierCurveTo(52,-58,46,-48,52,-39);ctx.bezierCurveTo(56,-31,66,-25,76,-22);ctx.stroke();
  ctx.beginPath();ctx.moveTo(84,-46);ctx.bezierCurveTo(71,-44,67,-34,72,-26);ctx.bezierCurveTo(76,-19,86,-14,93,-13);ctx.stroke();
  ctx.beginPath();ctx.moveTo(100,-28);ctx.bezierCurveTo(88,-26,86,-17,93,-9);ctx.bezierCurveTo(97,-3,103,0,110,3);ctx.stroke();
  ctx.beginPath();ctx.moveTo(31,-28);ctx.bezierCurveTo(45,-10,59,2,79,7);ctx.stroke();
  ctx.fillStyle='#eeeaf7';ctx.beginPath();ctx.moveTo(128,83);ctx.lineTo(175,35);ctx.lineTo(203,60);ctx.lineTo(155,109);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function wrap(ctx,text,x,y,maxWidth,size,lineHeight,weight='600',color='#24232b',align='center'){
  size*=.91;ctx.font=`${Number(weight)>=600?'bold':'normal'} ${size}px "WB Hand","Segoe Print",cursive`;ctx.textAlign=align;ctx.textBaseline='top';ctx.fillStyle=color;
  let rows=[],line='';for(const word of text.split(/\s+/)){let next=(line+' '+word).trim();if(ctx.measureText(next).width>maxWidth&&line){rows.push(line);line=word;}else line=next;}if(line)rows.push(line);rows.forEach((r,i)=>ctx.fillText(r,x,y+i*lineHeight));return rows.length*lineHeight;
}
function frame(ctx,scene,t,options={}){
  const W=options.width||1080,H=options.height||1920;ctx.save();ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);const rw=scene.width||1080,rh=scene.height||1920,scale=Math.min(W/rw,H/rh);ctx.translate((W-rw*scale)/2,(H-rh*scale)/2);ctx.scale(scale,scale);
  const g=scene;let tip=null,active=null;
  // Stable editorial labels; the moving hand claims only the actual drawn strokes.
  if(t>.08){ctx.globalAlpha=clamp(t/.3);wrap(ctx,g.title,(g.width||1080)/2,g.titleY||150,(g.width||1080)-160,72,88,'800');ctx.globalAlpha=1;}
  // Color stays beneath every outline and appears only after its object is drawn.
  for(const fill of g.fills||[]){
    const end=g.strokes[fill.after],at=end.start+end.duration;
    const opacity=clamp((t-at)/.48);
    if(opacity>0){ctx.save();ctx.globalAlpha=opacity;
      if(fill.colorEnd){const xs=fill.points.map(p=>p[0]),ys=fill.points.map(p=>p[1]);const gradient=ctx.createLinearGradient(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));gradient.addColorStop(0,fill.color);gradient.addColorStop(1,fill.colorEnd);ctx.fillStyle=gradient;}else ctx.fillStyle=fill.color;
      ctx.beginPath();ctx.moveTo(...fill.points[0]);for(const p of fill.points.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();
      // Soft marker passes stay clipped inside the organic outline.
      ctx.clip();ctx.globalAlpha=opacity*.045;ctx.strokeStyle='#ffffff';ctx.lineWidth=9;
      const xs=fill.points.map(p=>p[0]),ys=fill.points.map(p=>p[1]);
      const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
      for(let y=y0-50;y<y1+50;y+=23+7*Math.sin(y*.047)){ctx.lineWidth=7+4*Math.sin(y*.017);ctx.beginPath();ctx.moveTo(x0-15,y);ctx.bezierCurveTo(x0+(x1-x0)*.3,y+12*Math.sin(y*.021),x0+(x1-x0)*.7,y-6,x1+15,y+15);ctx.stroke();}ctx.restore();}
  }
  for(let i=0;i<g.strokes.length;i++){
    const s=g.strokes[i],u=clamp((t-s.start)/s.duration);path(ctx,s,u);
    if(t>=s.start&&t<s.start+s.duration){tip=sample(s,u).point;active=s;}
    if(u===1&&s.endDot){ctx.fillStyle=s.color||'#24232b';ctx.beginPath();ctx.arc(...s.points.at(-1),9,0,Math.PI*2);ctx.fill();}
    const next=g.strokes[i+1];if(!tip&&next&&t>=s.start+s.duration&&t<next.start){const f=clamp((t-s.start-s.duration)/(next.start-s.start-s.duration));if(f<.9){const a=s.points.at(-1),b=next.points[0];tip=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f-30*Math.sin(f*Math.PI)];}}
  }
  for(const label of g.labels||[])if(t>=label.at){ctx.globalAlpha=clamp((t-label.at)/.25);wrap(ctx,label.text,label.x,label.y,label.maxWidth||800,label.size||42,(label.size||42)*1.3,label.weight||'650',label.color||'#24232b');ctx.globalAlpha=1;}
  const last=g.strokes.at(-1),exitAt=last?last.start+last.duration:Infinity;
  if(!tip&&t>=exitAt&&t<exitAt+.3){const u=(t-exitAt)/.3,a=last.points.at(-1);tip=[a[0]+160*u,a[1]+140*u];}
  if(tip&&options.hand!==false){
    const alpha=active?1:(t>=exitAt?1-clamp((t-exitAt)/.3):.85);
    if(options.handImage){
      const im=options.handImage,k=options.handScale||.30,a=options.handAnchor||[175,157];
      ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,tip[0]-a[0]*k,tip[1]-a[1]*k,im.width*k,im.height*k);ctx.restore();
    }else hand(ctx,tip,alpha);
  }
  if(options.caption){const text=options.caption;ctx.fillStyle='#faf8fd';ctx.beginPath();ctx.roundRect(65,1510,950,285,28);ctx.fill();wrap(ctx,text,540,1550,840,46,64,'550');}
  if(options.footer!==false&&g.footer&&t>=g.footerAt)wrap(ctx,g.footer,540,1320,880,42,56,'750',g.accent||'#7155bd');
  ctx.restore();return {tip:tip,active:!!active};
}
export {prepare,sample,frame,hand,captionGroups};

