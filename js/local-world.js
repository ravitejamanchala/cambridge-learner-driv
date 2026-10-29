import {styleEditorBuilding} from './city.js';
import { footprintGeometry } from './editor-footprint.js';
import {mappedAppearance} from './mapped-scenery.js';
// Authored scenery uses the same transforms and polygon footprints as the editor.
export function addEditorObjects(T,scene,track,net) {
 const colours={building:0xd0c8b9,scenery:0x6d9d72,sign:0xffc866,light:0x454c55,marking:0xffffff,parking:0x54a8a7};
 for(const o of track.objects){
  if(!(o.type in colours)) continue;
  const geometry=o.type==='building'&&o.properties.footprint?.length>2?footprintGeometry(T,o.properties.footprint,o.properties.holes||[]):new T.BoxGeometry(1,1,1);
  const material=new T.MeshLambertMaterial({color:colours[o.type]});
  const m=new T.Mesh(geometry,geometry.groups.length>1?[material,material]:material);
  m.position.set(o.x,o.y+o.sy/2,o.z);m.rotation.y=o.rotation;m.scale.set(o.sx,o.sy,o.sz);m.castShadow=true;m.receiveShadow=true;m.userData.editorObjectId=o.id;if(o.type==='building')styleEditorBuilding(m,o,net);mappedAppearance(T,m,o,net);scene.add(m);m.updateMatrixWorld(true);m.traverse(part=>{part.matrixAutoUpdate=false;});
 }
}
