import {convertOSM} from './geo/osm.js';
import {boundsCheck,measure,at,project} from './geometry.js';
import {prepareEditorTrack} from '../editor-routing.js';
import {buildNet,buildRoute,nearest,along,laneCentre} from '../net.js';
import {joinedRoadSurfaces} from '../road-surfaces.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
import {fitRoadCorners} from '../roadside-clearance.js';
const object=(type,x=0,z=0)=>({id:crypto.randomUUID(),type,name:type,x,z,y:0,rotation:0,sx:type==='building'?12:2,sy:type==='building'?10:1,sz:type==='building'?12:2,properties:{}});
const makeTrack=network=>({version:1,title:'Personal route',kind:'mock',network,objects:[],plan:{waypoints:[]},spawn:{x:0,z:0,heading:0},attribution:'© OpenStreetMap contributors (ODbL) · Routing: OSRM'});
export function generateSection(data,part) {return generate(data,part,false);}
export function generateRoute(data,part) {return generate(data,part,true);}
function generate(data,part,whole) {
  if(data?.remark)throw Error('The map provider returned an incomplete section. Please retry.');
  const check=whole?b=>{if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<-85||b[2]>85||b[1]<-180||b[3]>180||b[0]>=b[2]||b[1]>=b[3])throw Error('Invalid route bounds.');}:boundsCheck;
  const limits=whole?{elements:600000,edges:150000,nodes:600000,objects:100000,extent:20000000,coordinate:20000000}:{};
  const track=convertOSM(data,part.bounds,{boundsCheck:check,makeTrack,object,limits}),selected=measure(part.coordinates),net=buildNet(track.network);
  const points=[];
  // Dense checks prevent a route falling across an unmapped road or river; do not
  // synthesize a straight connecting road when two provider datasets disagree.
  for(let s=0;s<selected.length;s+=12)points.push(at(selected,s));points.push(at(selected,selected.length));
  const projected=points.map(p=>project(net,p)),hits=projected.map(q=>nearest(net,q.x,q.z));
  if(hits.some(h=>!h||h.d>12))throw Error('The road map does not cover this route section yet. Try moving a pin or retrying later.');
  track.plan.waypoints=points.filter((_,i)=>i%2===0||i===points.length-1).map(p=>({...project(net,p),road:''}));
  const prepared=prepareEditorTrack(track),navigation=buildNet(prepared.network),route=buildRoute(navigation,prepared.nodes);
  if(!Number.isFinite(route.len)||route.len<selected.length*.75||route.len>selected.length*1.3+25)throw Error('The route and road map disagree at this junction. Move a pin or retry later.');
  // Also reject large detours between nearby anchors on disconnected carriageways.
  const cells=new Map(),key=(x,z)=>Math.floor(x/32)+':'+Math.floor(z/32);
  for(const p of projected){const k=key(p.x,p.z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);}
  for(let i=0;i<route.xs.length;i++){
    const x=route.xs[i],z=route.zs[i];let closest=Infinity;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of cells.get(key(x+dx*32,z+dz*32))||[])closest=Math.min(closest,Math.hypot(q.x-x,q.z-z));
    if(closest>22)throw Error('This route section cannot be matched reliably to the road map. Please choose another route.');
  }
  const first=route.steps[0],spawn=along(first.e,Math.min(1,first.e.len/4),first.dir,laneCentre(first.e,first.dir,0));
  track.spawn={x:spawn.x,z:spawn.z,heading:Math.atan2(-spawn.tx,-spawn.tz)};
  track.buildingStyle='simulator';track.practiceMode='experimental';
  if(whole){track.renderTiles=true;track.sourceSections=part.sourceSections;applyMappedRoadTags(net,track.osm?.ways);fitRoadCorners(net,track.objects);track.surfaceTiles=joinedRoadSurfaces(net,track.objects);}
  else track.section={...part,coordinates:undefined};
  return {...track,renderNetwork:track.network,network:prepared.network,plan:{...track.plan,waypoints:prepared.waypoints,nodes:prepared.nodes}};
}
