import {tileSurfaces} from '../tile-builder/surfaces.js';
import {streetData} from '../tile-builder/street-data.js';
import {polygonOperation} from '../road-surfaces.js';

// Prepare once in the worker, then let the native world reveal nearby chunks.
// A long route retains one origin and is never clipped to the inspector's 1 km square.
export function refinedWorld(track,net,data,bounds){
 const [south,west,north,east]=bounds;
 const x0=(west-net.origin[1])*net.kx,x1=(east-net.origin[1])*net.kx,z0=-(north-net.origin[0])*net.kz,z1=-(south-net.origin[0])*net.kz;
 const core=[[[[x0,z0],[x1,z0],[x1,z1],[x0,z1]]]],surface=tileSurfaces(net,track.objects,core)[0],street=streetData(track,net,data,core,surface),C=net.chunkSize,tiles=new Map();
 const get=(cx,cz)=>{const key=cx+':'+cz;if(!tiles.has(key))tiles.set(key,{x:(cx+.5)*C,z:(cz+.5)*C,bounds:[cx*C,cz*C,(cx+1)*C,(cz+1)*C],road:[],pave:[],kerb:[],paint:[],yellowPaint:[],tactile:[],parking:[],paths:[],arrows:[],texts:[]});return tiles.get(key);};
 function polygons(polys,kind,pathKind){for(const poly of polys){const b=poly[0].reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);for(let cx=Math.floor(b[0]/C);cx<=Math.floor(b[2]/C);cx++)for(let cz=Math.floor(b[1]/C);cz<=Math.floor(b[3]/C);cz++){const x=cx*C,z=cz*C,r=polygonOperation([poly],[[[[x,z],[x+C,z],[x+C,z+C],[x,z+C]]]],'intersection');if(!r.length)continue;const tile=get(cx,cz);if(pathKind){let p=tile.paths.find(p=>p.kind===pathKind);if(!p)tile.paths.push(p={kind:pathKind,polygons:[]});p.polygons.push(...r);}else tile[kind].push(...r);}}}
 for(const k of ['road','pave','kerb'])polygons(surface[k],k);
 for(const k of ['paint','yellowPaint','tactile'])polygons(street[k],k);
 for(const p of street.paths)polygons(p.polygons,'paths',p.kind);
 // Whole outlines/text belong to one chunk; splitting them would add false bay
 // boundaries or duplicate transparent lettering at a chunk edge.
 for(const poly of street.parking){const p=poly[0][0];get(Math.floor(p[0]/C),Math.floor(p[1]/C)).parking.push(poly);}
 for(const k of ['arrows','texts'])for(const p of street[k])get(Math.floor(p.x/C),Math.floor(p.z/C))[k].push(p);
 const excluded=new Set(street.excluded),paths=new Set(['footway','pedestrian','cycleway','path','steps','bridleway']);
 track.objects=track.objects.filter(o=>!paths.has(o.properties?.mapFeature)&&!excluded.has(o.properties?.sourceId));
 return {tiles:[...tiles.values()],coverage:{generator:'refined-tile-v1',inferredLines:street.inferredPaint,inferredArrows:street.inferredArrows,yellowBoxes:street.boxes.length,crossings:street.crossings.length,warnings:street.unknown}};
}
