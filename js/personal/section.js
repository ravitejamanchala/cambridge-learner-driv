import {convertOSM} from './geo/osm.js';
import {boundsCheck,measure,at,project} from './geometry.js';
import {prepareEditorTrack} from '../editor-routing.js';
import {buildNet,buildRoute,nearest,along,laneCentre} from '../net.js';
const object=(type,x=0,z=0)=>({id:crypto.randomUUID(),type,name:type,x,z,y:0,rotation:0,sx:type==='building'?12:2,sy:type==='building'?10:1,sz:type==='building'?12:2,properties:{}});
const makeTrack=network=>({version:1,title:'Personal route',kind:'mock',network,objects:[],plan:{waypoints:[]},spawn:{x:0,z:0,heading:0},attribution:'© OpenStreetMap contributors (ODbL) · Routing: OSRM'});
export function generateSection(data,part) {
  if(data?.remark)throw Error('The map provider returned an incomplete section. Please retry.');
  const track=convertOSM(data,part.bounds,{boundsCheck,makeTrack,object}),selected=measure(part.coordinates),net=buildNet(track.network);
  const points=[];
  // Dense checks prevent a route falling across an unmapped road or river; do not
  // synthesize a straight connecting road when two provider datasets disagree.
  for(let s=0;s<selected.length;s+=12)points.push(at(selected,s));points.push(at(selected,selected.length));
  const hits=points.map(p=>{const q=project(net,p);return nearest(net,q.x,q.z);});
  if(hits.some(h=>!h||h.d>12))throw Error('The road map does not cover this route section yet. Try moving a pin or retrying later.');
  track.plan.waypoints=points.filter((_,i)=>i%2===0||i===points.length-1).map(p=>({...project(net,p),road:''}));
  const prepared=prepareEditorTrack(track),navigation=buildNet(prepared.network),route=buildRoute(navigation,prepared.nodes);
  if(!Number.isFinite(route.len)||route.len<selected.length*.75||route.len>selected.length*1.3+25)throw Error('The route and road map disagree at this junction. Move a pin or retry later.');
  // Also reject large detours between nearby anchors on disconnected carriageways.
  for(let i=0;i<route.xs.length;i++){
    let closest=Infinity;for(const p of points){const q=project(net,p);closest=Math.min(closest,Math.hypot(q.x-route.xs[i],q.z-route.zs[i]));}
    if(closest>22)throw Error('This route section cannot be matched reliably to the road map. Please choose another route.');
  }
  const first=route.steps[0],spawn=along(first.e,Math.min(1,first.e.len/4),first.dir,laneCentre(first.e,first.dir,0));
  track.spawn={x:spawn.x,z:spawn.z,heading:Math.atan2(-spawn.tx,-spawn.tz)};
  track.buildingStyle='simulator';track.practiceMode='experimental';
  track.section={...part,coordinates:undefined};
  return {...track,renderNetwork:track.network,network:prepared.network,plan:{...track.plan,waypoints:prepared.waypoints,nodes:prepared.nodes}};
}
