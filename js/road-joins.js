// Bevel the common node between separately imported road ribbons. Butt ends
// leave triangular outer-edge notches when the OSM way changes at a bend.
export function roadJoinRings(net){
 const result=[],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let node=0;node<net.inc.length;node++){
  const arms=net.inc[node];if(arms.length<2)continue;const points=[],directions=[];
  for(const {e,dir}of arms){
   const i=dir>0?0:e.n-1,j=dir>0?1:e.n-2,dx=e.px[j]-e.px[i],dz=e.pz[j]-e.pz[i],length=Math.hypot(dx,dz);if(length<.001)continue;
   directions.push({e,u:[dx/length,dz/length],p:[e.px[i],e.pz[i]]});
   const h=e.way.w/2;for(const side of [-1,1])points.push([e.px[i]+dz/length*h*side,e.pz[i]-dx/length*h*side]);
  }
  // A width change on a continuing road needs a short shoulder taper, not
  // a perpendicular step. Keep endpoints and centreline data untouched.
  if(directions.length===2){
   const [a,b]=directions.sort((a,b)=>a.e.way.w-b.e.way.w);
   const difference=(b.e.way.w-a.e.way.w)/2,dot=a.u[0]*b.u[0]+a.u[1]*b.u[1];
   // Round the outer shoulder at a two-arm bend. The arc stays within
   // the declared half-width of the common node, rather than a square pad.
   if(difference<=.1&&dot<.5&&dot>-.9999){
    const h=Math.min(a.e.way.w,b.e.way.w)/2;
    for(const side of [-1,1]){
     const start=Math.atan2(-a.u[0]*side,a.u[1]*side),end=Math.atan2(b.u[0]*side,-b.u[1]*side);
     const sweep=Math.atan2(Math.sin(end-start),Math.cos(end-start)),steps=Math.max(2,Math.ceil(Math.abs(sweep)/.15));
     const ring=[a.p];for(let k=0;k<=steps;k++){const angle=start+sweep*k/steps;ring.push([a.p[0]+h*Math.cos(angle),a.p[1]+h*Math.sin(angle)]);}result.push({node,ring});
    }
   }
   if(difference>.1&&dot<-.85){
    const d=Math.min(6,difference*3,a.e.len*.25),h=a.e.way.w/2;
    for(const side of [-1,1]){
     const start=[b.p[0]-b.u[1]*b.e.way.w/2*side,b.p[1]+b.u[0]*b.e.way.w/2*side];
     const end=[a.p[0]+a.u[0]*d+a.u[1]*h*side,a.p[1]+a.u[1]*d-a.u[0]*h*side];
     const ring=[a.p,start];
     for(let k=1;k<=8;k++){const t=k/8,m=1-t;ring.push([0,1].map(j=>m*m*m*start[j]+3*m*m*t*(start[j]+a.u[j]*d/3)+3*m*t*t*(end[j]-a.u[j]*d/3)+t*t*t*end[j]));}
     ring.push([a.p[0]+a.u[0]*d,a.p[1]+a.u[1]*d]);result.push({node,ring});
    }
   }
  }
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const hull=[];for(const p of points){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=1e-8)hull.pop();hull.push(p);}const lower=hull.length;
  for(let i=points.length-2;i>=0;i--){const p=points[i];while(hull.length>lower&&cross(hull.at(-2),hull.at(-1),p)<=1e-8)hull.pop();hull.push(p);}hull.pop();
  if(hull.length>=3)result.push({node,ring:hull});
 }
 return result;
}
