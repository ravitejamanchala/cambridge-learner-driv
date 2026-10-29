// Geometry-only road clearance, shared with the learner import adapter. Units: metres.
const CELL=50,EPS=1e-7;
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function pointDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function segmentDistance(a,b,c,d){if(cross(a,b,c)*cross(a,b,d)<=EPS&&cross(c,d,a)*cross(c,d,b)<=EPS&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+EPS&&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))+EPS)return 0;return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;}return yes;}
export function buildingRings(o){
 const footprint=o.properties?.footprint;let rings;
 if(footprint?.length>=3){const xs=footprint.map(p=>p.x),zs=footprint.map(p=>p.z),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,w=Math.max(.01,Math.max(...xs)-Math.min(...xs)),d=Math.max(.01,Math.max(...zs)-Math.min(...zs));rings=[footprint,...(o.properties.holes||[])].map(r=>r.map(p=>({x:(p.x-cx)/w*o.sx,z:(p.z-cz)/d*o.sz})));}
 else rings=[[{x:-o.sx/2,z:-o.sz/2},{x:o.sx/2,z:-o.sz/2},{x:o.sx/2,z:o.sz/2},{x:-o.sx/2,z:o.sz/2}]];
 const c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0);return rings.map(r=>r.map(p=>({x:o.x+c*p.x+s*p.z,z:o.z-s*p.x+c*p.z})));
}
export function roadClearanceIndex(network,margin=.25){
 const grid=new Map();for(let ei=0;ei<network.edges.length;ei++){const edge=network.edges[ei],radius=network.ways[edge[2]][5]/2+margin,f=edge[3];for(let i=2;i<f.length;i+=2){const a={x:f[i-2]/10,z:f[i-1]/10},b={x:f[i]/10,z:f[i+1]/10},segment={a,b,radius,edge:ei};for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++){const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segment);}}}
 return o=>{
  if(o.type!=='building'||o.y>=3)return [];
  const rings=buildingRings(o),outer=rings[0],xs=outer.map(p=>p.x),zs=outer.map(p=>p.z),candidates=new Set(),hits=new Set();
  for(let x=Math.floor(Math.min(...xs)/CELL);x<=Math.floor(Math.max(...xs)/CELL);x++)for(let z=Math.floor(Math.min(...zs)/CELL);z<=Math.floor(Math.max(...zs)/CELL);z++)for(const segment of grid.get(x+':'+z)||[])candidates.add(segment);
  const solid=p=>inside(p,outer)&&!rings.slice(1).some(h=>inside(p,h));
  for(const {a,b,radius,edge}of candidates){if(hits.has(edge))continue;if(solid(a)||solid(b)||rings.some(r=>r.some((p,i)=>segmentDistance(a,b,p,r[(i+1)%r.length])<=radius+EPS)))hits.add(edge);}
  return [...hits];
 };
}
export function clearRoadBuildings(track,margin=.25){
 const overlaps=roadClearanceIndex(track.network,margin),removed=[],objects=[];
 for(const object of track.objects){const edges=overlaps(object);if(edges.length)removed.push({object:structuredClone(object),edges});else objects.push(object);}
 const excluded=[...(track.buildingClearance?.excluded||[])],ids=new Set(excluded.map(e=>e.object.id));for(const entry of removed)if(!ids.has(entry.object.id)){excluded.push(entry);ids.add(entry.object.id);}
 return {...track,objects,buildingClearance:{version:1,margin,excluded,removedThisPass:removed.length}};
}
