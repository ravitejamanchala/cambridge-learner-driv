import {tileDetailQuery} from './tile-details.js';
import {coordinate,boundsCheck} from '../../js/personal/geometry.js';
const SOURCE='https://slaydrive-world-sources.manchala0024.workers.dev';
const DEMO='https://routing.openstreetmap.de/routed-car/route/v1/driving';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'X-Content-Type-Options':'nosniff','Cache-Control':'no-store',...headers}});
// Public geographic data only. No tracks, accounts, payment or admin writes.
// Search/base OSM use the existing globally throttled and cached SourceBroker.
// Supplementary tile markings use a fixed, bounded query with local cache/rate limits.
export async function handleMapRequest(request,env={},deps={}) {
  const url=new URL(request.url),path=url.pathname.replace(/^.*\/map-api\//,''),fetcher=deps.fetch||fetch,cache=deps.cache||globalThis.caches?.default;
  if(!['search','route','osm','tile-details'].includes(path))return json({message:'Unknown map request.'},404);
  if(request.method!==(path==='search'?'GET':'POST'))return json({message:'Method not allowed.'},405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({message:'Open route creation in the simulator.'},403);
  let upstream,options={headers:{'User-Agent':'SlayDrivePersonalRoutes/1.0 (https://github.com/ravitejamanchala/cambridge-learner-driv)','Accept':'application/json'},signal:AbortSignal.timeout(35000)},body;
  try{
    if(path!=='search'){const text=await request.text();if(text.length>2048)return json({message:'Map request is too large.'},413);body=JSON.parse(text);}
    if(path==='search'){
      const q=url.searchParams.get('q')?.trim();if(!q||q.length>200)throw Error('Enter a place name (up to 200 characters).');
      upstream=SOURCE+'/sources/search?q='+encodeURIComponent(q);
    }else if(path==='tile-details'){
      const query=tileDetailQuery(body?.bounds);upstream='https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query);
    }else if(path==='osm'){
      boundsCheck(body?.bounds);upstream=SOURCE+'/sources/osm';options={...options,method:'POST',headers:{...options.headers,'Content-Type':'application/json'},body:JSON.stringify({bounds:body.bounds})};
    }else{
      coordinate(body?.start);coordinate(body?.end);
      const preview=url.hostname.endsWith('.pages.dev')||['localhost','127.0.0.1'].includes(url.hostname);
      const router=env.PERSONAL_ROUTER_URL||(preview?DEMO:null);
      if(!router)return json({message:'Personal route generation is awaiting a routing provider. Existing saved and built-in drives are still available.'},503);
      const base=new URL(router);if(base.protocol!=='https:'||base.username||base.password)throw Error('Routing provider configuration is invalid.');
      // No distance cap. The routing service may have its own capacity limits.
      upstream=router.replace(/\/$/,'')+'/'+[body.start,body.end].map(p=>p.join(',')).join(';')+'?overview=full&geometries=geojson&steps=false&alternatives=false';
    }
  }catch(e){return json({message:e.message||'Invalid map request.'},400);}
  // Cache routing and supplementary detail results; the broker owns base OSM caching.
  const key=['route','tile-details'].includes(path)?new Request(upstream):null;
  if(key){const hit=await cache?.match(key);if(hit)return hit;
    const client=request.headers.get('CF-Connecting-IP');
    if(client&&cache){const rateKey=new Request(url.origin+'/map-api/rate/'+path+'/'+encodeURIComponent(client)),recent=await cache.match(rateKey);if(recent)return json({message:'Please wait a moment before generating another route.'},429,{'Retry-After':'5'});await cache.put(rateKey,new Response('1',{headers:{'Cache-Control':'max-age=5'}}));}
  }
  try{
    let target=upstream;
    if(path==='tile-details'){const provider=new URL(upstream),query=provider.searchParams.get('data');provider.search='';target=provider.href;options={...options,method:'POST',headers:{...options.headers,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}).toString()};}
    const response=await fetcher(target,options);
    if(!response.ok)return json({message:response.status===429?'The map provider is busy. Please wait and retry.':response.status===400&&path==='route'?'The routing provider cannot connect these pins. Choose points on connected public roads.':'The map provider is unavailable. Please retry shortly.'},response.status===429?429:502,{'Retry-After':response.headers.get('Retry-After')||'6'});
    // Bound response size without buffering an unbounded provider response.
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12*1024*1024){await reader.cancel();return json({message:'The map provider response was too large. Try a less detailed route or retry later.'},422);}chunks.push(value);}}finally{reader.releaseLock();}
    const data=JSON.parse(await new Blob(chunks).text());
    if(path==='route'&&(data.code!=='Ok'||!data.routes?.length))return json({message:'No driving route connects those pins. Try nearby public roads.'},422);
    if(['osm','tile-details'].includes(path)&&(!Array.isArray(data.elements)||data.remark))return json({message:'The map provider returned an incomplete area. Retry this section.'},502);
    const out=json(data,200,key?{'Cache-Control':'public, max-age=3600'}:{});if(key)await cache?.put(key,out.clone());return out;
  }catch{return json({message:'The map service did not respond in time. Please retry.'},502);}
}
