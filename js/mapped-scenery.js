import {footprintGeometry} from './editor-footprint.js';
const colors={grass:0x82926b,forest:0x5b7956,park:0x7f9567,garden:0x739160,sports:0x809c72,water:0x5b8997,parking:0x929896,plaza:0xb1aaa0,industrial:0x96968e,gravel:0xb1a890,cemetery:0x8a987e,railway:0x918c83,sand:0xcabb96,footway:0xb7aea0,cycleway:0x9d9e91,path:0xb1a080,pedestrian:0xb7aea0,steps:0xaaa69b,bridleway:0xae9d7a,wall:0x9e8e80,fence:0x7c807b,hedge:0x4f734a,rail:0x777a7b};
// Own simple meshes; no competitor code or models. The native object envelope stays unchanged.
export function mappedAppearance(T,m,o){
 const kind=o.properties?.mapFeature;if(!kind)return false;
 m.geometry.dispose();(Array.isArray(m.material)?m.material:[m.material]).forEach(v=>v.dispose());
 const mat=color=>new T.MeshLambertMaterial({color});
 if(o.properties.footprint?.length>2){m.geometry=footprintGeometry(T,o.properties.footprint,o.properties.holes||[]);const material=mat(colors[kind]||0x8d9887);m.material=[material,material];}
 else {m.geometry=new T.BoxGeometry(1,1,1);m.material=mat(colors[kind]||0x737c78);}
 const add=(geometry,color,x,y,z)=>{const c=new T.Mesh(geometry,mat(color));c.position.set(x,y,z);c.userData.id=o.id;c.userData.editorObjectId=o.id;m.add(c);return c;};
 if(['tree','lamp','bench','bin','bollard','gate','postBox','bicycleParking','busStop','sign'].includes(kind)){
  m.geometry.dispose();m.geometry=new T.BufferGeometry();
  if(kind==='tree'){add(new T.CylinderGeometry(.05,.07,.65,7),0x75654f,0,-.175,0);add(new T.SphereGeometry(.5,8,6),0x55764b,0,.15,0).scale.y=.7;}
  else if(kind==='lamp'||kind==='busStop'||kind==='sign'){add(new T.CylinderGeometry(.35,.5,1,8),0x555f64,0,0,0);if(kind==='lamp')add(new T.BoxGeometry(3,.05,2),0xe3dbc1,1,.48,0);else add(new T.BoxGeometry(kind==='sign'?1:2,.2,.2),kind==='busStop'?0xbb5439:0xd4dad7,0,.35,0);}
  else if(kind==='bench'){add(new T.BoxGeometry(1,.12,1),0x8d7860,0,0,0);add(new T.BoxGeometry(1,.45,.12),0x8d7860,0,.25,.4);for(const x of [-.35,.35])add(new T.BoxGeometry(.08,.5,.8),0x535d5c,x,-.25,0);}
  else if(kind==='bollard'||kind==='bin'||kind==='postBox')add(new T.CylinderGeometry(.45,.5,1,8),kind==='postBox'?0xa84236:0x59635d,0,0,0);
  else {add(new T.BoxGeometry(1,.1,.2),0x6c787a,0,.25,0);for(const x of [-.45,.45])add(new T.BoxGeometry(.1,1,.2),0x6c787a,x,0,0);}
 }
 // Draw surfaces before the road ribbons, whose materials deliberately do not
 // write depth. Otherwise a park polygon can visually paint over the road.
 if(o.type==='marking')m.renderOrder=-.5;
 m.receiveShadow=true;return true;
}
