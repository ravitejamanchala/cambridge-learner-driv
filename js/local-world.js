import {styleEditorBuilding,styleSimulatorBuilding,kitResources} from './city.js';
import { footprintGeometry } from './editor-footprint.js';
import {mappedAppearance} from './mapped-scenery.js';
import {isGroundPavement} from './pavement.js';
// Authored scenery uses the same transforms and polygon footprints as the editor.
export function addEditorObjects(T,scene,track,net,{joinedPavements=false}={}) {
 const colours={building:0xd0c8b9,scenery:0x6d9d72,sign:0xffc866,light:0x454c55,marking:0xffffff,parking:0x54a8a7};
 for(const o of track.objects){
  if(joinedPavements&&isGroundPavement(o))continue;
  if(!(o.type in colours)) continue;
  const geometry=o.type==='building'&&o.properties.footprint?.length>2?footprintGeometry(T,o.properties.footprint,o.properties.holes||[]):new T.BoxGeometry(1,1,1);
  const material=new T.MeshLambertMaterial({color:colours[o.type]});
  const m=new T.Mesh(geometry,geometry.groups.length>1?[material,material]:material);
  m.position.set(o.x,o.y+o.sy/2,o.z);m.rotation.y=o.rotation;m.scale.set(o.sx,o.sy,o.sz);m.castShadow=true;m.receiveShadow=true;m.userData.editorObjectId=o.id;if(o.type==='building'){if(track.buildingStyle==='simulator')styleSimulatorBuilding(m,o);else styleEditorBuilding(m,o,net);}mappedAppearance(T,m,o,net);scene.add(m);m.updateMatrixWorld(true);m.traverse(part=>{part.matrixAutoUpdate=false;});
 }
}

// Keep source data for the whole journey. Only nearby tile meshes are created;
// a ring ahead is prepared before it reaches the visible horizon.
export function createAuthoredTiles(T,scene,track,net,options={}){
 const size=400,tiles=new Map(),radius=1050,margin=400;let active=0,built=0;
 for(const o of track.objects){
  if(options.joinedPavements&&isGroundPavement(o))continue;
  const key=Math.floor(o.x/size)+':'+Math.floor(o.z/size);let t=tiles.get(key);
  if(!t)tiles.set(key,t={key,objects:[],group:null,cursor:0,minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity});
  const r=Math.hypot(o.sx,o.sz)/2;t.minX=Math.min(t.minX,o.x-r);t.maxX=Math.max(t.maxX,o.x+r);t.minZ=Math.min(t.minZ,o.z-r);t.maxZ=Math.max(t.maxZ,o.z+r);t.objects.push(o);
 }
 const distance=(t,x,z)=>Math.hypot(Math.max(t.minX-x,0,x-t.maxX),Math.max(t.minZ-z,0,z-t.maxZ));
 function release(t){const keep=new Set(kitResources());t.group.traverse(m=>{if(m.geometry&&!keep.has(m.geometry))m.geometry.dispose();for(const material of [].concat(m.material||[])){if(keep.has(material))continue;if(material.map&&!keep.has(material.map))material.map.dispose();material.dispose();}});scene.remove(t.group);t.group=null;t.cursor=0;}
 function update(x,z,viewRadius=0,budget=4){
  const visible=Math.max(radius,viewRadius),wanted=[];active=0;built=0;
  for(const t of tiles.values()){
   const d=distance(t,x,z);if(d<visible+margin&&t.cursor<t.objects.length)wanted.push({t,d});
   if(t.group){t.group.visible=d<visible;if(t.group.visible)active++;if(d>visible+margin*2)release(t);else built++;}
  }
  wanted.sort((a,b)=>a.d-b.d);const end=performance.now()+budget;
  for(const {t,d}of wanted){
   if(!t.group){t.group=new T.Group();t.group.userData.authoredTile=t.key;t.group.matrixAutoUpdate=false;t.group.visible=d<visible;scene.add(t.group);}
   while(t.cursor<t.objects.length){addEditorObjects(T,t.group,{...track,objects:[t.objects[t.cursor++]]},net,options);if(performance.now()>end)return false;}
  }
  return true;
 }
 return {update,async prepare(x,z,cancelled=()=>false){while(true){if(cancelled())throw new DOMException('Cancelled','AbortError');if(update(x,z,0,12))break;await new Promise(r=>setTimeout(r,0));}},stats:()=>({total:tiles.size,active,resident:built,objects:[...tiles.values()].reduce((n,t)=>n+t.cursor,0)})};
}
