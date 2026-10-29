import {correctApproaches} from './junction-approaches.js';
import {joinMappedPaths} from './path-joins.js';
import {buildNet,nearest,posAt} from './net.js';
import {roadSpace,roadsidePosition,insideRing,pointSegment,solidOverlap,invalidateRoadSpace} from './road-space.js';
// Local object footprint in world metres, including holes and authored transforms.
export function objectRings(o){
 const f=o.properties?.footprint;let rings;
 if(f?.length>=3){const xs=f.map(p=>p.x),zs=f.map(p=>p.z),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,w=Math.max(.01,Math.max(...xs)-Math.min(...xs)),d=Math.max(.01,Math.max(...zs)-Math.min(...zs));rings=[f,...(o.properties.holes||[])].map(r=>r.map(p=>[(p.x-cx)/w*o.sx,(p.z-cz)/d*o.sz]));}
 else rings=[[[-o.sx/2,-o.sz/2],[o.sx/2,-o.sz/2],[o.sx/2,o.sz/2],[-o.sx/2,o.sz/2]]];
 const c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0);return rings.map(r=>r.map(([x,z])=>[o.x+c*x+s*z,o.z-s*x+c*z]));
}
export const roadObstacle=o=>['building','scenery','light','sign'].includes(o.type)&&(o.y||0)<3;
export function objectBlocker(objects){
 const grid=new Map(),CELL=40;
 for(const o of objects.filter(roadObstacle)){
  const rings=objectRings(o),xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]),entry={id:o.id,rings};
  for(let x=Math.floor(Math.min(...xs)/CELL);x<=Math.floor(Math.max(...xs)/CELL);x++)for(let z=Math.floor(Math.min(...zs)/CELL);z<=Math.floor(Math.max(...zs)/CELL);z++){const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(entry);}
 }
 return (x,z,r=0,skip)=>{const p=[x,z],entries=new Set();for(let a=Math.floor((x-r)/CELL);a<=Math.floor((x+r)/CELL);a++)for(let b=Math.floor((z-r)/CELL);b<=Math.floor((z+r)/CELL);b++)for(const e of grid.get(a+':'+b)||[])entries.add(e);return [...entries].some(e=>e.id!==skip&&((insideRing(p,e.rings[0])&&!e.rings.slice(1).some(h=>insideRing(p,h)))||e.rings.some(h=>h.some((a,i)=>pointSegment(p,a,h[(i+1)%h.length])<=r))));};
}
export function fitRoadCorners(net,objects){
 if(net.roadCornerFit)return;net.roadCornerFit=true;
 const buildings=objects.filter(o=>o.type==='building'&&(o.y||0)<3).map(o=>{const rings=objectRings(o),xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]);return {rings,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};});
 const fitted=[];let adjusted=0;
 for(const f of net.fillets){
  const close=buildings.filter(b=>b.minX<f.C[0]+f.R+1&&b.maxX>f.C[0]-f.R-1&&b.minZ<f.C[1]+f.R+1&&b.maxZ>f.C[1]-f.R-1);
  let found=false;
  for(const scale of [1,.8,.6,.4,.2]){
   const pts=f.pts.map(p=>[f.C[0]+(p[0]-f.C[0])*scale,f.C[1]+(p[1]-f.C[1])*scale]);
   if(close.some(b=>pts.slice(1).some((p,i)=>solidOverlap(b.rings,[f.C,pts[i],p],.4))))continue;
   fitted.push({...f,pts,R:f.R*scale,A:pts[0],B:pts.at(-1)});if(scale<1)adjusted++;found=true;break;
  }
  if(!found)adjusted++;
 }
 net.fillets=fitted;net.adjustedCorners=adjusted;invalidateRoadSpace(net);
}
const MOVABLE=new Set(['tree','lamp','bench','bin','postBox','bicycleParking','busStop','sign']);
export function clearRoadside(track,{margin=.35}={}){
 const rejectedSignals=track.osm?track.network.stops.filter(s=>track.network.ways[track.network.edges[s[0]][2]][4]&&s[2]<0):[];
 let network=rejectedSignals.length?{...track.network,stops:track.network.stops.filter(s=>!rejectedSignals.includes(s))}:track.network;
 let net=buildNet(network,{tidyLines:false});fitRoadCorners(net,track.objects);const approaches=correctApproaches(network,net);network=approaches.network;if(approaches.changes.length){net=buildNet(network,{tidyLines:false});fitRoadCorners(net,track.objects);}const space=roadSpace(net),objects=[],adjustments=[],excluded=[],blocked=objectBlocker(track.objects),placed=[];
 for(const source of joinMappedPaths(track.objects)){
  if(!roadObstacle(source)){objects.push(source);continue;}
  const hits=[...new Set(space.overlaps(objectRings(source),source.type==='building'?0:margin))];if(!hits.length){objects.push(source);continue;}
  const movable=MOVABLE.has(source.properties?.mapFeature)||['light','sign'].includes(source.type),near=movable&&nearest(net,source.x,source.z);
  const radius=Math.hypot(source.sx,source.sz)/2;
  const p=near&&posAt(near.e,near.s),safe=p&&roadsidePosition(net,{...p,w:near.way.w},{radius,side:near.lat<0?-1:1,blocked:(x,z,r)=>Math.hypot(x-source.x,z-source.z)>15||blocked(x,z,r,source.id)||placed.some(o=>Math.hypot(x-o.x,z-o.z)<r+o.radius+.3)});
  if(safe){const o=structuredClone(source);o.x=safe.x;o.z=safe.z;o.properties.roadsideAdjustment={original:{x:source.x,z:source.z},reason:'carriageway or junction overlap',estimated:true};objects.push(o);placed.push({...safe,radius});adjustments.push({id:o.id,from:{x:source.x,z:source.z},to:safe,roads:hits});}
  else excluded.push({object:structuredClone(source),roads:hits,reason:'No clear roadside position within 15 m; source retained for recovery'});
 }
 const previous=track.roadsideClearance||{},archive=[...(previous.excluded||[])],ids=new Set(archive.map(e=>e.object.id));for(const e of excluded)if(!ids.has(e.object.id)){archive.push(e);ids.add(e.object.id);}
 const counts={};for(const o of objects)if(o.properties?.mapFeature)counts[o.properties.mapFeature]=(counts[o.properties.mapFeature]||0)+1;
 return {...track,...(track.mapFeatures?{mapFeatures:{...track.mapFeatures,counts}}:{}),network,objects,roadsideClearance:{version:1,margin,approaches:[...(previous.approaches||[]),...approaches.changes],unresolvedApproaches:approaches.unresolved,adjustedCorners:net.adjustedCorners,excludedSignals:[...(previous.excludedSignals||[]),...rejectedSignals],signalsRemovedThisPass:rejectedSignals.length,adjustments:[...(previous.adjustments||[]),...adjustments],excluded:archive,movedThisPass:adjustments.length,excludedThisPass:excluded.length}};
}
