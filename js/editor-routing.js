import {buildNet,nearest,along} from './net.js';
// Adapt authored waypoints to the native graph without moving them to unrelated junctions.
// Split only a runtime copy of native edges; exports and stored revisions stay untouched.
export function prepareEditorTrack(track){
 const network=structuredClone(track.network),net=buildNet(network),cuts=new Map(),anchors=[];
 for(const waypoint of track.plan.waypoints){
  const hint=waypoint.road&&network.names.includes(waypoint.road)?waypoint.road:null;
  let hit=nearest(net,waypoint.x,waypoint.z);
  if(hint&&hit?.way.name!==hint){
   hit=null;for(const edge of net.edges){if(edge.way.name!==hint)continue;for(let i=0;i<edge.n-1;i++){const dx=edge.px[i+1]-edge.px[i],dz=edge.pz[i+1]-edge.pz[i],length=Math.hypot(dx,dz);if(!length)continue;const u=Math.max(0,Math.min(1,((waypoint.x-edge.px[i])*dx+(waypoint.z-edge.pz[i])*dz)/(length*length))),d=Math.hypot(waypoint.x-edge.px[i]-u*dx,waypoint.z-edge.pz[i]-u*dz);if(!hit||d<hit.d)hit={e:edge,s:edge.cum[i]+u*length,d};}}
  }
  if(!hit||hit.d>50)throw Error('A route waypoint is more than 50 metres from its road');
  const edge=hit.e;let node;
  if(hit.s<.2)node=edge.a;else if(edge.len-hit.s<.2)node=edge.b;
  else{
   let list=cuts.get(edge.id);if(!list)cuts.set(edge.id,list=[]);
   let cut=list.find(c=>Math.abs(c.s-hit.s)<.1);
   if(!cut){const p=along(edge,hit.s,1,0);cut={s:hit.s,node:network.nodes.length/2};network.nodes.push(p.x*10,p.z*10);list.push(cut);}node=cut.node;
  }
  anchors.push(node);
 }
 const edges=[],parts=new Map();
 for(const edge of net.edges){
  const stops=[{s:0,node:edge.a},...(cuts.get(edge.id)||[]).sort((a,b)=>a.s-b.s),{s:edge.len,node:edge.b}],segments=[];
  for(let i=0;i<stops.length-1;i++){
   const a=stops[i],b=stops[i+1],start=along(edge,a.s,1,0),end=along(edge,b.s,1,0),points=[start.x*10,start.z*10];
   for(let j=1;j<edge.n-1;j++)if(edge.cum[j]>a.s+.0001&&edge.cum[j]<b.s-.0001)points.push(edge.px[j]*10,edge.pz[j]*10);
   points.push(end.x*10,end.z*10);segments.push({id:edges.length,start:a.s,end:b.s});edges.push([a.node,b.node,network.edges[edge.id][2],points]);
  }
  parts.set(edge.id,segments);
 }
 for(const key of ['stops','zebras','giveways'])network[key]=network[key].map(row=>{const s=row[1]/10,list=parts.get(row[0]),back=key!=='zebras'&&row[2]===-1,part=list.find(p=>back?s<p.end-.0001:s<=p.end+.0001)||list.at(-1);return [part.id,Math.max(0,s-part.start)*10,...row.slice(2)];});
 if(network.arrows)network.arrows=network.arrows.map(([id,dir,...codes])=>[(dir===-1?parts.get(id)[0]:parts.get(id).at(-1)).id,dir,...codes]);
 network.edges=edges;
 return {network,nodes:anchors,waypoints:anchors.map((node,i)=>({...track.plan.waypoints[i],x:network.nodes[node*2]/10,z:network.nodes[node*2+1]/10,road:''}))};
}
