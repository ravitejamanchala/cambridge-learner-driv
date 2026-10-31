import {roadJoinRings} from './road-joins.js';
import {ribbon} from './road-ribbon.js';
// The rendered carriageway, including every intersecting arm and rounded corner.
// A nearest-centreline query alone cannot describe a junction's free space.
const cache=new WeakMap(),CELL=40,EPS=1e-7;
export function insideRing(p,r){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function pointSegment(p,a,b){const x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*z)/(x*x+z*z||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*z);}
function segments(a,b,c,d){const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(cross(a,b,c)*cross(a,b,d)<=EPS&&cross(c,d,a)*cross(c,d,b)<=EPS&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+EPS&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+EPS)return 0;return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));}
export const invalidateRoadSpace=net=>cache.delete(net);
export function solidOverlap(rings,poly,margin=0){const outer=rings[0],solid=p=>insideRing(p,outer)&&!rings.slice(1).some(h=>insideRing(p,h));return outer.some(v=>insideRing(v,poly))||poly.some(solid)||rings.some(r=>r.some((a,i)=>poly.some((b,j)=>segments(a,r[(i+1)%r.length],b,poly[(j+1)%poly.length])<=margin+EPS)));}
export const ringArea=r=>Math.abs(r.reduce((s,p,i)=>s+p[0]*r[(i+1)%r.length][1]-p[1]*r[(i+1)%r.length][0],0))/2;
export function ribbonRings(e,offset=0){const rings=[];ribbon({quad:(...v)=>{const r=[];for(let i=0;i<8;i+=2){const p=[Math.round(v[i]*1e4)/1e4,Math.round(v[i+1]*1e4)/1e4];if(!r.length||p[0]!==r.at(-1)[0]||p[1]!==r.at(-1)[1])r.push(p);}if(r.length>=3&&ringArea(r)>.00001)rings.push(r);}},e,-e.way.w/2-offset,e.way.w/2+offset,0);return rings;}
export function roadSpace(net){
 if(cache.has(net))return cache.get(net);
 const patches=[],grid=new Map();
 const add=(ring,edge)=>{if(ringArea(ring)<.00001)return;const p={ring,edge,minX:Math.min(...ring.map(p=>p[0])),maxX:Math.max(...ring.map(p=>p[0])),minZ:Math.min(...ring.map(p=>p[1])),maxZ:Math.max(...ring.map(p=>p[1]))};patches.push(p);for(let x=Math.floor(p.minX/CELL);x<=Math.floor(p.maxX/CELL);x++)for(let z=Math.floor(p.minZ/CELL);z<=Math.floor(p.maxZ/CELL);z++){const k=x+':'+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}};
 for(const e of net.edges)for(const r of ribbonRings(e))add(r,e.id);
 for(const j of roadJoinRings(net))add(j.ring,'join:'+j.node);
 for(const f of net.fillets)for(let i=1;i<f.pts.length;i++)add([f.C,f.pts[i-1],f.pts[i]],'junction:'+f.node);
 const nearby=(x0,z0,x1,z1)=>{const found=new Set();for(let x=Math.floor(x0/CELL);x<=Math.floor(x1/CELL);x++)for(let z=Math.floor(z0/CELL);z<=Math.floor(z1/CELL);z++)for(const p of grid.get(x+':'+z)||[])found.add(p);return [...found].filter(p=>p.minX<=x1&&p.maxX>=x0&&p.minZ<=z1&&p.maxZ>=z0);};
 const disk=(x,z,r=0)=>nearby(x-r,z-r,x+r,z+r).some(p=>insideRing([x,z],p.ring)||p.ring.some((v,i)=>pointSegment([x,z],v,p.ring[(i+1)%p.ring.length])<=r+EPS));
 const overlaps=(rings,margin=0)=>{const r=rings[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]),solid=p=>insideRing(p,r)&&!rings.slice(1).some(h=>insideRing(p,h));return nearby(Math.min(...xs)-margin,Math.min(...zs)-margin,Math.max(...xs)+margin,Math.max(...zs)+margin).filter(p=>solidOverlap(rings,p.ring,margin)).map(p=>p.edge);};
 const result={patches,nearby,disk,overlaps};cache.set(net,result);return result;
}
export function roadsidePosition(net,feature,{radius=.4,side=1,sideOnly=false,blocked=()=>false}={}){
 const space=roadSpace(net),nx=feature.tz,nz=-feature.tx;
 // Never fall back to an unsafe point if every candidate fails.
 for(const sd of (sideOnly?[side]:[side,-side]))for(const extra of [0,.75,1.5,2.5,4,6])for(const back of [0,1.5,3,5,8,12]){
  const off=sd*(feature.w/2+.8+radius+extra),x=feature.x+nx*off-feature.tx*back,z=feature.z+nz*off-feature.tz*back;
  if(!space.disk(x,z,radius+.35)&&!net.cycleRings.some(r=>Math.abs(Math.hypot(x-r.x,z-r.z)-r.r)<1.8+radius)&&!blocked(x,z,radius))return {x,z};
 }
 return null;
}
