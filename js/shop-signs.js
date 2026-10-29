// One small, distance-limited sign per mapped shop. Text comes from OSM, never HTML.
// Facade orientation is an estimate toward the road; source POIs are not moved.
export function shopLabel(o){const p=o.properties||{},t=p.tags||{};return String(p.storefront?.name||((t.shop||['cafe','restaurant','pub','bank','pharmacy','fast_food'].includes(t.amenity))?t.name||'':'')).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,100);}
export function shopFace(o,front){
 let r=o.properties?.footprint?.map(p=>[p.x,p.z]);
 if(!r)r=[[-o.sx/2,-o.sz/2],[o.sx/2,-o.sz/2],[o.sx/2,o.sz/2],[-o.sx/2,o.sz/2]];
 if(r.length>1&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<.001)r.pop();
 const xs=r.map(p=>p[0]),zs=r.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,w=Math.max(...xs)-Math.min(...xs),d=Math.max(...zs)-Math.min(...zs);if(!w||!d)return null;
 r=r.map(([x,z])=>[(x-cx)*o.sx/w,(z-cz)*o.sz/d]);
 const signed=r.reduce((sum,a,i)=>{const b=r[(i+1)%r.length];return sum+a[0]*b[1]-b[0]*a[1];},0),c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0),v=front?[c*front.x-s*front.z,s*front.x+c*front.z]:[0,1],len=Math.hypot(...v)||1;
 return r.map((a,i)=>{const b=r[(i+1)%r.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/L,(b[1]-a[1])/L],N=[u[1]*Math.sign(signed),-u[0]*Math.sign(signed)];return {a,L,u,N,score:(N[0]*v[0]+N[1]*v[1])/len};}).filter(f=>f.L>=2).sort((a,b)=>b.score-a.score||b.L-a.L)[0]||null;
}
export function addShopSign(T,mesh,o,front){
 const label=shopLabel(o),f=shopFace(o,front);if(!label||!f||o.sy<2.5)return;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const g=canvas.getContext('2d');
 g.fillStyle='#24463f';g.fillRect(0,0,512,64);g.strokeStyle='#d7cbb0';g.lineWidth=3;g.strokeRect(5,5,502,54);g.fillStyle='#f3ecda';g.font='600 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(label,256,33,480);
 const map=new T.CanvasTexture(canvas);map.encoding=T.sRGBEncoding;map.anisotropy=2;
 const width=Math.min(5,f.L-.4),height=.42,y=Math.min(2.65,o.sy-.3),mid=[f.a[0]+f.u[0]*f.L/2,f.a[1]+f.u[1]*f.L/2];
 // Leave position on the footprint boundary; depth bias avoids z-fighting.
 const vertices=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[(mid[0]+f.N[1]*x*width/2)/o.sx,(y+z*height/2)/o.sy-.5,(mid[1]-f.N[0]*x*width/2)/o.sz]);
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
 const material=new T.MeshLambertMaterial({map,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),sign=new T.Mesh(geo,material);material.addEventListener('dispose',()=>map.dispose());sign.userData.editorObjectId=o.id;sign.userData.id=o.id;
 const lod=new T.LOD();lod.addLevel(sign,0);lod.addLevel(new T.Object3D(),100);mesh.add(lod);mesh.userData.shopSign={label,source:o.properties?.storefront?.source||'OpenStreetMap',placementEstimated:true};
}
