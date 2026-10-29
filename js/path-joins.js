const PATHS=new Set(['footway','cycleway','path','pedestrian','steps','bridleway']);
// Existing native segment objects remain individually editable. Shared end
// vertices replace butt-ended boxes; no new track format or route edges.
export function joinMappedPaths(objects){
 const ends=new Map(),segments=new Map();
 for(const o of objects){
  if(o.type!=='marking'||!PATHS.has(o.properties?.mapFeature)||o.properties.footprint?.length||!o.properties.sourceId)continue;
  const d=[Math.sin(o.rotation||0),Math.cos(o.rotation||0)],a=[o.x-d[0]*o.sz/2,o.z-d[1]*o.sz/2],b=[o.x+d[0]*o.sz/2,o.z+d[1]*o.sz/2];
  const segment={o,a,b,d};segments.set(o.id,segment);
  for(const [p,u,end]of [[a,d,0],[b,[-d[0],-d[1]],1]]){
   const key=o.properties.sourceId+':'+o.properties.mapFeature+':'+Math.round(p[0]*100)+':'+Math.round(p[1]*100);
   if(!ends.has(key))ends.set(key,[]);ends.get(key).push({segment,p,u,end});
  }
 }
 for(const entries of ends.values()){
  if(entries.length!==2)continue;
  const [a,b]=entries;if(a.segment===b.segment||Math.abs(a.segment.o.sx-b.segment.o.sx)>.01)continue;
  const dot=a.u[0]*b.u[0]+a.u[1]*b.u[1];if(dot>.95)continue;
  const h=a.segment.o.sx/2,den=1-dot;
  let x=(a.u[1]-b.u[1])*h/den,z=(-a.u[0]+b.u[0])*h/den;
  const limit=Math.min(h*4,a.segment.o.sz*.45,b.segment.o.sz*.45),length=Math.hypot(x,z);
  if(length>limit){x*=limit/length;z*=limit/length;}
  const plus=[a.p[0]+x,a.p[1]+z],minus=[a.p[0]-x,a.p[1]-z];
  a.segment['join'+a.end]=[plus,minus];b.segment['join'+b.end]=[minus,plus];
 }
 return objects.map(o=>{
  const s=segments.get(o.id);if(!s||(!s.join0&&!s.join1))return o;
  const h=o.sx/2,n=[s.d[1]*h,-s.d[0]*h];
  const a=s.join0||[[s.a[0]+n[0],s.a[1]+n[1]],[s.a[0]-n[0],s.a[1]-n[1]]];
  const b=s.join1||[[s.b[0]-n[0],s.b[1]-n[1]],[s.b[0]+n[0],s.b[1]+n[1]]];
  const ring=[...a,...b],xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  return {...o,x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,sx:Math.max(...xs)-Math.min(...xs),sz:Math.max(...zs)-Math.min(...zs),rotation:0,properties:{...o.properties,pathJoin:'shared-mitre-v1',sourceSegment:{x:o.x,z:o.z,sx:o.sx,sz:o.sz,rotation:o.rotation},footprint:ring.map(([x,z])=>({x,z}))}};
 });
}
