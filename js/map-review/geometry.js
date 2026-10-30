import {laneInfo} from '../net.js';
import {dash} from '../road-ribbon.js';
import {lineDashes} from '../markings.js';
import {objectRings} from '../roadside-clearance.js';
import {clearAreas} from '../box-junction.js';
// Only our existing generated geometry enters this overlay. No basemap pixels are read.
export function overlayGeometry(track,net){
 if(!track||!net?.origin)throw Error('Load a generated My routes map first.');
 const out=[],ll=([x,z])=>({lat:net.origin[0]-z/net.kz,lng:net.origin[1]+x/net.kx});
 const add=(layer,id,rings,detail,polygon=true)=>{
  const points=rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  if(!points.length||points.some(p=>!p.every(Number.isFinite)))return;
  out.push({layer,id,paths:rings.map(r=>r.map(ll)),polygon,detail,bounds:{south:ll([0,Math.max(...zs)]).lat,north:ll([0,Math.min(...zs)]).lat,west:ll([Math.min(...xs),0]).lng,east:ll([Math.max(...xs),0]).lng}});
 };
 for(const [i,t]of (track.surfaceTiles||[]).entries())for(const [j,p]of (t.road||[]).entries())add('roads',`surface:${i}:${j}`,p,'Actual generated carriageway surface');
 const sources=new Map((track.renderNetwork||track.network).edges.map((e,i)=>[i,track.osm?.ways?.[e[2]]]));
 // Render graph IDs differ from the navigation graph. Use the supplied render net.
 for(const e of net.edges){
  const src=sources.get(e.id),detail=JSON.stringify({sourceId:src?.osmId?'way/'+src.osmId:null,name:e.way.name,widthMetres:e.way.w,widthEvidence:src?.flags?.includes('Width estimated')?'estimated':'source tag, not independently verified',lanes:e.way.lanes,tags:src?.tags||{},flags:src?.flags||[]},null,2);
  add('centreline','edge:'+e.id,[[...e.px].map((x,i)=>[x,e.pz[i]])],detail,false);
  const paint=(id,s,len,off)=>{let part=0;dash({quad:(...p)=>add('paint',id+':'+part++,[[[p[0],p[1]],[p[2],p[3]],[p[4],p[5]],[p[6],p[7]]]],'Actual generated lane-paint geometry')},e,s,len,off,.07);};
  if(e.way.laneMarkings!==false){
   for(const [i,d]of lineDashes(net,e).entries())paint(`dash:${e.id}:${i}`,d.s,d.len,d.off);
   if(e.way.rb&&e.way.lanes>=2){const L=laneInfo(e,1);for(let k=1;k<L.n;k++)for(let s=2;s<e.len-2;s+=4.5)paint(`ring:${e.id}:${k}:${s}`,s,2.2,L.outer-L.laneW*k);}
  }
 }
 const bar=(id,f,a,b,th,back=0)=>{const x=f.x-f.tx*back,z=f.z-f.tz*back;add('paint',id,[[[x+f.tz*a,z-f.tx*a],[x+f.tz*b,z-f.tx*b],[x+f.tz*b-f.tx*th,z-f.tx*b-f.tz*th],[x+f.tz*a-f.tx*th,z-f.tx*a-f.tz*th]]],'Actual generated stop/give-way/crossing stripe geometry');};
 for(const [i,s]of net.stops.entries())bar('stop:'+i,s,s.e.way.oneway?-s.w/2+.3:.2,s.w/2-.3,.35);
 for(const [i,g]of net.giveways.entries())for(const back of [0,.7])for(let off=.3;off<g.w/2-.3;off+=1)bar(`give:${i}:${back}:${off}`,g,off,Math.min(off+.55,g.w/2-.3),.25,back);
 for(const [i,z]of net.zebras.entries())for(let off=-z.w/2+.3;off<z.w/2-.3;off+=1)bar(`zebra:${i}:${off}`,z,off,Math.min(off+.5,z.w/2-.2),3.2,-1.6);
 for(const a of clearAreas(net)){
  const ring=[[-a.hl,-a.hw],[a.hl,-a.hw],[a.hl,a.hw],[-a.hl,a.hw]].map(([u,w])=>[a.x+a.ax*u+a.az*w,a.z+a.az*u-a.ax*w]);
  add('boxes',a.kind+':'+a.id,[ring],a.kind==='box'?'Generated yellow-box extent':'Generated KEEP CLEAR extent; this outline is not letter geometry');
 }
 for(const o of track.objects){
  const kind=o.properties?.mapFeature;
  if(o.type==='building')add('buildings',o.id,objectRings(o),JSON.stringify({id:o.id,tags:o.properties?.tags,source:o.properties?.sourceId,estimatedHeight:o.properties?.heightSource},null,2));
  else if(o.type==='parking'||['parking','parkingSpace'].includes(kind))add('parking',o.id,objectRings(o),'Mapped parking footprint; does not prove painted bays');
 }
 return {features:out,origin:{lat:net.origin[0],lng:net.origin[1]},source:track.osm?.datasetVersion||track.osm?.dataTimestamp||'live OSM',attribution:track.attribution};
}
