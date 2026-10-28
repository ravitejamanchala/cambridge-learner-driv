import {posAt} from './net.js';
import {roadSpace,solidOverlap} from './road-space.js';
// A transverse stop/give-way line must be on its approach, outside the
// intersecting arms and rounded mouth. Geometry is shared with the road renderer.
export function approachBar(feature,back=0){
 const p=posAt(feature.e,feature.s-feature.dir*back),tx=p.tx*feature.dir,tz=p.tz*feature.dir;
 const lo=feature.e.way.oneway?-feature.w/2+.25:.2,hi=feature.w/2-.25;
 return [[lo,-.3],[hi,-.3],[hi,.3],[lo,.3]].map(([o,s])=>[p.x+tz*o+tx*s,p.z-tx*o+tz*s]);
}
export function approachConflicts(net,feature,back=0){
 const ring=approachBar(feature,back),xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
 return roadSpace(net).nearby(Math.min(...xs)-.5,Math.min(...zs)-.5,Math.max(...xs)+.5,Math.max(...zs)+.5).filter(p=>{
  if(p.edge===feature.e.id||String(p.edge).startsWith('join:'))return false;
  // A collinear continuation is the same approach, not a crossing arm.
  if(typeof p.edge==='number'){
   const e=net.edges[p.edge],a=posAt(e,e.len/2);
   if(Math.abs(a.tx*feature.tx+a.tz*feature.tz)>.94)return false;
  }
  return solidOverlap([ring],p.ring,.5);
 });
}
export function clearApproach(net,feature){
 if(!approachConflicts(net,feature).length)return feature.s;
 const available=feature.dir>0?feature.s:feature.e.len-feature.s;
 for(let back=.5;back<=Math.min(40,available-.6);back+=.5){
  if(!approachConflicts(net,feature,back).length)return Math.round((feature.s-feature.dir*back)*10)/10;
 }
 return null;
}
// OSM often splits one approach into short edges at control nodes. Continue
// backwards only through an unambiguous, legally connected arm of the same road.
export function resolveApproach(net,feature){
 let current=feature,travelled=0;const seen=new Set();
 for(let hop=0;hop<8;hop++){
  if(seen.has(current.e.id))return null;seen.add(current.e.id);
  const s=clearApproach(net,current);if(s!==null)return {...current,s};
  travelled+=current.dir>0?current.s:current.e.len-current.s;if(travelled>40)return null;
  const node=current.dir>0?current.e.a:current.e.b,at=posAt(current.e,current.dir>0?0:current.e.len);
  const candidates=net.inc[node].filter(a=>a.e!==current.e&&(!a.e.way.oneway||a.dir<0)&&a.e.way.name===current.e.way.name&&a.e.way.cls===current.e.way.cls).map(a=>{
   const dir=-a.dir,s=dir>0?a.e.len:0,p=posAt(a.e,s);
   return {e:a.e,s,dir,w:a.e.way.w,x:p.x,z:p.z,tx:p.tx*dir,tz:p.tz*dir,score:(at.tx*p.tx+at.tz*p.tz)*current.dir*dir};
  }).filter(a=>a.score>.7).sort((a,b)=>b.score-a.score);
  if(!candidates.length||(candidates[1]&&candidates[0].score-candidates[1].score<.15))return null;
  current=candidates[0];
 }
 return null;
}
export function correctApproaches(network,net){
 const changes=[],unresolved=[];
 const update=(rows,features,kind)=>rows.map((row,i)=>{
  const f=features[i],target=resolveApproach(net,f),s=target?.s;
  if(!target){unresolved.push({kind,index:i,edge:row[0],reason:'No clear approach on this edge'});return row;}
  if(target.e===f.e&&Math.abs(s-f.s)<.05)return row;
  const next=[...row];next[0]=target.e.id;next[1]=Math.round(s*10);next[2]=target.dir;changes.push({kind,index:i,from:[...row],to:next});return next;
 });
 const stops=update(network.stops,net.stops,'stops'),giveways=update(network.giveways,net.giveways,'giveways');
 return {network:changes.length?{...network,stops,giveways}:network,changes,unresolved};
}
