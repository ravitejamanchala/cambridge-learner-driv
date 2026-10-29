// Broad phase for immutable imported tracks. Query the swept vehicle envelope;
// the existing polygon/trunk collision test remains the final authority.
export function createObstacleIndex(objects,cell=32){
 const grid=new Map(),large=[],bounds=new WeakMap();
 for(const o of objects){
  if(!['building','scenery','sign','light'].includes(o.type))continue;
  const c=Math.abs(Math.cos(o.rotation||0)),s=Math.abs(Math.sin(o.rotation||0));
  const hx=(c*o.sx+s*o.sz)/2,hz=(s*o.sx+c*o.sz)/2,b={x0:o.x-hx,z0:o.z-hz,x1:o.x+hx,z1:o.z+hz};bounds.set(o,b);
  const x0=Math.floor(b.x0/cell),x1=Math.floor(b.x1/cell),z0=Math.floor(b.z0/cell),z1=Math.floor(b.z1/cell);
  if((x1-x0+1)*(z1-z0+1)>4096){large.push(o);continue;}
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(o);}
 }
 return {near(previous,current,radius=4){
  const x0=Math.min(previous.x,current.x)-radius,x1=Math.max(previous.x,current.x)+radius,z0=Math.min(previous.z,current.z)-radius,z1=Math.max(previous.z,current.z)+radius,found=new Set(large);
  for(let x=Math.floor(x0/cell);x<=Math.floor(x1/cell);x++)for(let z=Math.floor(z0/cell);z<=Math.floor(z1/cell);z++)for(const o of grid.get(x+':'+z)||[])found.add(o);
  return [...found].filter(o=>{const b=bounds.get(o);return b.x0<=x1&&b.x1>=x0&&b.z0<=z1&&b.z1>=z0;});
 }};
}
