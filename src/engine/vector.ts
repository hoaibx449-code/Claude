import {flatten} from './svgpath.ts';
/** Bounded declarative geometry; no scripts, remote assets or SVG markup. */
function validPoints(paths:any):boolean {
  return Array.isArray(paths) && paths.length>0 && paths.length<=24 &&
    paths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=160&&path.every((p:any)=>Array.isArray(p)&&p.length===2&&p.every((n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))) &&
    paths.reduce((n:number,p:any)=>n+p.length,0)<=1200;
}
function validPath(d:any):boolean {
  if(typeof d!=='string'||d.length>6000||!/^M[\s\d.,MLCQHVZ]+$/.test(d))return false;
  const segments=[...d.matchAll(/([MLCQHVZ])([^MLCQHVZ]*)/g)];
  if(segments.length>120)return false;
  return segments.every(([,cmd,args])=>{
    const tokens=args.trim().split(/[\s,]+/).filter(Boolean),arity=({M:2,L:2,C:6,Q:4,H:1,V:1,Z:0} as Record<string,number>)[cmd];
    if(arity===0)return tokens.length===0;
    return tokens.length>=arity&&tokens.length%arity===0&&tokens.every(t=>/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)&&Number(t)<=100);
  });
}
export function validVector(it:any):boolean {return vectorPaths(it)!==null;}
export function vectorPaths(it:any):number[][][]|null {
  if(validPoints(it?.paths))return it.paths;
  if(!validPath(it?.d))return null;
  const paths=flatten(it.d,2).filter(p=>p.length>=2);if(!paths.length||paths.length>24)return null;
  const per=Math.min(160,Math.floor(1200/paths.length));
  return paths.map(p=>p.length<=per?p:Array.from({length:per},(_,i)=>p[Math.round(i*(p.length-1)/(per-1))]));
}
