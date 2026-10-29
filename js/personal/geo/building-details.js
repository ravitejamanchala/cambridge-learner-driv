// Original, deterministic OSM enrichment. Estimates are never written as source tags.
const positive = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const metres = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n * (/ft|feet|'/i.test(String(v)) ? .3048 : 1) : null; };
const kind = o => o.properties?.tags?.building || o.properties?.class || 'yes';
const area = o => { const r=o.properties?.footprint; return r?.length ? Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p.x*q.z-q.x*p.z;},0)/2) : o.sx*o.sz; };
const inside = (p,r) => {let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;}return yes;};
const contains = (o,p) => inside(p,o.properties.footprint)&&!(o.properties.holes||[]).some(r=>inside(p,r));
export function buildingHeight(o, neighbours=[]) {
 const t=o.properties?.tags||{}, height=metres(t.height), levels=positive(t['building:levels']), bottom=metres(t.min_height)||0;
 if(height) return {height:Math.min(150,Math.max(.5,height-bottom)),source:'OSM height',estimated:false,levels:levels||null};
 if(levels) return {height:Math.min(150,Math.max(.5,levels*3+(metres(t['roof:height'])||0)-bottom)),source:'OSM building:levels × 3 m',estimated:true,levels};
 const k=kind(o),a=area(o);
 const candidates=neighbours.filter(n=>n!==o&&kind(n)===k&&kind(n)!=='yes'&&positive(n.properties?.tags?.['building:levels'])&&Math.hypot(n.x-o.x,n.z-o.z)<=500&&area(n)/a>=.5&&area(n)/a<=2).sort((a,b)=>Math.hypot(a.x-o.x,a.z-o.z)-Math.hypot(b.x-o.x,b.z-o.z)).slice(0,9);
 if(candidates.length>=3){const values=candidates.map(n=>positive(n.properties.tags['building:levels'])).sort((a,b)=>a-b),floors=Math.max(1,Math.min(12,values[Math.floor(values.length/2)]));return {height:floors*3,source:'Nearby same-use tagged buildings (median)',estimated:true,levels:floors,samples:candidates.map(n=>n.properties.osmId)};}
 const floors=/^(garage|garages|shed|outbuilding|bungalow|kiosk)$/.test(k)?1:/^(apartments|office)$/.test(k)?3:2;
 return {height:/^(warehouse|industrial|hangar)$/.test(k)?8:floors*3,source:'Building-use fallback; unverified',estimated:true,levels:floors};
}
export function enrichBuildings(objects,data,project){
 const buildings=objects.filter(o=>o.type==='building'&&o.properties?.footprint?.length);
 const grid=new Map(),heightGrid=new Map();
 for(const o of buildings){const key=Math.floor(o.x/500)+":"+Math.floor(o.z/500);if(!heightGrid.has(key))heightGrid.set(key,[]);heightGrid.get(key).push(o);}
 for(const o of buildings){
  const nearby=[];for(let x=Math.floor(o.x/500)-1;x<=Math.floor(o.x/500)+1;x++)for(let z=Math.floor(o.z/500)-1;z<=Math.floor(o.z/500)+1;z++)nearby.push(...(heightGrid.get(x+":"+z)||[]));
  const h=buildingHeight(o,nearby);o.sy=h.height;o.properties.heightEstimated=h.estimated;o.properties.heightSource=h.source;o.properties.heightEvidence=h;o.properties.renderLevels=h.levels;
  const tags=o.properties.tags||{};
  if((tags.shop||['cafe','restaurant','pub','bank','pharmacy','fast_food'].includes(tags.amenity))&&tags.name)o.properties.storefront={name:String(tags.name).slice(0,100),kind:tags.shop||tags.amenity,sourceId:o.properties.osmId,source:'OpenStreetMap',placementEstimated:true};
  const r=o.properties.footprint,xs=r.map(p=>p.x),zs=r.map(p=>p.z);
  for(let x=Math.floor(Math.min(...xs)/100);x<=Math.floor(Math.max(...xs)/100);x++)for(let z=Math.floor(Math.min(...zs)/100);z<=Math.floor(Math.max(...zs)/100);z++){const key=x+':'+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(o);}
 }
 let unmatched=0,attached=0;
 for(const node of data.elements||[]){const t=node.tags||{};if(node.type!=='node'||!t.name||!(t.shop||['cafe','restaurant','pub','bank','pharmacy','fast_food'].includes(t.amenity)))continue;
  const p=project(node),candidates=(grid.get(Math.floor(p.x/100)+':'+Math.floor(p.z/100))||[]).filter(o=>contains(o,p)).sort((a,b)=>area(a)-area(b));
  if(!candidates.length){unmatched++;continue;}const o=candidates[0];
  if(!o.properties.storefront){o.properties.storefront={name:String(t.name).slice(0,100),kind:t.shop||t.amenity,sourceId:'node/'+node.id,source:'OpenStreetMap',position:p,placementEstimated:true};attached++;}
 }
 return {version:1,buildings:buildings.length,estimatedHeights:buildings.filter(o=>o.properties.heightEstimated).length,storefronts:buildings.filter(o=>o.properties.storefront).length,attachedPoints:attached,unmatchedPoints:unmatched};
}
