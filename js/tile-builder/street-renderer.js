import {mappedAppearance} from '../mapped-scenery.js';
import {buildNet} from '../net.js';
import {surfaceGeometry} from '../road-surfaces.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
import {objectBlocker} from '../roadside-clearance.js';
import {invalidateRoadSpace} from '../road-space.js';
import {buildSigns,arrowTex,speedSignTex,giveWaySignTex,noEntryTex} from '../signs.js';
import {roadText} from '../world.js';

const T=THREE;
// All baked props are non-indexed with position, normal and colour attributes.
// Keep this shared renderer usable by the source app as well as bundled previews.
function mergeGeometry(geometries){
 const merged=new T.BufferGeometry();
 for(const name of ['position','normal','color']){
  const arrays=geometries.map(g=>g.getAttribute(name)),length=arrays.reduce((n,a)=>n+a.array.length,0),values=new Float32Array(length);let offset=0;
  for(const a of arrays){values.set(a.array,offset);offset+=a.array.length;}
  merged.setAttribute(name,new T.BufferAttribute(values,3));
 }
 return merged;
}

// Original simulator assets, batched within this disposable preview scene.
export function addStreet(parent,street,buildings=[],{paintOnly=false}={}){
 const solids=new T.Group(),guidance=new T.Group();parent.add(solids,guidance);
 const color=c=>new T.Color(c).convertSRGBToLinear();
 const solid=(geo,c,x=0,y=0,z=0)=>{const m=new T.Mesh(geo,new T.MeshLambertMaterial({color:color(c)}));m.position.set(x,y,z);solids.add(m);return m;};
 if(!paintOnly){
 const net=buildNet(street.network,{tidyLines:false});applyMappedRoadTags(net,street.sourceWays);net.fillets=street.fillets;invalidateRoadSpace(net);
 const blockers=buildings.map(b=>{const xs=b.rings[0].map(p=>p[0]),zs=b.rings[0].map(p=>p[1]);return {type:'building',x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,y:b.bottom,sx:Math.max(...xs)-Math.min(...xs),sz:Math.max(...zs)-Math.min(...zs),rotation:0,properties:{footprint:b.rings[0].map(([x,z])=>({x,z})),holes:b.rings.slice(1).map(r=>r.map(([x,z])=>({x,z})))}};});
 buildSigns(parent,net,{blocked:objectBlocker(blockers),laneGuidance:false});
 for(const o of street.objects){const m=new T.Mesh(new T.BoxGeometry(),new T.MeshLambertMaterial());m.position.set(o.x,o.y+o.sy/2,o.z);m.rotation.y=o.rotation;m.scale.set(o.sx,o.sy,o.sz);mappedAppearance(T,m,o,net);m.traverse(c=>{for(const mat of [].concat(c.material||[]))mat.color?.convertSRGBToLinear();});solids.add(m);}
 for(const p of street.signals){
  if(p.role==='pedestrian'){solid(new T.CylinderGeometry(.04,.05,1.5,6),0x4b5154,p.x,.75,p.z);const head=solid(new T.BoxGeometry(.3,.5,.18),0x262c2b,p.x,1.3,p.z);head.rotation.y=Math.atan2(-p.tx,-p.tz);const person=new T.Group();const red=new T.MeshBasicMaterial({color:0xed504c});const skull=new T.Mesh(new T.CircleGeometry(.035,8),red);skull.position.set(0,.11,.096);person.add(skull);const body=new T.Mesh(new T.PlaneGeometry(.035,.11),red);body.position.set(0,.03,.096);person.add(body);for(const side of [-1,1]){const leg=new T.Mesh(new T.PlaneGeometry(.025,.09),red);leg.position.set(side*.025,-.055,.096);person.add(leg);}head.add(person);continue;}
  solid(new T.CylinderGeometry(.075,.09,3.9,8),0x4b5154,p.x,1.95,p.z);
  const head=solid(new T.BoxGeometry(.48,1.4,.34),0x262c2b,p.x,3.35,p.z);head.rotation.y=Math.atan2(-p.tx,-p.tz);
  for(let i=0;i<3;i++){const lamp=new T.Mesh(new T.CircleGeometry(.16,12),new T.MeshLambertMaterial({color:color([0x793330,0x796537,0x315942][i])}));lamp.position.set(0,.43-i*.43,.176);head.add(lamp);}
 }
 }
 const batches=new Map();
 function textured(key,texture,geo,items,ground=true){
  if(!items.length)return;
  const mat=new T.MeshBasicMaterial({map:texture(),transparent:true,alphaTest:.1,side:T.DoubleSide,depthWrite:false});
  const m=new T.InstancedMesh(geo,mat,items.length),dummy=new T.Object3D();
  items.forEach((p,i)=>{dummy.position.set(p.x,ground?.08:2.3,p.z);dummy.rotation.set(0,Math.atan2(-p.tx,-p.tz),0);dummy.scale.set(p.width||.8,ground?1:.8,ground?(p.length||4):1);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.frustumCulled=false;m.renderOrder=3;parent.add(m);
 }
 function arrow(code){const kinds={S:'ahead',L:'left',R:'right',LS:'aheadleft',SR:'aheadright'};if(kinds[code])return arrowTex(kinds[code]);const left=arrowTex('left'),right=arrowTex('right'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=192;const ctx=canvas.getContext('2d');ctx.drawImage(left.image,0,0);ctx.drawImage(right.image,0,0);if(code.includes('S')){const straight=arrowTex('ahead');ctx.drawImage(straight.image,0,0);straight.dispose();}left.dispose();right.dispose();return new T.CanvasTexture(canvas);}
 const floor=()=>new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
 for(const p of street.arrows){const key='arrow:'+p.code;if(!batches.has(key))batches.set(key,{tex:()=>arrow(p.code),items:[]});batches.get(key).items.push(p);}
 for(const p of street.texts){const key='text:'+p.text;if(!batches.has(key))batches.set(key,{tex:()=>roadText(p.text),items:[]});batches.get(key).items.push(p);}
 for(const [key,b]of batches)textured(key,b.tex,floor(),b.items);
 if(street.paint.length)solid(surfaceGeometry(T,street.paint),0xf2f1ea,0,.07,0);
 if(street.tactile?.length)solid(surfaceGeometry(T,street.tactile),0xd6b38b,0,.045,0);
 const outlines=[];
 for(const polygon of street.parking)for(const ring of polygon)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];outlines.push(a[0],.09,a[1],b[0],.09,b[1]);}
 if(outlines.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(outlines,3));parent.add(new T.LineSegments(geo,new T.LineBasicMaterial({color:0xf2f1ea})));}
 for(const path of street.paths||[])solid(surfaceGeometry(T,path.polygons),path.kind==='cycleway'?0xa3aaa5:0xc4bba8,0,.02,0);
 if(street.yellowPaint?.length){const m=new T.Mesh(surfaceGeometry(T,street.yellowPaint),new T.MeshBasicMaterial({color:0xf0c419,side:T.DoubleSide}));m.position.y=.085;parent.add(m);}
 function stopTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const g=canvas.getContext('2d');g.fillStyle='#cf2333';g.strokeStyle='white';g.lineWidth=5;g.beginPath();for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4,x=64+59*Math.cos(a),y=64+59*Math.sin(a);i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();g.stroke();g.fillStyle='white';g.font='bold 32px sans-serif';g.textAlign='center';g.fillText('STOP',64,75);return new T.CanvasTexture(canvas);}
 const signGroups=new Map();
 for(const p of paintOnly?[]:street.signs){solid(new T.CylinderGeometry(.04,.05,2.3,6),0x777f82,p.x,1.15,p.z);const k=p.kind+':'+p.value;if(!signGroups.has(k))signGroups.set(k,{p,items:[]});signGroups.get(k).items.push(p);}
 for(const [key,b]of signGroups){const p=b.p;const tex=p.kind==='speed'?()=>speedSignTex(p.value):p.kind==='giveway'?giveWaySignTex:p.kind==='noentry'?noEntryTex:stopTexture;textured(key,tex,new T.PlaneGeometry(1,1),b.items,false);}
 // Labels are deliberately separate guidance, never white paint claiming a road inscription.
 for(const p of paintOnly?[]:street.labels){const c=document.createElement('canvas');c.width=512;c.height=64;const g=c.getContext('2d');g.fillStyle=p.restriction?'#743451':'#183f54';g.fillRect(0,0,512,64);g.font='bold 26px sans-serif';g.fillStyle='white';g.textAlign='center';g.fillText(p.text,256,42,490);const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false,depthWrite:false}));sprite.position.set(p.x,6,p.z);sprite.scale.set(45,5.625,1);sprite.renderOrder=5;guidance.add(sprite);}
 if(!paintOnly&&street.guides.length){const geo=floor(),m=new T.InstancedMesh(geo,new T.MeshBasicMaterial({map:arrowTex('ahead'),color:0x49b9df,transparent:true,depthWrite:false}),street.guides.length),dummy=new T.Object3D();street.guides.forEach((p,i)=>{dummy.position.set(p.x,.13,p.z);dummy.rotation.y=Math.atan2(-p.tx,-p.tz);dummy.scale.set(2,1,7);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.frustumCulled=false;guidance.add(m);}
 // Bake the simple props into one vertex-colour mesh instead of hundreds of draw calls.
 solids.updateMatrixWorld(true);const geometries=[];
 solids.traverse(o=>{if(!o.isMesh||!o.geometry.attributes.position?.count)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);geo.clearGroups();geo.deleteAttribute('uv');const mat=[].concat(o.material)[0],c=mat.color||new T.Color('white'),colors=[];for(let i=0;i<geo.attributes.position.count;i++)colors.push(c.r,c.g,c.b);geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometries.push(geo);});
 if(geometries.length){const merged=mergeGeometry(geometries);if(merged)parent.add(new T.Mesh(merged,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide})));geometries.forEach(g=>g.dispose());}
 solids.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose();});parent.remove(solids);
 return guidance;
}
