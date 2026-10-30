import {objectRings} from './roadside-clearance.js';
import {roadSpace} from './road-space.js';
import {polygonOperation,solidSurface,roundedSurface,raisedSurfaceGeometry,PAVEMENT_HEIGHT} from './road-surfaces.js';
export {isGroundPavement} from './road-surfaces.js';
// Source objects keep their coordinates, IDs and editable transforms. This is
// render geometry only; a crossing must never acquire a raised slab in the road.
export function mappedPavementPolygons(net,o){
 const rings=objectRings(o),xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]);
 const roads=roadSpace(net).nearby(Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)).map(p=>[p.ring]);
 const shape=o.properties.pathJoin?[rings]:roundedSurface([rings],Math.min(.25,o.sx*.1,o.sz*.1));
 return solidSurface(polygonOperation(shape,roads,'difference'));
}
export function styleMappedPavement(T,m,o,net){
 if(!net||!['footway','pedestrian'].includes(o.properties?.mapFeature)||o.type!=='marking'||o.y>.1||o.sy>.1)return false;
 const polys=mappedPavementPolygons(net,o),g=raisedSurfaceGeometry(T,polys,{top:PAVEMENT_HEIGHT});
 // Convert world-space clipping back to the original object's local frame.
 m.updateMatrix();g.applyMatrix4(new T.Matrix4().copy(m.matrix).invert());
 g.addGroup(0,g.attributes.position.count,0);
 m.geometry.dispose();m.geometry=g;m.userData.raisedPavement=true;
 return true;
}
