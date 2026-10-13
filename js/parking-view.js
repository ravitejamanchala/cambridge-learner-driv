import { WORLD } from './config.js';
import { makeBoxCar } from './car.js';
import { rectangleCorners } from './parking-geometry.js';
const T = THREE;
export function buildParkingWorld(scene, layout) {
  scene.background = new T.Color(WORLD.sky); scene.fog = new T.Fog(WORLD.sky, 100, 250);
  scene.add(new T.HemisphereLight(0xe3ecf5, 0x7d7666, 0.9));
  const sun = new T.DirectionalLight(0xffe4c2, 0.9); sun.position.set(-25, 55, 20); sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left:-40,right:40,top:40,bottom:-40,near:1,far:120});sun.shadow.mapSize.set(1024,1024);scene.add(sun,sun.target);
  const ground = new T.Mesh(new T.PlaneGeometry(400,400),new T.MeshLambertMaterial({color:WORLD.ground}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const pad = new T.Mesh(new T.PlaneGeometry(layout.bounds.width,layout.bounds.length),new T.MeshLambertMaterial({color:0x484b50}));pad.rotation.x=-Math.PI/2;pad.position.set(layout.bounds.x,.01,layout.bounds.z);pad.receiveShadow=true;scene.add(pad);
  function outline(rect, material) { const p=rectangleCorners(rect), points=[];for(let i=0;i<4;i++)points.push(new T.Vector3(p[i].x,.04,p[i].z),new T.Vector3(p[(i+1)%4].x,.04,p[(i+1)%4].z));return new T.LineSegments(new T.BufferGeometry().setFromPoints(points),material); }
  const white = new T.LineBasicMaterial({color:0xf2f1ea});
  for(const z of [-4,0,4])scene.add(outline({...layout.bay,z},white));
  for(const o of layout.obstacles){const m=makeBoxCar(o.id==='parked-0'?0x55606a:0x2f4f6f,false);m.position.set(o.x,0,o.z);m.rotation.y=o.th;m.traverse(c=>{if(c.isMesh)c.castShadow=true;});scene.add(m);}
  const bounds=layout.bounds, wallMat=new T.MeshLambertMaterial({color:0xbbb5a5});
  for(const [x,z,w,l] of [[bounds.x-bounds.width/2,bounds.z,.2,bounds.length],[bounds.x+bounds.width/2,bounds.z,.2,bounds.length],[bounds.x,bounds.z-bounds.length/2,bounds.width,.2],[bounds.x,bounds.z+bounds.length/2,bounds.width,.2]]){const wall=new T.Mesh(new T.BoxGeometry(w,.55,l),wallMat);wall.position.set(x,.275,z);wall.castShadow=true;scene.add(wall);}
  const goalMaterial=new T.LineBasicMaterial({color:0xffb21a}), goal=new T.Group();scene.add(goal);
  const arrow=new T.ArrowHelper(new T.Vector3(0,0,-1),new T.Vector3(0,.15,0),1.8,0xffb21a,.45,.3);scene.add(arrow);
  let targetRef=null,line=null,lastPath=null,pathLine=null;
  function setParkingTarget(target,path,grade){
    if(target!==targetRef){if(line){goal.remove(line);line.geometry.dispose();}line=outline(target,goalMaterial);goal.add(line);targetRef=target;arrow.position.set(target.x,.15,target.z);arrow.setDirection(new T.Vector3(-Math.sin(target.th),0,-Math.cos(target.th)));}
    const color=grade.valid?0x2fbf71:0xffb21a;goalMaterial.color.setHex(color);arrow.setColor(color);
    if(path!==lastPath){if(pathLine){scene.remove(pathLine);pathLine.geometry.dispose();pathLine.material.dispose();}pathLine=new T.Line(new T.BufferGeometry().setFromPoints(path.map(p=>new T.Vector3(p.x,.055,p.z))),new T.LineBasicMaterial({color:0x82d9ef,transparent:true,opacity:.65}));scene.add(pathLine);lastPath=path;}
  }
  return {setParkingTarget,showParkingGuide(on){if(pathLine)pathLine.visible=on;},updateChunks(){},updateSignals(){},updateSun(x,z){sun.target.position.set(x,0,z);},setShadows(on){sun.castShadow=!!on;}};
}
