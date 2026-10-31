import Clipper from '../vendor/clipper.js';
import {polygonOperation,offsetPolygons,roundedSurface,isGroundPavement} from '../road-surfaces.js';
import {objectRings} from '../roadside-clearance.js';
import {roadJoinRings} from '../road-joins.js';
import {ribbon} from '../road-ribbon.js';

// Offset the entire centreline, not a chain of intersecting rectangles. Rounded
// joins survive short bend segments without bow-tie triangles or needle tips.
export function bufferedLine(points,radius){
 const path=[];for(const [x,z]of points){const p={X:Math.round(x*1000),Y:Math.round(z*1000)};if(!path.length||p.X!==path.at(-1).X||p.Y!==path.at(-1).Y)path.push(p);}
 if(path.length<2||radius<=0)return [];
 const offset=new Clipper.ClipperOffset(2,15),paths=[];offset.AddPath(path,Clipper.JoinType.jtRound,Clipper.EndType.etOpenRound);offset.Execute(paths,radius*1000);
 // Reconstruct the nesting before converting to the simulator polygon format.
 const clip=new Clipper.Clipper(),tree=new Clipper.PolyTree();clip.AddPaths(paths,Clipper.PolyType.ptSubject,true);clip.Execute(Clipper.ClipType.ctUnion,tree,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
 const result=[],ring=n=>n.Contour().map(p=>[p.X/1000,p.Y/1000]);const visit=n=>{for(const child of n.Childs()){if(!child.IsHole())result.push([ring(child),...child.Childs().filter(c=>c.IsHole()).map(ring)]);visit(child);}};visit(tree);return result;
}
export function tileSurfaces(net,objects,core){
 const roads=[],pavements=objects.filter(isGroundPavement).map(objectRings);
 for(const e of net.edges){
  const points=Array.from({length:e.n},(_,i)=>[e.px[i],e.pz[i]]),half=e.way.w/2;
  roads.push(...bufferedLine(points,half));
  const [left,right]=e.way.sidewalkWidths||[2,2];
  if(left>0&&Math.abs(left-right)<.01)pavements.push(...bufferedLine(points,half+left));
  else for(const [width,lo,hi]of [[left,half,half+left],[right,-half-right,-half]])if(width>0)ribbon({quad:(...v)=>pavements.push([Array.from({length:4},(_,i)=>[v[i*2],v[i*2+1]])])},e,lo,hi,0);
 }
 for(const {ring}of roadJoinRings(net))roads.push([ring]);
 for(const f of net.fillets){const polygon=[[f.C,...f.pts]];roads.push(polygon);const widths=net.inc[f.node].flatMap(({e})=>e.way.sidewalkWidths||[2,2]);if(widths.every(w=>w>0))pavements.push(...offsetPolygons([polygon],Math.min(...widths)));}
 // Fill sub-metre ribbon cracks, never whole mapped islands. Then round the
 // remaining sharp tips. This affects render surfaces only, not OSM nodes.
 const joined=polygonOperation(roads,[]),road=roundedSurface(offsetPolygons(offsetPolygons(joined,.3),-.3),.2);
 const outside=polygonOperation(roundedSurface(polygonOperation(pavements,[]),.3),offsetPolygons(road,.003),'difference');
 const kerb=polygonOperation(outside,offsetPolygons(road,.14),'intersection'),pave=polygonOperation(outside,offsetPolygons(road,.143),'difference');
 return [{road:polygonOperation(road,core,'intersection'),pave:polygonOperation(pave,core,'intersection'),kerb:polygonOperation(kerb,core,'intersection')}];
}
