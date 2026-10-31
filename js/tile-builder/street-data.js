import {sameSignalApproach,crossingController} from './signals.js';
import {yellowBoxPaint} from './markings.js';
import {lineDashes,giveWayDist,isJunction} from '../markings.js';
import {along,posAt,nearest,laneArrows} from '../net.js';
import {dash} from '../road-ribbon.js';
import {roadSpace,roadsidePosition} from '../road-space.js';
import {objectBlocker,objectRings} from '../roadside-clearance.js';
import {polygonOperation} from '../road-surfaces.js';

const integer=v=>/^\d+$/.test(String(v))&&Number(v)>0&&Number(v)<=12?Number(v):null;
const tokens=v=>typeof v==='string'?v.split('|'):null;
// OSM lane arrays run left-to-right in the driver's travel direction. The
// simulator reverses one-way=-1 geometry; source forward/backward still refer
// to the original OSM way and must not be swapped a second time.
export function laneLayout(tags,oneway){
 const total=integer(tags.lanes),forward=integer(tags['lanes:forward']),backward=integer(tags['lanes:backward']);
 if(oneway){const suffix=String(tags['oneway:motorcar']??tags['oneway:motor_vehicle']??tags.oneway)==='-1'?'backward':'forward',n=total||integer(tags['lanes:'+suffix])||integer(tokens(tags['turn:lanes:'+suffix]??tags['turn:lanes'])?.length);return n?{forward:n,backward:0,total:n}:null;}
 let f=forward||tokens(tags['turn:lanes:forward'])?.length,b=backward||tokens(tags['turn:lanes:backward'])?.length;
 if(total&&f&&!b)b=total-f;if(total&&b&&!f)f=total-b;if(total===2&&!f&&!b)f=b=1;
 if(!integer(f)||!integer(b)||(total&&f+b!==total))return null;
 return {forward:f,backward:b,total:f+b};
}
export function turnCode(value){const parts=value.split(';');if(parts.some(v=>!['left','through','right','none',''].includes(v)))return null;return ['left','through','right'].filter(v=>parts.includes(v)).map(v=>({left:'L',through:'S',right:'R'})[v]).join('');}
export function streetData(track,net,data,core,surface){
 const extent=core.flat(2).reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
 const inside=p=>p.x>=extent[0]&&p.z>=extent[1]&&p.x<=extent[2]&&p.z<=extent[3];
 const paint=[],arrows=[],texts=[],boxes=[],signs=[],signals=[],labels=[],guides=[],unknown=[],parking=[],restrictions=[],crossings=[],tactile=[],crossingPaint=[],crossingAreas=[];
 const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),project=n=>({x:(n.lon-net.origin[1])*net.kx,z:-(n.lat-net.origin[0])*net.kz});
 const blocked=objectBlocker(track.objects.filter(o=>o.type==='building')),space=roadSpace(net),source=track.osm.ways;
 const addQuad=(...v)=>{paint.push([Array.from({length:4},(_,i)=>[v[i*2],v[i*2+1]])]);};
 const rect=(p,w,l)=>{const nx=p.tz,nz=-p.tx;return [[-w/2,-l/2],[w/2,-l/2],[w/2,l/2],[-w/2,l/2]].map(([a,b])=>[p.x+nx*a+p.tx*b,p.z+nz*a+p.tz*b]);};
 const longest=new Map();let inferredPaint=0,inferredArrows=0;
 for(const e of net.edges){
  const tags=source[track.network.edges[e.id][2]]?.tags||{},layout=laneLayout(tags,e.way.oneway),reverse=String(tags['oneway:motorcar']??tags['oneway:motor_vehicle']??tags.oneway)==='-1';
  const midpoint=posAt(e,e.len/2);if(inside(midpoint)&&tags.name&&(!longest.has(tags.name)||longest.get(tags.name).len<e.len))longest.set(tags.name,{...midpoint,text:tags.name,len:e.len});
  if(e.way.oneway&&inside(midpoint))guides.push({...midpoint,kind:'oneway',sourceId:source[track.network.edges[e.id][2]]?.osmId});
  if(tags.lane_markings!=='no'&&tags.lane_markings!=='yes'&&e.way.w>=5&&!['service','living_street','track'].includes(e.way.cls)){for(const d of lineDashes(net,e)){dash({quad:addQuad},e,d.s,d.len,d.off,0,.07);inferredPaint++;}}
  if(tags.lane_markings==='yes'&&layout){
   const laneWidth=e.way.w/layout.total;
   for(let i=1;i<layout.total;i++){const off=e.way.w/2-i*laneWidth;for(let s=10;s<e.len-10;s+=7)dash({quad:addQuad},e,s,Math.min(3,e.len-10-s),off,0,.07);}
  }
  for(const dir of e.way.oneway?[1]:[1,-1]){
   const suffix=dir===1?(reverse?'backward':'forward'):'backward',n=layout?(dir===1?layout.forward:layout.backward):null;
   let turns=tokens(tags['turn:lanes:'+suffix]??(e.way.oneway?tags['turn:lanes']:undefined)),estimated=false;
   const approach=dir===1?e.b:e.a;if(!turns&&n>=2&&tags.lane_markings!=='no'&&isJunction(net,approach)){const codes=laneArrows(net,e,dir);if(codes?.length===n){turns=codes.map(c=>[...c].map(v=>({L:'left',S:'through',R:'right'})[v]).join(';'));estimated=true;}}
   const buses=tokens(tags['bus:lanes:'+suffix]??tags['psv:lanes:'+suffix]??(e.way.oneway?(tags['bus:lanes']??tags['psv:lanes']):undefined));
   if(!turns&&!buses)continue;
   if(!n||turns&&turns.length!==n||buses&&buses.length!==n){unknown.push('Lane count/direction mismatch on '+(tags.name||e.id));continue;}
   const laneWidth=e.way.w/layout.total;
   for(let lane=0;lane<n;lane++){
    const offset=e.way.w/2-(lane+.5)*laneWidth;
    for(const back of [18,48]){
     if(e.len<back+12)continue;const setback=giveWayDist(net,approach,e);if(e.len<back+setback+1)continue;const p=along(e,e.len-back-setback,dir,offset);if(!inside(p))continue;
     if(turns&&(isJunction(net,approach)||net.inc[approach].length!==2)){const code=turnCode(turns[lane]);if(code){arrows.push({...p,code,width:Math.min(1.1,laneWidth*.5),length:4.5,source:estimated?'simulator-guidance':'turn:lanes',estimatedPlacement:true});if(estimated)inferredArrows++;}else if(code===null)unknown.push('Unsupported turn marking: '+turns[lane]);}
     if(back===48&&buses&&['designated','only'].includes(buses[lane]))texts.push({...p,text:'BUS LANE',width:Math.min(2.4,laneWidth*.8),length:7,estimatedPlacement:true});
    }
   }
  }
 }
 labels.push(...longest.values());
 function lineAt(f,width=.35,broken=false){const p={x:f.x,z:f.z,tx:f.tx,tz:f.tz};const n=f.e.way.oneway?f.w:f.w/2;const q={...p,x:p.x+p.tz*(f.e.way.oneway?0:f.w/4),z:p.z-p.tx*(f.e.way.oneway?0:f.w/4)};const span=Math.max(.6,n-.5);if(broken){for(let a=-span/2;a<span/2;a+=.6){const len=Math.min(.3,span/2-a);paint.push([rect({...q,x:q.x+q.tz*(a+len/2),z:q.z-q.tx*(a+len/2)},len,width)]);}}else paint.push([rect(q,span,width)]);}
 for(const s of net.stops){if(!inside(s))continue;lineAt(s);const p=roadsidePosition(net,s,{blocked,sideOnly:true});if(p&&inside(p))signals.push({...p,tx:s.tx,tz:s.tz,role:'vehicle',sourceId:track.osm.signalSources[s.id]?.nodeId,estimatedPlacement:true});}
 for(const s of net.giveways){if(!inside(s))continue;lineAt(s,s.stop?.4:.2,!s.stop);if(!s.stop){lineAt({...s,x:s.x-s.tx*.6,z:s.z-s.tz*.6},.2,true);}const p=roadsidePosition(net,s,{blocked,sideOnly:true});if(p&&inside(p))signs.push({...p,tx:s.tx,tz:s.tz,kind:s.stop?'stop':'giveway',estimatedPlacement:true});}

 for(const element of data.elements){
  const t=element.tags||{},mark=t.road_marking,word=String(t.text||t['road_marking:text']||'').toUpperCase();
  const polygon=element.type==='way'&&element.nodes?.length>3&&element.nodes[0]===element.nodes.at(-1)&&element.nodes.every(id=>nodes.has(id))?element.nodes.map(id=>{const p=project(nodes.get(id));return[p.x,p.z];}):null;
  const raw=element.type==='node'?project(element):polygon?{x:polygon.reduce((n,p)=>n+p[0],0)/polygon.length,z:polygon.reduce((n,p)=>n+p[1],0)/polygon.length}:null;
  if(!raw||!inside(raw))continue;
  const hit=nearest(net,raw.x,raw.z),p=hit?posAt(hit.e,hit.s):null;
  if((t.highway==='crossing'||t.highway==='traffic_signals'&&t.crossing==='traffic_signals')&&p&&hit.d<hit.e.way.w/2+2){
   const kind=t.crossing==='zebra'||t.crossing_ref==='zebra'||t['crossing:markings']==='zebra'?'zebra':t.crossing==='traffic_signals'||['dots','dashes'].includes(t['crossing:markings'])?'signals':'unmarked',width=hit.e.way.w,controller=kind==='signals'?crossingController(net,hit.e,hit.s):{kind:'uncontrolled',approaches:[]};crossings.push({...p,kind,width,sourceId:element.id,controller,request:t.button_operated==='yes'?'button':t.button_operated==='no'?'automatic':'unspecified'});crossingAreas.push([rect(p,width+1,4.2)]);
   if(kind==='signals'&&controller.kind==='standalone')for(const dir of hit.e.way.oneway?[1]:[1,-1]){const at=hit.s-dir*3.5;if(at<0||at>hit.e.len)continue;const q=posAt(hit.e,at),f={...q,tx:q.tx*dir,tz:q.tz*dir,e:hit.e,w:width};lineAt(f,.25);const pole=roadsidePosition(net,f,{blocked,sideOnly:true});if(pole&&inside(pole)&&!signals.some(s=>s.role==='vehicle'&&s.tx*f.tx+s.tz*f.tz>.9&&Math.abs((s.x-pole.x)*f.tz-(s.z-pole.z)*f.tx)<3&&Math.hypot(s.x-pole.x,s.z-pole.z)<20))signals.push({...pole,tx:f.tx,tz:f.tz,role:'vehicle',crossingId:element.id,estimatedPlacement:true});}
   if(kind==='signals'&&t['crossing:signals']!=='no')for(const side of [-1,1]){const pole=roadsidePosition(net,{...p,w:width},{side,radius:.2,sideOnly:true,blocked});if(pole&&inside(pole))signals.push({...pole,tx:-p.tz*side,tz:p.tx*side,role:'pedestrian',crossingId:element.id,estimatedPlacement:true});}
   if(kind==='zebra')for(let offset=-width/2+.3;offset<width/2-.2;offset+=1){const q={...p,x:p.x+p.tz*offset,z:p.z-p.tx*offset};crossingPaint.push([rect(q,Math.min(.5,width/2-offset),3.2)]);}
   if(kind==='signals'&&t['crossing:markings']!=='no')for(const back of [-1.6,1.6])for(let offset=-width/2+.25;offset<width/2-.2;offset+=.75){const q={...p,x:p.x+p.tz*offset+p.tx*back,z:p.z-p.tx*offset+p.tz*back};crossingPaint.push([rect(q,.16,.16)]);}
   if(t.tactile_paving==='yes')for(const side of [-1,1]){const q={...p,x:p.x+p.tz*side*(width/2+.55),z:p.z-p.tx*side*(width/2+.55)};tactile.push([rect(q,.8,2)]);}
  }
  if(['box_junction','yellow_box','yellow_box_junction'].includes(mark)||t.junction==='box'||t.box_junction==='yes'){if(polygon)boxes.push(...polygonOperation([[polygon]],core,'intersection'));else unknown.push('Yellow box without a mapped boundary');}
  else if(mark==='keep_clear'||mark&&word==='KEEP CLEAR'){if(p)texts.push({...raw,tx:p.tx,tz:p.tz,text:'KEEP CLEAR',width:Math.min(3,p&&hit.e.way.w/2||3),length:8,estimatedPlacement:!polygon});}
  else if(mark==='word'&&word&&p){texts.push({...raw,tx:p.tx,tz:p.tz,text:word.slice(0,40),width:3,length:7,estimatedPlacement:true});}
  if(t.amenity==='parking_space'&&polygon)parking.push(...polygonOperation([[polygon]],core,'intersection'));
  if(t.traffic_sign){const value=String(t.traffic_sign),kind=/^(GB:)?616$|^no_entry$/.test(value)?'noentry':/^(GB:)?602$|^give_way$/.test(value)?'giveway':/^(GB:)?601(\.1)?$|^stop$/.test(value)?'stop':/^(GB:)?670\[\d+\]$/.test(value)?'speed':null;
   if(kind&&p){const location=space.disk(raw.x,raw.z,.3)?roadsidePosition(net,{...p,dir:1,s:hit.s,e:hit.e,w:hit.e.way.w},{blocked}):raw;if(location)signs.push({...location,tx:p.tx,tz:p.tz,kind,value:parseInt(value.match(/\[(\d+)\]/)?.[1]),estimatedPlacement:true});}else unknown.push('Sign retained for review: '+value);
  }
 }
 for(const r of track.osm.restrictions||[]){const via=r.members?.find(m=>m.role==='via'&&m.type==='node'),n=via&&nodes.get(via.ref);const p=n&&project(n);restrictions.push({...r,position:p||null});if(p&&inside(p))labels.push({...p,text:(r.tags.restriction||r.tags['restriction:conditional']||'Turn restriction').replaceAll('_',' ').toUpperCase(),restriction:true});}
 const excluded=[];
 const objects=track.objects.filter(o=>o.type!=='building'&&!['footway','pedestrian','water','forest','parking','park','sports','garden','grass','cemetery','industrial','sand','plaza'].includes(o.properties.mapFeature)).filter(o=>{
  if(o.x+o.sx/2<extent[0]-10||o.x-o.sx/2>extent[2]+10||o.z+o.sz/2<extent[1]-10||o.z-o.sz/2>extent[3]+10)return false;
  if(['tree','lamp','bench','bin','postBox','bicycleParking','busStop'].includes(o.properties.mapFeature)&&space.disk(o.x,o.z,o.properties.mapFeature==='tree'?.2:Math.min(o.sx,o.sz)/2)){excluded.push(o.properties.sourceId);return false;}return true;
 });
 const pathKinds=['cycleway','path','steps','bridleway'];const paths=pathKinds.map(kind=>({kind,polygons:polygonOperation(polygonOperation(objects.filter(o=>o.properties.mapFeature===kind).map(objectRings),core,'intersection'),surface.road,'difference')})).filter(p=>p.polygons.length);
 const clippedBoxes=polygonOperation(boxes,surface.road,'intersection');
 const uniqueSignals=[];for(const signal of signals)if(!uniqueSignals.some(s=>sameSignalApproach(s,signal)))uniqueSignals.push(signal);
 const counts={};for(const o of objects){const k=o.properties.mapFeature||o.type;counts[k]=(counts[k]||0)+1;}
 return {objects:objects.filter(o=>!pathKinds.includes(o.properties.mapFeature)),paths,paint:polygonOperation(polygonOperation([...polygonOperation(paint,crossingAreas,'difference'),...crossingPaint],core,'intersection'),surface.road,'intersection'),yellowPaint:yellowBoxPaint(clippedBoxes),arrows,texts,boxes:clippedBoxes,parking,signals:uniqueSignals,signs,labels,guides,restrictions,counts,unknown:[...new Set(unknown)],excluded,crossings,tactile:polygonOperation(polygonOperation(tactile,core,'intersection'),[...surface.pave,...surface.kerb],'intersection'),inferredPaint,inferredArrows,omittedSignalApproaches:track.osm.omittedSignalApproaches,fillets:net.fillets,sourceWays:source,network:track.network};
}
