import {polygonOperation,offsetPolygons} from '../road-surfaces.js';
// True metre-scale hatching clipped to the mapped box, including islands/holes.
// No transparent rectangular texture crossing a diagonal or curved boundary.
export function yellowBoxPaint(polygons){
 const all=[];
 for(const poly of polygons){
  const outer=poly[0],xs=outer.map(p=>p[0]),zs=outer.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,span=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
  if(span<.1)continue;
  let axis=0,longest=0;outer.forEach((a,i)=>{const b=outer[(i+1)%outer.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>longest){longest=len;axis=Math.atan2(b[1]-a[1],b[0]-a[0]);}});
  const stripes=[];for(const angle of [axis+Math.PI/4,axis-Math.PI/4]){const tx=Math.cos(angle),tz=Math.sin(angle),nx=-tz,nz=tx;for(let d=-span;d<=span;d+=2)stripes.push([[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[cx+nx*(d+a*.075)+tx*b*span,cz+nz*(d+a*.075)+tz*b*span])]);}
  all.push(...polygonOperation(stripes,[poly],'intersection'),...polygonOperation([poly],offsetPolygons([poly],-.15),'difference'));
 }
 return polygonOperation(polygonOperation(all,[]),offsetPolygons(polygons,-.004),'intersection');
}
