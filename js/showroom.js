// Independent home presentation. The player's model and driving camera are never animated here.
const T=THREE;
export function createShowroom(stage) {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let renderer=null,scene=null,camera=null,model=null,frame=null,last=0,phase=0,failed=false,inView=true;
 let fitWidth=3.9,fitHeight=2.34;
 const visible=()=>inView&&document.body.dataset.mode==='lobby'&&!document.hidden&&![...document.querySelectorAll('.sheet')].some(s=>!s.hidden);
 function draw() {
  if(!renderer||!model||failed)return;
  const width=stage.clientWidth,height=stage.clientHeight;if(!width||!height)return;
  const aspect=width/height,halfHeight=Math.max(fitHeight,fitWidth/aspect);
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();
  if(renderer.domElement.width!==Math.round(width*renderer.getPixelRatio())||renderer.domElement.height!==Math.round(height*renderer.getPixelRatio()))renderer.setSize(width,height,false);
  model.rotation.y=reduced.matches?0:Math.sin(phase)*.12;
  renderer.render(scene,camera);stage.classList.add('ready');
 }
 function tick(time) {
  frame=null;if(!visible()||failed)return;
  if(time-last>=1000/30){phase+=Math.min((time-last)/1000,.05)*.45;last=time;draw();}
  frame=requestAnimationFrame(tick);
 }
 function sync() {
  if(frame!==null)cancelAnimationFrame(frame);frame=null;
  if(!visible()||!model||failed)return;
  draw();last=performance.now();if(!reduced.matches)frame=requestAnimationFrame(tick);
 }
 function init() {
  renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputEncoding=T.sRGBEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');stage.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',()=>{failed=true;stage.classList.remove('ready');if(frame!==null)cancelAnimationFrame(frame);frame=null;});
  scene=new T.Scene();scene.add(new T.HemisphereLight(0xfff8ef,0x927975,.95));
  const key=new T.DirectionalLight(0xffffff,1.3);key.position.set(3,8,-6);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5});key.shadow.normalBias=.02;scene.add(key);
  const fill=new T.DirectionalLight(0xd9e5ff,.65);fill.position.set(-5,3,2);scene.add(fill);
  const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({opacity:.16}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
  camera=new T.OrthographicCamera(-3.9,3.9,2.34,-2.34,.1,50);camera.position.set(6,3.1,-7);camera.lookAt(0,.65,0);
 }
 new ResizeObserver(sync).observe(stage);
 new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;sync();}).observe(stage);
 const observer=new MutationObserver(sync);observer.observe(document.body,{attributes:true,attributeFilter:['data-mode']});document.querySelectorAll('.sheet').forEach(sheet=>observer.observe(sheet,{attributes:true,attributeFilter:['hidden']}));
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 return {update(source){
  if(failed)return;
  try {
   if(!renderer)init();if(model)scene.remove(model);
   model=new T.Group();for(const child of source.children)model.add(child.clone(true));
   model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);phase=0;
   // Frame the selected model, not a fixed viewport-sized box. The garage now fits
   // beside the next lesson and must also show the longer cars on a narrow phone.
   model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(model);
   if(!bounds.isEmpty()){
    fitWidth=0;fitHeight=0;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
     const p=new T.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
     fitWidth=Math.max(fitWidth,Math.abs(p.x)*1.15);fitHeight=Math.max(fitHeight,Math.abs(p.y)*1.15);
    }
   }
   sync();
  }catch(_){failed=true;stage.classList.remove('ready');renderer?.dispose();}
 }};
}
