import { CARS, carById } from './cars.js';
const T=THREE;
export function createGarage({player,load,prefs,save}) {
 const sheet=document.getElementById('carSheet'),list=document.getElementById('carList'),status=document.getElementById('carStatus'),preview=document.getElementById('carPreview');
 const cache=new Map();let selected=null,request=0,renderer=null,scene=null,camera=null;
 list.innerHTML=CARS.map(c=>`<button class="tile car-choice" data-car="${c.id}" role="radio" aria-checked="false"><span class="car-symbol" aria-hidden="true"><svg viewBox="0 0 64 40"><path d="M6 25v-8l10-2 9-10h20l8 12 6 3v10H6z" fill="var(--lav)" stroke="var(--lav-deep)" stroke-width="2" stroke-linejoin="round"/><path d="m28 9-6 8h25l-5-8z" fill="var(--cream)"/><circle cx="17" cy="30" r="6" fill="var(--plum)"/><circle cx="49" cy="30" r="6" fill="var(--plum)"/></svg></span><span class="tt">${c.title}</span><span class="car-selected">Selected</span></button>`).join('');
 function draw() {
  if(sheet.hidden||!selected)return;
  if(!renderer){renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));preview.appendChild(renderer.domElement);scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x8a6a50,1));const light=new T.DirectionalLight(0xffffff,1);light.position.set(3,6,-4);scene.add(light);camera=new T.PerspectiveCamera(38,1,.1,50);}
  const old=scene.getObjectByName('preview-car');if(old)scene.remove(old);
  const model=new T.Group();model.name='preview-car';for(const child of player.mesh.children)model.add(child.clone(true));scene.add(model);
  camera.position.set(5,2.8,-5.5);camera.lookAt(0,.65,0);
  const width=Math.max(1,preview.clientWidth),height=preview.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);
 }
 async function choose(id,persist=true) {
  const car=carById(id),token=++request;status.textContent='Loading '+car.title+'…';list.setAttribute('aria-busy','true');
  try {
   if(!cache.has(car.id))cache.set(car.id,load(car));
   const model=await cache.get(car.id);if(token!==request)return false;
   player.setModel(model);player.sync(0);selected=car;player.carId=car.id;
   list.querySelectorAll('[data-car]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.car===car.id)));
   document.getElementById('carName').textContent=car.title;status.textContent=car.title+' selected';
   if(persist){prefs.car=car.id;save();}draw();return true;
  }catch(error){cache.delete(car.id);if(token===request)status.textContent='Could not load this car. Your current car is still available. Try again.';return false;}
  finally{if(token===request)list.removeAttribute('aria-busy');}
 }
 list.addEventListener('click',e=>{const button=e.target.closest('[data-car]');if(button)choose(button.dataset.car);});
 document.addEventListener('click',e=>{if(e.target.closest('[data-open="carSheet"]'))requestAnimationFrame(draw);});
 new ResizeObserver(()=>draw()).observe(preview);
 return {choose,ready:choose(prefs.car,false)};
}
