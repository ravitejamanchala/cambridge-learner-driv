import {ribbon} from './road-ribbon.js';
import Clipper from './vendor/clipper.js';
import {roadSpace,ribbonRings,ringArea} from './road-space.js';
// Integer millimetres prevent near-coincident OSM vertices from leaving slivers.
export function polygonOperation(subject,other,operation='union'){
 const paths=polys=>polys.flatMap(poly=>poly.map((ring,i)=>{const path=ring.map(([x,z])=>({X:Math.round(x*1000),Y:Math.round(z*1000)}));if(Clipper.Clipper.Orientation(path)!==(i===0))path.reverse();return path;}));
 const clip=new Clipper.Clipper(),tree=new Clipper.PolyTree();
 clip.AddPaths(paths(subject),Clipper.PolyType.ptSubject,true);clip.AddPaths(paths(other),Clipper.PolyType.ptClip,true);
 const op={union:Clipper.ClipType.ctUnion,difference:Clipper.ClipType.ctDifference,intersection:Clipper.ClipType.ctIntersection}[operation];
 if(!clip.Execute(op,tree,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero))return [];
 const output=[],ring=n=>n.Contour().map(p=>[p.X/1000,p.Y/1000]);
 const visit=n=>{for(const child of n.Childs()){if(!child.IsHole())output.push([ring(child),...child.Childs().filter(c=>c.IsHole()).map(ring)]);visit(child);}};visit(tree);return output;
}
export function offsetPolygons(polys,distance){
 const paths=polys.flatMap(poly=>poly.map((ring,i)=>{const path=ring.map(([x,z])=>({X:Math.round(x*1000),Y:Math.round(z*1000)}));if(Clipper.Clipper.Orientation(path)!==(i===0))path.reverse();return path;}));
 const offset=new Clipper.ClipperOffset(2,5),out=[];offset.AddPaths(paths,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);offset.Execute(out,distance*1000);
 // Preserve the offset path orientation so holes remain subtractive.
 const tree=new Clipper.PolyTree(),c=new Clipper.Clipper();c.AddPaths(out,Clipper.PolyType.ptSubject,true);c.Execute(Clipper.ClipType.ctUnion,tree,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
 const result=[],ring=n=>n.Contour().map(p=>[p.X/1000,p.Y/1000]);const visit=n=>{for(const child of n.Childs()){if(!child.IsHole())result.push([ring(child),...child.Childs().filter(c=>c.IsHole()).map(ring)]);visit(child);}};visit(tree);return result;
}
// Round only the exposed convex tips; never move source centreline vertices.
export function roundedSurface(polys,radius=.25){
 return polys.flatMap(poly=>{const inner=offsetPolygons([poly],-radius);return inner.length?offsetPolygons(inner,radius):[poly];});
}
// Boolean operations at millimetre precision can leave hairline fragments.
// They have negligible area but become long false walls when extruded.
export function solidSurface(polys,radius=.02){
 return polys.flatMap(poly=>{const inner=offsetPolygons([poly],-radius);return inner.length?offsetPolygons(inner,radius-.001):[];});
}
export const ROAD_HEIGHT=.04,PAVEMENT_HEIGHT=.19;
// Real vertical faces rather than a flat pale decal. Tile cuts are not kerbs.
export function raisedSurfaceGeometry(T,polygons,{bottom=.02,top=PAVEMENT_HEIGHT,bounds}={}){
 const flat=surfaceGeometry(T,polygons),g=flat.index?flat.toNonIndexed():flat;
 const positions=Array.from(g.attributes.position.array);for(let i=1;i<positions.length;i+=3)positions[i]=top;
 for(const poly of polygons)for(const ring of poly)for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  if(bounds&&([0,2].some(k=>Math.abs(a[0]-bounds[k])<.002&&Math.abs(b[0]-bounds[k])<.002)||[1,3].some(k=>Math.abs(a[1]-bounds[k])<.002&&Math.abs(b[1]-bounds[k])<.002)))continue;
  positions.push(a[0],bottom,a[1],b[0],top,b[1],b[0],bottom,b[1],a[0],bottom,a[1],a[0],top,a[1],b[0],top,b[1]);
 }
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(positions,3));result.computeVertexNormals();g.dispose();if(flat!==g)flat.dispose();return result;
}
const surfaceCache=new Map();
// Union per render chunk: no stacked kerbs or pavement wedges in the road.
export function joinedRoadSurfaces(net){
 const key=JSON.stringify([net.edges.map(e=>[e.a,e.b,e.way.w,e.way.sidewalkWidths,[...e.px],[...e.pz]]),net.fillets.map(f=>[f.C,f.pts])]);if(surfaceCache.has(key))return surfaceCache.get(key);
 const C=net.chunkSize,tiles=new Map(),space=roadSpace(net);
 const add=(ring,kind)=>{const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);for(let x=Math.floor(Math.min(...xs)/C);x<=Math.floor(Math.max(...xs)/C);x++)for(let z=Math.floor(Math.min(...zs)/C);z<=Math.floor(Math.max(...zs)/C);z++){const key=x+':'+z;if(!tiles.has(key))tiles.set(key,{x,z,road:[],pave:[]});tiles.get(key)[kind].push([ring]);}};
 for(const p of space.patches)add(p.ring,'road');
 for(const e of net.edges){
  const [left,right]=e.way.sidewalkWidths||[2,2],h=e.way.w/2;
  for(const [width,lo,hi]of [[left,h,h+left],[right,-h-right,-h]])if(width>0)ribbon({quad:(...v)=>{const ring=[];for(let i=0;i<8;i+=2)ring.push([v[i],v[i+1]]);if(ringArea(ring)>.00001)add(ring,'pave');}},e,lo,hi,0);
 }
 // Continue generated pavements around fitted corners where every connected
 // arm supports pavements on both sides. Explicit no/separate tags win.
 for(const f of net.fillets){
  const widths=net.inc[f.node].flatMap(({e})=>e.way.sidewalkWidths||[2,2]);
  if(widths.length&&!widths.some(w=>w<=0))for(const poly of offsetPolygons([[ [f.C,...f.pts] ]],Math.min(...widths)))add(poly[0],'pave');
 }
 const result=[];
 for(const tile of tiles.values()){
  const x=tile.x*C,z=tile.z*C,boundary=[[[[x,z],[x+C,z],[x+C,z+C],[x,z+C]]]];
  // Build outlines before clipping, so tile cuts never become kerb walls.
  const fullRoad=polygonOperation(tile.road,[]),road=polygonOperation(fullRoad,boundary,'intersection');
  const fullPave=roundedSurface(polygonOperation(tile.pave,[]));
  // A narrow residual gap must not become a kerb with no pavement behind it.
  const outside=solidSurface(polygonOperation(fullPave,fullRoad,'difference'),.12);
  const rim=polygonOperation(offsetPolygons(fullRoad,.14),fullRoad,'difference');
  const kerb=polygonOperation(solidSurface(polygonOperation(outside,rim,'intersection')),boundary,'intersection');
  const pave=polygonOperation(solidSurface(polygonOperation(outside,rim,'difference')),boundary,'intersection');
  result.push({x:x+C/2,z:z+C/2,bounds:[x,z,x+C,z+C],road,kerb,pave:pave.filter(p=>ringArea(p[0])>.08)});
 }
 if(surfaceCache.size>=3)surfaceCache.delete(surfaceCache.keys().next().value);surfaceCache.set(key,result);return result;
}
export function surfaceGeometry(T,polygons){const shapes=polygons.map(poly=>{const path=(ring,Type)=>{const p=new Type();ring.forEach(([x,z],i)=>i?p.lineTo(x,-z):p.moveTo(x,-z));p.closePath();return p;};const s=path(poly[0],T.Shape);s.holes=poly.slice(1).map(h=>path(h,T.Path));return s;});const g=new T.ShapeGeometry(shapes);g.rotateX(-Math.PI/2);return g;}
