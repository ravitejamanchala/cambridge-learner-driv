import {streetData} from './street-data.js';
import {boundsCheck} from '../personal/geometry.js';
import {convertOSM} from '../personal/geo/osm.js';
import {buildNet} from '../net.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
import {joinedRoadSurfaces,polygonOperation} from '../road-surfaces.js';
import {objectRings} from '../roadside-clearance.js';

import {tileSelection,TILE_SIZE} from './selection.js';
export {tileSelection} from './selection.js';
const object=(type,x=0,z=0)=>({id:crypto.randomUUID(),type,name:type,x,z,y:0,rotation:0,sx:2,sy:1,sz:2,properties:{}});
const makeTrack=network=>({version:1,title:'One kilometre tile',kind:'mock',network,objects:[],plan:{waypoints:[]},spawn:{x:0,z:0,heading:0}});
export function generateTile(data,center){
  const selection=tileSelection(center);
  if(data?.remark)throw Error('The provider returned incomplete map data. Please retry.');
  if(!Array.isArray(data?.elements)||data.elements.length>60000)throw Error('This square contains too much map data. Move it to a less dense area and retry.');
  const track=convertOSM(data,selection.dataBounds,{boundsCheck,makeTrack,object,preserveSourceGeometry:true,limits:{elements:60000,nodes:120000,edges:20000,objects:20000}});
  const net=buildNet(track.network);applyMappedRoadTags(net,track.osm?.ways);
  const edge=TILE_SIZE/2,core=[[[[-edge,-edge],[edge,-edge],[edge,edge],[-edge,edge]]]];
  const surfaces=joinedRoadSurfaces(net,track.objects).map(t=>Object.fromEntries(['road','pave','kerb'].map(k=>[k,polygonOperation(t[k],core,'intersection')])));
  const land=[];let occupied=[];
  for(const kind of ['water','plaza','parking','sports','garden','forest','park','grass','sand','industrial']){
    const input=track.objects.filter(o=>o.properties.mapFeature===kind&&o.properties.footprint).map(objectRings);if(!input.length)continue;
    const rings=polygonOperation(polygonOperation(polygonOperation(input,[]),core,'intersection'),occupied,'difference');
    if(rings.length){land.push({kind,polygons:rings});occupied=polygonOperation([...occupied,...rings],[]);}
  }
  const buildings=[];
  for(const o of track.objects.filter(o=>o.type==='building')){
    const clipped=polygonOperation([objectRings(o)],core,'intersection');
    for(const rings of clipped)buildings.push({id:o.properties.osmId||o.id,rings,height:o.sy,bottom:o.y||0,estimated:!!o.properties.heightEstimated,type:o.properties.tags?.building||'yes'});
  }
  return {selection,surfaces,land,buildings,street:streetData(track,net,data,core),source:{provider:'OpenStreetMap',attribution:'© OpenStreetMap contributors · ODbL',timestamp:track.osm.dataTimestamp},stats:{buildings:buildings.length,estimatedHeights:buildings.filter(b=>b.estimated).length,roadPolygons:surfaces.reduce((n,t)=>n+t.road.length,0)},notes:['Flat terrain for this prototype.','Road widths and untagged building heights use estimates.','Lane arrows and road text use source tags; their placement is estimated.']};
}
