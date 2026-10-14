// FACIUP Whiteboard: semantic design is saved per scene; actual vector strokes, no raster tracing.
export const WB_KINDS_ = ['bulb','person','people','book','paper','pen','heart','clock','calendar','house','battery','bag','shoe','compass','hourglass','magnifier','check','cross','arrow','filter','tree','plant','phone','laptop','cloud','sun','mountain','cup','target','shield','key','custom'];
export function cleanWhiteboard(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) return null;
  var objects = raw.objects.filter(function(o){return o && WB_KINDS_.indexOf(o.kind)>=0;}).slice(0,7).map(function(o){
    var n=function(v,d,a,b){v=Number(v);return isFinite(v)?Math.max(a,Math.min(b,v)):d;};
    var q={kind:o.kind,x:n(o.x,.5,.12,.88),y:n(o.y,.5,.12,.84),scale:n(o.scale,1,.45,1.6),label:String(o.label||'').slice(0,60),color:/^#[\da-f]{6}$/i.test(o.color||'')?o.color:null};
    if(o.kind==='arrow'){q.to=[n((o.to||[])[0],.6,.1,.9),n((o.to||[])[1],.6,.1,.88)];}
    if(o.kind==='custom'){
      q.paths=(Array.isArray(o.paths)?o.paths:[]).slice(0,20).map(function(p){
        var points=(Array.isArray(p.points)?p.points:[]).slice(0,100).filter(function(v){return Array.isArray(v)&&v.length===2&&v.every(function(x){return typeof x==='number'&&isFinite(x)&&Math.abs(x)<=150;});});
        return {points:points,closed:p.closed===true,fill:/^#[\da-f]{6}$/i.test(p.fill||'')?p.fill:null};
      }).filter(function(p){return p.points.length>=2;});
      if(!q.paths.length)return null;
    }return q;
  }).filter(Boolean);
  if(!objects.length)return null;
  return {version:1,title:String(raw.title||'').slice(0,90),meaning:String(raw.meaning||'').slice(0,240),objects:objects};
}
