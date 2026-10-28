// Original modular street frontages, inspired by common UK terrace/shop details.
// All vertices remain inside the mapped footprint and total height. A single
// vertex-colour mesh per frontage, with distance LOD, keeps draw calls bounded.
export function addUKFrontage(T,mesh,o,profile,{outline,front,brick,roofFraction=0}={}){
 if(!outline||!['terrace','buff-brick','render','stone','shop','apartment'].includes(profile.style)||o.sy<3||profile.floors>6)return;
 const ring=outline.map(([x,z])=>[x*o.sx,z*o.sz]);
 const c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0),toward=front?[c*front.x-s*front.z,s*front.x+c*front.z]:[0,1];
 const faces=ring.map((a,i)=>{const b=ring[(i+1)%ring.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/L,(b[1]-a[1])/L],N=[u[1],-u[0]],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(N[0]*mid[0]+N[1]*mid[1]<0){N[0]*=-1;N[1]*=-1;}return {a,b,L,u,N,score:N[0]*toward[0]+N[1]*toward[1]};}).sort((a,b)=>b.score-a.score);
 const {a,L,u,N}=faces[0];if(L<3.2||L>80)return;
 const wallH=o.sy*(1-roofFraction),floorH=wallH/profile.floors;if(floorH<1.8)return;
 const units=Math.max(1,Math.min(24,Math.round(L/5.2))),unit=L/units,inset=.28;
 // Recess the wall body to make room for bay fronts, sills and cornices without
 // extending any detail into the pavement. The roof still follows the source.
 let g=mesh.geometry;if(g.index){const old=g;g=g.toNonIndexed();mesh.geometry=g;old.dispose();}
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,plane=N[0]*a[0]+N[1]*a[1];
 for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)*o.sx*N[0]+p.getZ(i)*o.sz*N[1]-plane)<.001){p.setX(i,p.getX(i)-N[0]*inset/o.sx);p.setZ(i,p.getZ(i)-N[1]*inset/o.sz);}
 const plain=new T.MeshLambertMaterial({map:brick});mesh.material.push(plain);const frontIndex=mesh.material.length-1;g.clearGroups();let last=-1,start=0;
 for(let i=0;i<p.count;i+=3){const nx=n.getX(i)/o.sx,nz=n.getZ(i)/o.sz,face=(nx*N[0]+nz*N[1])/(Math.hypot(nx,nz)||1)>.85,index=Math.abs(n.getY(i))>.5?0:face?frontIndex:1;if(index!==last){if(last>=0)g.addGroup(start,i-start,last);last=index;start=i;}if(face)for(let j=i;j<i+3;j++)uv.setXY(j,(p.getX(j)*o.sx*u[0]+p.getZ(j)*o.sz*u[1])/2.4,(p.getY(j)+.5)*o.sy/3);}
 if(last>=0)g.addGroup(start,p.count-start,last);p.needsUpdate=uv.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
 const positions=[],colours=[],shade={terrace:0x945a46,'buff-brick':0xb4a17c,render:0xd8d3bf,stone:0xb7af98,shop:0x8e6753,apartment:0xb9b1a3},frame=0xe1ddcb,glass=0x536873,stone=0xbcb5a0,roof=0x4c5358,door=profile.seed%2?0x344a42:0x304658;
 const box=(t,y,w,h,depth,fromBoundary,color)=>{
  const centre=[a[0]+u[0]*t-N[0]*fromBoundary,y-o.sy/2,a[1]+u[1]*t-N[1]*fromBoundary],verts=[];
  for(const [x,dy,z]of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]])verts.push([(centre[0]+u[0]*x*w/2+N[0]*z*depth/2)/o.sx,(centre[1]+dy*h/2)/o.sy,(centre[2]+u[1]*x*w/2+N[1]*z*depth/2)/o.sz]);
  const col=new T.Color(color);
  for(const face of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])for(const k of (u[0]*N[1]-u[1]*N[0]<0?[0,2,1,0,3,2]:[0,1,2,0,2,3])){positions.push(...verts[face[k]]);colours.push(col.r,col.g,col.b);}
 };
 const window=(t,bottom,w,h,bay=false)=>{
  const d=bay?.12:.21;
  if(bay)box(t,bottom+h/2,w+.18,h+.26,.22,.145,shade[profile.style]);
  box(t,bottom+h/2,w,h,.03,d,glass);
  for(const dt of [-w/2,w/2,0])box(t+dt,bottom+h/2,.055,h+.08,.06,d-.025,frame);
  for(const dy of [0,h*.5,h])box(t,bottom+dy,w+.1,.055,.06,d-.025,frame);
  box(t,bottom-.09,w+.24,.13,.16,Math.max(.095,d-.025),stone);
  box(t,bottom+h+.1,w+.22,.12,.12,Math.max(.095,d-.025),stone);
  if(bay)box(t,bottom+h+.23,w+.3,.09,.24,.14,roof);
 };
 const residential=['terrace','buff-brick','render'].includes(profile.style);
 let bays=0;
 for(let k=0;k<units;k++){
  const begin=k*unit,mid=begin+unit/2;
  if(profile.style==='shop'){
   const fasciaY=Math.min(floorH-.25,2.65),displayH=Math.max(1.2,fasciaY-.65),displayW=unit*.57;
   box(mid,fasciaY,unit-.3,.34,.13,.13,door);
   window(begin+unit*.35,.35,displayW,displayH,false);
   box(begin+unit*.81,1.05,unit*.19,2.1,.08,.19,door);box(begin+unit*.81,1.3,unit*.13,1.05,.03,.13,glass);
   for(const t of [begin+.15,begin+unit-.15])box(t,fasciaY/2,.13,fasciaY,.15,.14,stone);
  }else{
   window(begin+unit*.32,.6,Math.min(1.25,unit*.28),Math.min(1.35,floorH-.95),residential);if(residential)bays++;
   const t=begin+unit*.76,h=Math.min(2,floorH-.25),w=Math.min(.85,unit*.2);
   box(t,h/2,w,h,.07,.21,door);for(const dt of [-w/2-.035,w/2+.035])box(t+dt,(h+.1)/2,.075,h+.1,.09,.17,frame);box(t,h+.03,w+.15,.08,.1,.17,stone);box(t,.045,w+.2,.09,.22,.13,stone);
   for(const y of [h*.28,h*.66])box(t,y,w*.65,h*.23,.025,.16,profile.seed%2?0x536657:0x526477);
   box(t+w*.33,h*.5,.035,.035,.03,.125,0xb3a16b);
  }
  for(let floor=1;floor<profile.floors;floor++)for(const t of [begin+unit*.3,begin+unit*.73])window(t,floor*floorH+.4,Math.min(1.15,unit*.25),Math.min(1.4,floorH-.8));
 }
 // Shallow string course, cornice and gutter: an architectural silhouette rather
 // than a repeating picture pasted onto the entire house.
 for(let floor=1;floor<profile.floors;floor++)box(L/2,floor*floorH,L-.12,.07,.13,.16,stone);
 box(L/2,wallH-.08,L-.1,.1,.16,.12,roof);
 const detailG=new T.BufferGeometry();detailG.setAttribute('position',new T.Float32BufferAttribute(positions,3));detailG.setAttribute('color',new T.Float32BufferAttribute(colours,3));detailG.computeVertexNormals();detailG.computeBoundingBox();detailG.computeBoundingSphere();
 const detail=new T.Mesh(detailG,new T.MeshLambertMaterial({vertexColors:true}));detail.castShadow=true;detail.receiveShadow=true;detail.userData.id=o.id;detail.userData.editorObjectId=o.id;
 const lod=new T.LOD();lod.addLevel(detail,0);lod.addLevel(new T.Object3D(),160);lod.userData.ukFrontage=true;mesh.add(lod);
 mesh.userData.ukFrontage={units,bays,style:profile.style,estimated:true,lodDistance:160};
}
