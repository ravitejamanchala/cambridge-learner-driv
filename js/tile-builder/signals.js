import {buildNet} from '../net.js';
// A mapped signal node may lie between two road edges. That does not mean it
// controls both directions. Apply the OSM direction before moving approach bars.
export function filterSignalApproaches(track,data){
 const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),net=buildNet(track.network,{tidyLines:false}),sources=[],stops=[];
 const crossingNodes=[...nodes.values()].filter(n=>n.tags?.crossing==='traffic_signals');
 let omitted=0;
 for(const st of net.stops){
  const ref=track.osm.edges[st.e.id],nodeId=ref?.[st.dir>0?'endOsmNode':'startOsmNode'],node=nodes.get(nodeId),tags=node?.tags||{},wayTags=track.osm.ways[track.network.edges[st.e.id][2]]?.tags||{};
  const reversed=String(wayTags['oneway:motorcar']??wayTags['oneway:motor_vehicle']??wayTags.oneway)==='-1',sourceDir=st.dir*(reversed?-1:1),direction=tags['traffic_signals:direction'];
  if(tags.traffic_signals==='pedestrian'||direction==='forward'&&sourceDir<0||direction==='backward'&&sourceDir>0){omitted++;continue;}
  if(!direction&&node&&net.inc[st.dir>0?st.e.b:st.e.a].length<=2){
   const x=(node.lon-net.origin[1])*net.kx,z=-(node.lat-net.origin[0])*net.kz;
   const near=crossingNodes.map(n=>({x:(n.lon-net.origin[1])*net.kx-x,z:-(n.lat-net.origin[0])*net.kz-z})).map(p=>({...p,d:Math.hypot(p.x,p.z)})).filter(p=>p.d>2&&p.d<25&&Math.abs((p.x*st.tx+p.z*st.tz)/p.d)>.85).sort((a,b)=>a.d-b.d)[0];
   if(near&&near.x*st.tx+near.z*st.tz<0){omitted++;continue;}
  }
  stops.push(track.network.stops[st.id]);sources.push({nodeId,sourceDirection:sourceDir,role:'vehicle'});
 }
 return {network:{...track.network,stops},sources,omitted};
}
export function sameSignalApproach(a,b){return a.role===b.role&&a.tx*b.tx+a.tz*b.tz>.94&&Math.abs((a.x-b.x)*a.tz-(a.z-b.z)*a.tx)<2&&Math.hypot(a.x-b.x,a.z-b.z)<4;}

// Follow the carriageway to its first nearby junction. A crossing coordinated
// with that junction reuses its vehicle approaches; a button is an input to a
// controller, not evidence that a separate controller/pair of lights exists.
export function crossingController(net,edge,s){
 const queue=[{v:edge.a,d:s,from:edge},{v:edge.b,d:edge.len-s,from:edge}],seen=new Set();
 while(queue.length){queue.sort((a,b)=>a.d-b.d);const {v,d,from}=queue.shift();if(d>35||seen.has(v))continue;seen.add(v);const arms=net.inc[v];
  if(arms.length>=3){const near=net.stops.filter(st=>Math.hypot(st.x-net.nx[v],st.z-net.nz[v])<35);if(near.some(a=>near.some(b=>Math.abs(a.tx*b.tx+a.tz*b.tz)<.85)))return {kind:'junction',node:v,approaches:near.map(st=>st.id)};continue;}
  for(const arm of arms)if(arm.e!==from)queue.push({v:arm.e.a===v?arm.e.b:arm.e.a,d:d+arm.e.len,from:arm.e});
 }
 return {kind:'standalone',node:null,approaches:[]};
}
