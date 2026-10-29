import {coordinate,measure,encode,decode,section} from './geometry.js';
import {routeStore} from './storage.js';
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
    const built=!!document.querySelector('meta[name=app-release]'),worker=new Worker(new URL(built?'personal-worker.js':'js/personal/generator-worker.js',document.baseURI),{type:'module'});
    const stop=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);},cancel=()=>{stop();reject(new DOMException('Cancelled','AbortError'));};
    if(signal?.aborted)return cancel();signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=({data})=>{stop();data.error?reject(Error(data.error)):resolve(data.track);};worker.onerror=()=>{stop();reject(Error('Map generation failed. Please retry.'));};worker.postMessage({osm,part});
  });
}
export function createJourney(recipe,{store=routeStore(),onStatus=()=>{},fetchSection=request,generate=convert}={}) {
  const route=measure(decode(recipe.geometry)),cache=new Map(),pending=new Map(),controller=new AbortController();let lastRequest=0;
  async function get(index){
    if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(cache.has(index))return cache.get(index);if(pending.has(index))return pending.get(index);
    const job=(async()=>{
      const part=section(route,index);onStatus(`Loading roads and buildings · section ${index+1} of ${part.count}…`);
      let track=store.getSection(recipe.id,index);
      if(!track?.plan?.nodes?.length||track.buildingStyle!=='simulator'){
        await abortableDelay(Math.max(0,lastRequest+5200-Date.now()),controller.signal);lastRequest=Date.now();
        const osm=await fetchSection('osm',{body:{bounds:part.bounds},signal:controller.signal,onStatus});
        onStatus('Preparing roads, junctions and buildings…');track=await generate(osm,part,controller.signal);store.putSection(recipe.id,index,track);
      }
      if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
      cache.set(index,track);for(const key of cache.keys())if(key<index-1||key>index+1)cache.delete(key);return track;
    })();pending.set(index,job);try{return await job;}finally{pending.delete(index);}
  }
  return {recipe,route,get,cancel:()=>controller.abort(),get cancelled(){return controller.signal.aborted;},prefetch(index){if(index<Math.ceil(route.length/600))get(index).catch(()=>{});}};
}
