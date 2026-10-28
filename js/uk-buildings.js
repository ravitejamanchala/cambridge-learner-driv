// Original procedural UK facades. Source footprints, transforms and total heights
// remain authoritative; visual roofs never extend outside the mapped outline.
export const UK_STYLES={terrace:'Red-brick terrace','buff-brick':'Cambridge buff brick',render:'Rendered house',stone:'Stone / institutional',shop:'High-street shop',apartment:'Modern apartments',industrial:'Industrial / warehouse'};
const PALETTE={terrace:['#925b48','#c3b2a0','#41494f'], 'buff-brick':['#b5a27c','#ded2b7','#52595d'],render:['#ddd9c9','#c5c0ad','#61636a'],stone:['#b3ad97','#d3cdbb','#555b5b'],shop:['#927058','#c9b9a1','#4d5459'],apartment:['#bbb3a2','#ded7c9','#666e72'],industrial:['#9babae','#697c82','#67777d']};
const textures=new Map();
export const ukBuildingResources=()=>[...textures.values()];
function seedOf(o){let s=0;for(const c of String(o.properties?.osmId??o.properties?.overtureId??o.id))s=(Math.imul(s,31)+c.charCodeAt(0))>>>0;return s;}
export function ukProfile(o){
 const p=o.properties||{},t=p.tags||{},kind=t.building||p.class||'',material=t['building:material']||t.material||'';
 let style=p.ukStyle;if(!Object.hasOwn(UK_STYLES,style))style=/industrial|warehouse|shed|garage/.test(kind)?'industrial':t.shop||/retail|commercial/.test(kind)?'shop':/apartments|office/.test(kind)?'apartment':/church|cathedral|university|school|civic/.test(kind)||/stone/.test(material)?'stone':/plaster|render/.test(material)?'render':/terrace/.test(kind)?'terrace':o.sy>18?'apartment':seedOf(o)%3===0?'terrace':'buff-brick';
 const levels=Number(t['building:levels']);const floors=Math.max(1,Math.min(50,Number.isFinite(levels)&&levels>0?Math.round(levels):Math.round(o.sy/3)));
 const roofShape=t['roof:shape']||(style==='render'?'hipped':'gabled');
 const flat=!['gabled','hipped','pitched'].includes(roofShape)||(!t['roof:shape']&&['stone','shop','apartment','industrial'].includes(style));
 return {style,floors,seed:seedOf(o),roofShape:roofShape==='hipped'?'hipped':'gabled',pitched:!flat&&o.sy>=3&&o.sy<=16,roofHeight:Math.min(o.sy*.3,Number(t['roof:height'])>0?Number(t['roof:height']):Math.min(2.2,o.sy*.25))};
}
function canvasTexture(T,key,draw){if(textures.has(key))return textures.get(key);const c=document.createElement('canvas');c.width=256;c.height=512;draw(c.getContext('2d'),c.width,c.height);const map=new T.CanvasTexture(c);map.wrapS=T.RepeatWrapping;map.wrapT=T.ClampToEdgeWrapping;map.anisotropy=4;map.encoding=T.sRGBEncoding;textures.set(key,map);return map;}
function facade(T,style,floors){return canvasTexture(T,`wall:${style}:${floors}`,(g,W,H)=>{
 const [brick,mortar]=PALETTE[style];g.fillStyle=brick;g.fillRect(0,0,W,H);
 const rows=floors?Math.max(12,floors*24):40,bh=H/rows,bw=style==='stone'?38:25;
 if(!['render','industrial'].includes(style))for(let row=0;row<rows;row++)for(let col=-1;col<W/bw+1;col++){
  const x=col*bw+(row%2?bw/2:0),y=row*bh;
  g.strokeStyle=mortar;g.lineWidth=Math.max(.5,bh*.09);g.strokeRect(x,y,bw,bh);
  g.fillStyle=`rgba(${(row*17+col*31)%3===0?'0,0,0':'255,255,255'},.045)`;g.fillRect(x+1,y+1,bw-2,bh-2);
 }
 if(style==='industrial'){g.strokeStyle='#62777c';g.lineWidth=1;for(let x=0;x<W;x+=8){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}}
 if(!floors)return;
 const fh=H/floors;
 for(let floor=0;floor<floors;floor++){
  const y=H-(floor+1)*fh;
  if(!floor&&style==='shop'){
   g.fillStyle='#294d48';g.fillRect(6,y+fh*.2,W-12,fh*.13);g.fillStyle='#d8caa8';g.fillRect(18,y+fh*.24,W-36,fh*.025);
   g.fillStyle='#303f45';g.fillRect(9,y+fh*.36,W-18,fh*.64);g.fillStyle='#829591';g.fillRect(14,y+fh*.41,W*.65,fh*.5);g.fillStyle='#d4d0b9';g.fillRect(W*.75,y+fh*.36,4,fh*.64);continue;
  }
  for(let col=0;col<2;col++){
   const x=col*W/2+27,ww=51,wy=y+fh*.21,wh=fh*.53;
   if(!floor&&col===1&&!['apartment','industrial'].includes(style)){
    g.fillStyle='#d8d4c5';g.fillRect(x-5,y+fh*.18,ww+10,fh*.82);g.fillStyle=style==='terrace'?'#344e5d':'#3c5146';g.fillRect(x,y+fh*.23,ww,fh*.77);
    g.strokeStyle='#758077';g.lineWidth=2;for(let k=0;k<2;k++)g.strokeRect(x+9,y+fh*(.34+k*.3),ww-18,fh*.23);g.fillStyle='#bba479';g.fillRect(x+ww-10,y+fh*.65,3,4);continue;
   }
   g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x-6,wy-3,ww+13,wh+10);g.fillStyle='#e0dfd2';g.fillRect(x-4,wy-4,ww+8,wh+8);
   const gradient=g.createLinearGradient(x,wy,x+ww,wy+wh);gradient.addColorStop(0,'#71858b');gradient.addColorStop(.55,'#a5afb0');gradient.addColorStop(.56,'#3f555e');gradient.addColorStop(1,'#31434b');g.fillStyle=gradient;g.fillRect(x,wy,ww,wh);
   g.fillStyle='#e3e0d3';g.fillRect(x+ww/2-1,wy,2,wh);g.fillRect(x,wy+wh*.48,ww,2);
   if(style==='stone'){g.fillRect(x+ww/3-1,wy,2,wh);g.fillRect(x+ww*2/3-1,wy,2,wh);}
   g.fillStyle='#bdb9ab';g.fillRect(x-7,wy+wh+4,ww+14,Math.max(2,fh*.025));
  }
 }
 // Low plinth and eaves shading anchor the facade without extra geometry.
 g.fillStyle='rgba(35,39,35,.18)';g.fillRect(0,H-5,W,5);g.fillRect(0,0,W,5);
});}
function roofTexture(T){return canvasTexture(T,'slate',(g,W,H)=>{g.fillStyle='#d3d8da';g.fillRect(0,0,W,H);for(let y=0;y<H;y+=32)for(let x=-32;x<W;x+=64){g.fillStyle=(x+y)%128?'#b1b9bc':'#c2c9cc';g.fillRect(x+(y%64?32:0)+2,y+2,60,28);g.fillStyle='#78878d';g.fillRect(x+(y%64?32:0),y,64,2);}});}
// Find a true rectangle, including rotated rectangles. Courtyards and irregular
// outlines keep their own flat roof: no bounding-box roof over empty space.
export function rectangularOutline(o){
 if(o.properties?.holes?.length)return null;
 let r=o.properties?.footprint?.map(p=>[p.x,p.z])||[[-o.sx/2,-o.sz/2],[o.sx/2,-o.sz/2],[o.sx/2,o.sz/2],[-o.sx/2,o.sz/2]];
 if(r.length>1&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<.001)r.pop();
 for(let again=true;again&&r.length>4;){again=false;for(let i=0;i<r.length;i++){const a=r[(i+r.length-1)%r.length],b=r[i],c=r[(i+1)%r.length],length=Math.hypot(c[0]-a[0],c[1]-a[1]);if(length&&Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/length<.02){r.splice(i,1);again=true;break;}}}
 if(r.length!==4)return null;
 const edges=r.map((p,i)=>[r[(i+1)%4][0]-p[0],r[(i+1)%4][1]-p[1]]),lengths=edges.map(e=>Math.hypot(...e));
 if(lengths.some(l=>l<1)||edges.some((a,i)=>Math.abs(a[0]*edges[(i+1)%4][0]+a[1]*edges[(i+1)%4][1])>lengths[i]*lengths[(i+1)%4]*.015))return null;
 if(lengths[1]>lengths[0])r.push(r.shift());
 const xs=r.map(p=>p[0]),zs=r.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,w=Math.max(...xs)-Math.min(...xs),d=Math.max(...zs)-Math.min(...zs);
 return r.map(([x,z])=>[(x-cx)/w,(z-cz)/d]);
}
export function styleUKBuilding(T,mesh,o){
 const profile=ukProfile(o),outline=profile.pitched?rectangularOutline(o):null;
 const fraction=outline?profile.roofHeight/o.sy:0,wallTop=.5-fraction;
 const material=new T.MeshLambertMaterial({map:facade(T,profile.style,profile.floors),color:0xffffff});material.color.multiplyScalar(.91+(profile.seed%9)*.01);
 const roofMap=roofTexture(T);roofMap.wrapT=T.RepeatWrapping;
 const roof=new T.MeshLambertMaterial({map:roofMap,color:PALETTE[profile.style][2],side:T.DoubleSide});
 const geometry=mesh.geometry,p=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;
 for(let i=0;i<p.count;i++){
  if(fraction)p.setY(i,(p.getY(i)+.5)*(1-fraction)-.5);
  const ny=normal.getY(i);
  if(Math.abs(ny)>.5)uv.setXY(i,p.getX(i)*o.sx/4,p.getZ(i)*o.sz/4);
  else uv.setXY(i,(-normal.getZ(i)*p.getX(i)*o.sx+normal.getX(i)*p.getZ(i)*o.sz)/4,(p.getY(i)+.5)/(1-fraction));
 }
 for(const group of geometry.groups){const i=geometry.index?geometry.index.getX(group.start):group.start;group.materialIndex=Math.abs(normal.getY(i))>.5?0:1;}
 p.needsUpdate=true;uv.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();
 for(const m of new Set(Array.isArray(mesh.material)?mesh.material:[mesh.material]))m.dispose();mesh.material=[roof,material];
 if(outline){
  const [a,b,c,d]=outline.map(([x,z])=>[x,wallTop,z]),r1=[(a[0]+d[0])/2,.5,(a[2]+d[2])/2],r2=[(b[0]+c[0])/2,.5,(b[2]+c[2])/2];
  const long=Math.hypot((b[0]-a[0])*o.sx,(b[2]-a[2])*o.sz),short=Math.hypot((d[0]-a[0])*o.sx,(d[2]-a[2])*o.sz);
  if(profile.roofShape==='hipped'){const t=Math.min(.35,short/long/2),dx=(r2[0]-r1[0])*t,dz=(r2[2]-r1[2])*t;r1[0]+=dx;r1[2]+=dz;r2[0]-=dx;r2[2]-=dz;}
  const positions=[],uvs=[],groups=[];
  const face=(verts,index)=>{const start=positions.length/3;for(const v of verts){positions.push(...v);uvs.push(v[0]*o.sx/4,v[2]*o.sz/4);}groups.push([start,verts.length,index]);};
  face([a,b,r2,a,r2,r1,d,r1,r2,d,r2,c],0);face([a,r1,d,b,c,r2],profile.roofShape==='hipped'?0:1);
  if(short>4&&long>5){
   const x=a[0]+(b[0]-a[0])*.4+(d[0]-a[0])*.25,z=a[2]+(b[2]-a[2])*.4+(d[2]-a[2])*.25,dx=.22/o.sx,dz=.22/o.sz,lo=.5-fraction*.72,hi=.5;
   const v=[[x-dx,lo,z-dz],[x+dx,lo,z-dz],[x+dx,lo,z+dz],[x-dx,lo,z+dz],[x-dx,hi,z-dz],[x+dx,hi,z-dz],[x+dx,hi,z+dz],[x-dx,hi,z+dz]];
   for(const [a,b,c,d]of [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]])face([v[a],v[b],v[c],v[a],v[c],v[d]],1);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeVertexNormals();for(const group of groups)g.addGroup(...group);
  const gp=g.attributes.position,gn=g.attributes.normal,gu=g.attributes.uv;for(const [start,count,index]of groups)if(index===1)for(let i=start;i<start+count;i++)gu.setXY(i,(-gn.getZ(i)*gp.getX(i)*o.sx+gn.getX(i)*gp.getZ(i)*o.sz)/4,(gp.getY(i)-wallTop)*o.sy/3);
  const gable=new T.MeshLambertMaterial({map:facade(T,profile.style,0),side:T.DoubleSide});const cap=new T.Mesh(g,[roof.clone(),gable]);cap.userData.ukRoof=true;cap.userData.id=o.id;cap.userData.editorObjectId=o.id;cap.castShadow=true;cap.receiveShadow=true;mesh.add(cap);
 }
 mesh.userData.ukBuilding={style:profile.style,floors:profile.floors,roof:outline?profile.roofShape:'flat',estimatedStyle:!o.properties?.ukStyle};mesh.castShadow=true;mesh.receiveShadow=true;
}
