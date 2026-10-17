/** Bounded declarative geometry; no scripts, remote assets or SVG markup. */
export function validVector(it:any):boolean {
  return Array.isArray(it?.paths) && it.paths.length>0 && it.paths.length<=24 &&
    it.paths.every((path:any)=>Array.isArray(path)&&path.length>=2&&path.length<=160&&path.every((p:any)=>Array.isArray(p)&&p.length===2&&p.every((n:any)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100))) &&
    it.paths.reduce((n:number,p:any)=>n+p.length,0)<=1200;
}
