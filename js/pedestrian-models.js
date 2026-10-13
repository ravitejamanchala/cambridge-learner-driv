const T=THREE;
export const HUMAN_MODELS=['Casual','Casual2','Suit','Worker'];
function cloneRig(source) {
 const clone=source.clone(true),copies=new Map();
 const pair=(a,b)=>{copies.set(a,b);for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);};pair(source,clone);
 source.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const copy=copies.get(mesh);copy.skeleton=mesh.skeleton.clone();copy.skeleton.bones=mesh.skeleton.bones.map(bone=>copies.get(bone));copy.bindMatrix.copy(mesh.bindMatrix);copy.bind(copy.skeleton,copy.bindMatrix);});
 return clone;
}
export function createPedestrianFactory(assetURL) {
 const models=HUMAN_MODELS.map(name=>new Promise(resolve=>{if(!T.GLTFLoader){resolve(null);return;}new T.GLTFLoader().load(assetURL('models/Human'+name+'.glb'),resolve,undefined,()=>resolve(null));}));
 return index=>{
  const group=new T.Group();group.name='crossing-pedestrian';
  const fallback=new T.Mesh(new T.CylinderGeometry(.23,.23,1.5,8),new T.MeshLambertMaterial({color:0x6b7297}));
  fallback.position.y=.85;group.add(fallback);
  let mixer=null,actions=null,current=null;
  const state={ready:false,character:HUMAN_MODELS[index%models.length],update(dt,walking){if(!mixer)return;const next=walking?'Walk':'Idle';if(next!==current){if(current)actions[current]?.fadeOut(.15);actions[next]?.reset().fadeIn(.15).play();current=next;}mixer.update(dt);}};
  group.userData.pedestrian=state;
  models[index%models.length].then(gltf=>{
   if(!gltf)return;
   const model=cloneRig(gltf.scene),body=new T.Group();body.add(model);body.updateMatrixWorld(true);
   const box=new T.Box3().setFromObject(body),height=box.max.y-box.min.y;if(height<=0)return;
   model.scale.multiplyScalar(1.75/height);body.updateMatrixWorld(true);const scaled=new T.Box3().setFromObject(body),center=scaled.getCenter(new T.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y-=scaled.min.y;body.rotation.y=Math.PI;
   group.remove(fallback);fallback.geometry.dispose();fallback.material.dispose();group.add(body);
   mixer=new T.AnimationMixer(model);actions={};for(const clip of gltf.animations){const name=clip.name.includes('Walk')?'Walk':'Idle';actions[name]=mixer.clipAction(clip);}
   state.ready=true;state.update(0,false);
  });
  return group;
 };
}
