import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {BufferGeometryUtils} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {addStreet} from './street-renderer.js';
import {surfaceGeometry} from '../road-surfaces.js';

export function createViewer(container){
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputEncoding=T.sRGBEncoding;
  renderer.clippingPlanes=[new T.Plane(new T.Vector3(1,0,0),500),new T.Plane(new T.Vector3(-1,0,0),500),new T.Plane(new T.Vector3(0,0,1),500),new T.Plane(new T.Vector3(0,0,-1),500)];
  container.append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D tile. Drag to orbit, right drag to pan, scroll to zoom.');
  const scene=new T.Scene();scene.background=new T.Color('#e4ebef');
  const camera=new T.PerspectiveCamera(42,1,.5,6000),controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=20;controls.maxDistance=4000;controls.maxPolarAngle=Math.PI*.49;controls.enableDamping=false;
  scene.add(new T.HemisphereLight(0xeaf3ff,0x82765d,.7));const sun=new T.DirectionalLight(0xffefdb,.65);sun.position.set(-400,650,300);scene.add(sun);
  let group=null,guidance=null,guidesVisible=true;
  function render(){if(container.hidden||!container.clientWidth||!container.clientHeight)return;renderer.setSize(container.clientWidth,container.clientHeight,false);camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);renderer.domElement.dataset.drawCalls=String(renderer.info.render.calls);}
  controls.addEventListener('change',render);new ResizeObserver(render).observe(container);
  function reset(){const box=container.parentElement.getBoundingClientRect(),aspect=box.width/Math.max(1,box.height),half=Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(1,aspect)),distance=720/Math.sin(half)*1.08;controls.target.set(0,0,0);camera.position.set(.65,.9,.8).normalize().multiplyScalar(distance);controls.update();render();}
  function clear(){if(!group)return;scene.remove(group);group.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[])){m.map?.dispose();m.dispose();}});group=null;}
  function mesh(geometry,color,y){const material=new T.MeshLambertMaterial({color:new T.Color(color).convertSRGBToLinear(),side:T.DoubleSide});const m=new T.Mesh(geometry,material);m.position.y=y;group.add(m);}
  function show(tile){
    clear();group=new T.Group();scene.add(group);
    const plane=new T.PlaneGeometry(1000,1000);plane.rotateX(-Math.PI/2);mesh(plane,0xc5d0b4,-.03);
    const landColors={water:0x8fbfc9,park:0xaac38d,forest:0x96b285,grass:0xb5cb9b,garden:0xb4c59d,sports:0x91b6a3,parking:0xb2b6b6,plaza:0xd6cdbb,industrial:0xc6c4b8,sand:0xe1d6b5};
    for(const area of tile.land||[])mesh(surfaceGeometry(T,area.polygons),landColors[area.kind],-.01);
    for(const [kind,color,y]of [['pave',0xd8d3c9,.01],['kerb',0xc9c5b9,.015],['road',0x454b50,.03]]){
      const polys=tile.surfaces.flatMap(s=>s[kind]);if(polys.length)mesh(surfaceGeometry(T,polys),color,y);
    }
    const geometries=[];
    for(const b of tile.buildings){
      const path=(ring,Type)=>{const p=new Type();ring.forEach(([x,z],i)=>i?p.lineTo(x,-z):p.moveTo(x,-z));p.closePath();return p;};
      const shape=path(b.rings[0],T.Shape);shape.holes=b.rings.slice(1).map(r=>path(r,T.Path));
      const geometry=new T.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,b.bottom,0);geometry.clearGroups();
      const walls=new T.Color(/industrial|warehouse/.test(b.type)?0xc6c5bd:/apartments|office/.test(b.type)?0xd1c4b0:0xc4937b).convertSRGBToLinear(),roof=new T.Color(0x747a7e).convertSRGBToLinear(),colors=[];
      for(let i=0;i<geometry.attributes.position.count;i++){const c=geometry.attributes.normal.getY(i)>.5?roof:walls;colors.push(c.r,c.g,c.b);}
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometries.push(geometry);
    }
    if(geometries.length){const combined=BufferGeometryUtils.mergeBufferGeometries(geometries);geometries.forEach(g=>g.dispose());const material=new T.MeshLambertMaterial({vertexColors:true});group.add(new T.Mesh(combined,material));}
    guidance=addStreet(group,tile.street);guidance.visible=guidesVisible;renderer.domElement.dataset.streetAssets=String(tile.street.objects.length);
    const border=new T.BufferGeometry().setFromPoints([[-500,-500],[500,-500],[500,500],[-500,500],[-500,-500]].map(([x,z])=>new T.Vector3(x,.1,z)));group.add(new T.Line(border,new T.LineBasicMaterial({color:0xe56a9f})));
    renderer.domElement.dataset.buildings=String(tile.buildings.length);renderer.domElement.dataset.center=tile.selection.center.join(',');reset();
  }
  return {show,clear,reset,render,setGuides(value){guidesVisible=value;if(guidance)guidance.visible=value;render();},stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
}
