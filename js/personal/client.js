import {coordinate,measure,encode,decode,section} from './geometry.js';
import {routeStore} from './storage.js';
import {cityRouteSource} from './city-source.js';
export function abortableDelay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(new DOMException('Cancelled','AbortError'));const stop=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));},timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);signal?.addEventListener('abort',stop,{once:true});});}
export async function request(path,{signal,body,onStatus,fetcher=fetch}={}) {
  for(let attempt=0;attempt<3;attempt++){
    const timeout=new AbortController(),cancel=()=>timeout.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timer=setTimeout(()=>timeout.abort(),45000);let response;
    try{response=await fetcher(new URL('map-api/'+path,document.baseURI),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:timeout.signal});}
    catch(e){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');throw Error(e.name==='AbortError'?'The map service timed out. Please retry.':'The map service is unavailable. Check your connection and retry.');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    if(response.status===429&&attempt<2){const header=response.headers.get('Retry-After'),seconds=Number(header)||Math.ceil((Date.parse(header)-Date.now())/1000)||6;const delay=Math.max(1,Math.min(60,seconds));onStatus?.(`Map provider is busy. Retrying in ${delay} seconds…`);await abortableDelay(delay*1000,signal);continue;}
    const data=await response.json().catch(()=>null);if(!response.ok)throw Error(data?.message||'The map provider could not complete this request. Please retry.');return data;
  }
}
export async function findRoute(start,end,options={}) {
  coordinate(start);coordinate(end);
  const result=await request('route',{...options,body:{start,end}}),route=result.routes?.[0],coordinates=route?.geometry?.coordinates;
  const measured=measure(coordinates);
  if(!Array.isArray(result.waypoints)||result.waypoints.length!==2)throw Error('The routing service did not confirm your start and finish.');
  for(const p of result.waypoints)coordinate(p.location);
  if(result.waypoints.some(p=>!Number.isFinite(p.distance)||p.distance>250))throw Error('A pin is too far from a drivable road. Move it closer to the road and try again.');
  return {version:1,id:crypto.randomUUID(),title:'My route',createdAt:Date.now(),start:[...start],end:[...end],snappedStart:result.waypoints[0].location,snappedEnd:result.waypoints[1].location,geometry:encode(measured.coordinates),distance:measured.length,duration:Number.isFinite(route.duration)?route.duration:0,provider:'OSRM',attribution:'© OpenStreetMap contributors (ODbL)'};
}
function convert(osm,part,signal) {
  return new Promise((resolve,reject)=>{
    const built=!!document.querySelector('meta[name=app-release],meta[name=world-built]'),worker=new Worker(new URL(built?'personal-worker.js':'js/personal/generator-worker.js',document.baseURI),{type:'module'});
    const stop=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);},cancel=()=>{stop();reject(new DOMException('Cancelled','AbortError'));};
    if(signal?.aborted)return cancel();signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=({data})=>{stop();data.error?reject(Error(data.error)):resolve(data.track);};worker.onerror=()=>{stop();reject(Error('Map generation failed. Please retry.'));};worker.postMessage({osm,part,wholeRoute:true});
  });
}
export function createJourney(recipe,{store=routeStore(),onStatus=()=>{},fetchSection=request,generate=convert,requestInterval=5200,citySource=cityRouteSource}={}) {
  const route=measure(decode(recipe.geometry)),controller=new AbortController(),count=Math.ceil(route.length/600);
  let prepared=null,pending=null,lastRequest=0;
  const check=()=>{if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');};
  async function prepare(){
    check();if(prepared)return prepared;if(pending)return pending;
    pending=(async()=>{
      if(recipe.savedWorld){onStatus('Restoring your exact saved map…');const {restoreWorld}=await import('./saved-world.js');const saved=await restoreWorld(recipe);check();prepared=saved.track;return prepared;}
      const city=await citySource?.(route,{signal:controller.signal,onStatus});check();
      if(city){onStatus('Building roads and scenery from the Cambridge dataset…');prepared=await generate(city.data,city.part,controller.signal);check();return prepared;}
      const elements=new Map(),bounds=[Infinity,Infinity,-Infinity,-Infinity];let timestamp;
      for(let index=0;index<count;index++){
        check();const part=section(route,index);onStatus(`Preparing your whole route · map ${index+1} of ${count}…`);
        let source=store.getSection(recipe.id,index);
        if(source?.kind!=='osm-source'||JSON.stringify(source.bounds)!==JSON.stringify(part.bounds)){
          await abortableDelay(Math.max(0,lastRequest+requestInterval-Date.now()),controller.signal);lastRequest=Date.now();
          const osm=await fetchSection('osm',{body:{bounds:part.bounds},signal:controller.signal,onStatus});check();
          if(osm?.remark||!Array.isArray(osm?.elements)||osm.elements.length>30000)throw Error('The map provider returned an incomplete or oversized area. Retry before starting the drive.');
          source={kind:'osm-source',bounds:part.bounds,elements:osm.elements,osm3s:osm.osm3s};store.putSection(recipe.id,index,source);
        }
        // Adjacent requests overlap. Union source IDs before conversion so a road,
        // junction, building or signal crossing a data tile is created only once.
        for(const element of source.elements){const key=element.type+':'+element.id,old=elements.get(key);if(!old||(element.version||0)>=(old.version||0))elements.set(key,element);}
        if(elements.size>600000)throw Error('This route has more map detail than this browser can prepare safely. Your saved route is kept.');
        bounds[0]=Math.min(bounds[0],part.bounds[0]);bounds[1]=Math.min(bounds[1],part.bounds[1]);bounds[2]=Math.max(bounds[2],part.bounds[2]);bounds[3]=Math.max(bounds[3],part.bounds[3]);timestamp=source.osm3s||timestamp;
      }
      check();onStatus('Building continuous roads and preparing scenery tiles…');
      const track=await generate({elements:[...elements.values()],osm3s:timestamp},{bounds,coordinates:route.coordinates,sourceSections:count},controller.signal);check();
      prepared=track;return track;
    })();
    try{return await pending;}finally{pending=null;}
  }
  return {recipe,route,prepare,cancel:()=>controller.abort(),get cancelled(){return controller.signal.aborted;},get ready(){return !!prepared;}};
}
