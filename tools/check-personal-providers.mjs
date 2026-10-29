import fs from 'node:fs';import {generateSection} from '../js/personal/section.js';import {measure,section} from '../js/personal/geometry.js';
const base=process.env.PREVIEW_URL;if(!base)throw Error('Set PREVIEW_URL to the isolated preview.');
const result={source:'live providers through the deployed Pages map proxy',at:new Date().toISOString(),checks:[]};
async function request(path,body){for(let i=0;i<3;i++){const r=await fetch(new URL('map-api/'+path,base),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});if(r.status===429&&i<2){await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(1000,(Number(r.headers.get('Retry-After'))||6)*1000))));continue;}const data=await r.json();if(!r.ok)throw Error(path+': HTTP '+r.status+' '+data.message);return data;}}
try{
 const places=await request('search?q=Cambridge%2C%20UK');if(!Array.isArray(places)||!places.some(p=>String(p.display_name).includes('Cambridge')))throw Error('Cambridge search failed');result.checks.push('Cambridge search');
 const routed=await request('route',{start:[.1216173,52.2030808],end:[.1206964,52.2036931]}),coords=routed.routes?.[0]?.geometry?.coordinates,route=measure(coords);result.checks.push('OSRM connected driving route');
 const part=section(route,0),osm=await request('osm',{bounds:part.bounds}),track=generateSection(osm,part);result.checks.push('Bounded OSM import, native road matching and scenery generation');result.roads=track.network.edges.length;result.buildings=track.objects.filter(o=>o.type==='building').length;result.distance=route.length;result.status='passed';
 // The current FOSSGIS policy is a live review source, separate from fixture tests.
 const policy=await fetch('https://routing.openstreetmap.de/about.html',{signal:AbortSignal.timeout(15000)});result.routingPolicy={url:policy.url,status:policy.status};
}catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}
finally{fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/personal-providers-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
