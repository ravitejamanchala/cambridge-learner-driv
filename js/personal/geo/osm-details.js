import {sceneFeatures,PATH_KINDS} from './map-features.js';
const metres=value=>{const n=parseFloat(value);return Number.isFinite(n)&&n>0?(/ft|feet|'/i.test(String(value))?n*.3048:n):undefined;};
export function areaKind(t){return t.natural==='water'||t.waterway==='riverbank'?'water':t.natural==='wood'||t.landuse==='forest'?'forest':t.amenity==='parking'?'parking':t.leisure==='park'?'park':['pitch','sports_centre','track'].includes(t.leisure)?'sports':t.leisure==='garden'?'garden':['grass','meadow','village_green','recreation_ground'].includes(t.landuse)||t.natural==='grassland'?'grass':t.landuse==='cemetery'?'cemetery':t.landuse==='industrial'?'industrial':t.natural==='sand'||t.natural==='beach'?'sand':t.highway==='pedestrian'&&t.area==='yes'?'plaza':null;}
export function pointKind(t){return t.natural==='tree'?'tree':t.highway==='street_lamp'?'lamp':t.highway==='bus_stop'?'busStop':t.barrier==='bollard'?'bollard':t.barrier==='gate'||t.barrier==='lift_gate'?'gate':({bench:'bench',waste_basket:'bin',post_box:'postBox',bicycle_parking:'bicycleParking'})[t.amenity]||null;}
function join(parts){const out=[],left=parts.filter(p=>p?.length>1).map(p=>[...p]);while(left.length){const ring=left.shift();let again=true;while(ring[0]!==ring.at(-1)&&again){again=false;for(let i=0;i<left.length;i++){let p=left[i];if(p.at(-1)===ring.at(-1))p.reverse();if(p[0]===ring.at(-1)){ring.push(...p.slice(1));left.splice(i,1);again=true;break;}if(p[0]===ring[0])p.reverse();if(p.at(-1)===ring[0]){ring.unshift(...p.slice(0,-1));left.splice(i,1);again=true;break;}}}if(ring[0]===ring.at(-1))out.push(ring);}return out;}
function contains(p,r){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function addOSMDetails(track,data){
  const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),ways=new Map(data.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const project=node=>[(node.lon-track.network.origin[1])*track.network.kx,-(node.lat-track.network.origin[0])*track.network.kz];
  const line=ids=>ids?.every(id=>nodes.has(id))?ids.map(id=>project(nodes.get(id))):null;
  const features=[],members=new Set();
  for(const rel of data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='multipolygon')){
    const kind=areaKind(rel.tags);if(!kind)continue;
    const rings=role=>join((rel.members||[]).filter(m=>m.type==='way'&&(role==='inner'?m.role==='inner':m.role!=='inner')).map(m=>ways.get(m.ref)?.nodes)).map(line).filter(Boolean);
    const outer=rings('outer'),inner=rings('inner');if(!outer.length)continue;
    for(const m of rel.members||[])if(m.type==='way')members.add(m.ref);
    outer.forEach((r,i)=>features.push({id:`relation/${rel.id}/${i}`,kind,rings:[r,...inner.filter(h=>contains(h[0],r))],name:rel.tags.name,tags:rel.tags}));
  }
  for(const w of ways.values()){
    const tags=w.tags||{},points=line(w.nodes);if(!points)continue;
    const kind=areaKind(tags);
    if(kind&&w.nodes[0]===w.nodes.at(-1)&&!members.has(w.id))features.push({id:`way/${w.id}`,kind,rings:[points],tags,name:tags.name});
    else if(PATH_KINDS.has(tags.highway)&&tags.area!=='yes')features.push({id:`way/${w.id}`,kind:tags.highway,line:points,width:metres(tags.width),tags,name:tags.name});
    else if(['wall','fence','hedge'].includes(tags.barrier))features.push({id:`way/${w.id}`,kind:tags.barrier,line:points,height:metres(tags.height),tags});
    else if(tags.railway==='rail')features.push({id:`way/${w.id}`,kind:'rail',line:points,width:.12,height:.12,tags});
  }
  for(const node of nodes.values()){
    const tags=node.tags||{},kind=pointKind(tags);
    if(kind)features.push({id:`node/${node.id}`,kind,point:project(node),height:metres(tags.height),measured:!!metres(tags.height),tags,name:tags.name});
  }
  const result=sceneFeatures(track,features);
  result.osm.restrictions=data.elements.filter(e=>e.type==='relation'&&e.tags?.type==='restriction').map(e=>({osmId:e.id,tags:e.tags,members:e.members}));
  result.osm.controlPoints=[...nodes.values()].filter(e=>['crossing','stop','give_way','traffic_signals'].includes(e.tags?.highway)||e.tags?.traffic_sign).map(e=>({osmId:e.id,...Object.fromEntries(['lat','lon','tags'].map(k=>[k,e[k]]))}));
  return result;
}
