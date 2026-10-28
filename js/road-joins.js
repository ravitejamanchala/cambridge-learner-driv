// Bevel the common node between separately imported road ribbons. Butt ends
// leave triangular outer-edge notches when the OSM way changes at a bend.
export function roadJoinRings(net){
 const result=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let node=0;node<net.inc.length;node++){
  const arms=net.inc[node];if(arms.length<2)continue;const points=[];
  for(const {e,dir}of arms){
   const i=dir>0?0:e.n-1,j=dir>0?1:e.n-2,dx=e.px[j]-e.px[i],dz=e.pz[j]-e.pz[i],length=Math.hypot(dx,dz);if(length<.001)continue;
   const h=e.way.w/2;for(const side of [-1,1])points.push([e.px[i]+dz/length*h*side,e.pz[i]-dx/length*h*side]);
  }
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const hull=[];for(const p of points){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=1e-8)hull.pop();hull.push(p);}const lower=hull.length;
  for(let i=points.length-2;i>=0;i--){const p=points[i];while(hull.length>lower&&cross(hull.at(-2),hull.at(-1),p)<=1e-8)hull.pop();hull.push(p);}hull.pop();
  if(hull.length>=3)result.push({node,ring:hull});
 }
 return result;
}
