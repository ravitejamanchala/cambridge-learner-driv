import {prepareEditorTrack} from './editor-routing.js';
// Version 1 editor envelope validation, shared with SlayDriveAdmin.
import { buildNet, buildRoute, snapWaypoint, nearest } from "./net.js";
export function validate(d) {
  const errors = [];
  const finite = (x) =>
    typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e8;
  if (
    !d ||
    d.version !== 1 ||
    !["puzzle", "mock"].includes(d.kind) ||
    typeof d.title !== "string" ||
    !d.title.trim() ||
    d.title.length > 200
  )
    return ["Invalid track header"];
  if (
    d.sceneryHidden !== undefined &&
    (!Array.isArray(d.sceneryHidden) ||
      d.sceneryHidden.length > 10000 ||
      !d.sceneryHidden.every((k) => typeof k === "string" && k.length < 200))
  )
    errors.push("Invalid scenery overrides");
  if (d.sceneryMode !== undefined && !['authored','procedural'].includes(d.sceneryMode)) errors.push('Invalid scenery mode');
  if (d.sceneryMode === 'procedural' && Array.isArray(d.objects) && d.objects.some(o => o?.type === 'building')) errors.push('Procedural scenery cannot include authored buildings');
  if (d.practiceMode !== undefined && d.practiceMode !== 'experimental') errors.push('Invalid practice mode');
  const n = d.network;
  if (
    !n ||
    !Array.isArray(n.nodes) ||
    !Array.isArray(n.edges) ||
    !Array.isArray(n.ways) ||
    !Array.isArray(n.names) ||
    !Array.isArray(n.classes)
  )
    return ["Missing simulator network"];
  if (n.edges.length > 10000 || n.nodes.length > 40000 || n.ways.length > 10000)
    errors.push("Network exceeds editor limits");
  if (
    n.nodes.length % 2 ||
    !n.nodes.every(finite) ||
    !Array.isArray(n.origin) ||
    n.origin.length !== 2 ||
    !n.origin.every(finite) ||
    !finite(n.kx) ||
    n.kx <= 0 ||
    !finite(n.kz) ||
    n.kz <= 0
  )
    errors.push("Invalid georeference or nodes");
  for (const w of n.ways)
    if (
      !Array.isArray(w) ||
      w.length < 8 ||
      !Number.isInteger(w[0]) ||
      (!n.names[w[0]] && n.names[w[0]] !== "") ||
      !n.classes[w[1]] ||
      !finite(w[5]) ||
      w[5] <= 0 ||
      w[5] > 100 ||
      !Number.isInteger(w[7]) ||
      w[7] < 0 ||
      w[7] > 12
    )
      errors.push("Invalid way");
  for (const e of n.edges)
    if (
      !Array.isArray(e) ||
      e.length !== 4 ||
      ![e[0], e[1]].every(
        (v) => Number.isInteger(v) && v >= 0 && v < n.nodes.length / 2,
      ) ||
      !n.ways[e[2]] ||
      !Array.isArray(e[3]) ||
      e[3].length < 4 ||
      e[3].length % 2 ||
      !e[3].every(finite)
    )
      errors.push("Invalid edge");
  for (const key of ["stops", "zebras", "giveways", "minis", "rbs"])
    if (!Array.isArray(n[key])) errors.push("Missing " + key);
  for (const key of ["stops", "zebras", "giveways"])
    for (const f of n[key] || [])
      if (
        !Array.isArray(f) ||
        f.length < { stops: 5, zebras: 2, giveways: 3 }[key] ||
        !Number.isInteger(f[0]) ||
        !n.edges[f[0]] ||
        !f.every(finite) ||
        f[1] < 0
      )
        errors.push("Invalid " + key);
  for (const key of ["minis", "rbs"])
    for (const f of n[key] || [])
      if (
        !Array.isArray(f) ||
        f.length !== { minis: 2, rbs: 4 }[key] ||
        !f.every(finite)
      )
        errors.push("Invalid " + key);
  if (!d.spawn || ![d.spawn.x, d.spawn.z, d.spawn.heading].every(finite))
    errors.push("Invalid spawn");
  if (
    n.names.some((v) => typeof v !== "string" || v.length > 500) ||
    n.classes.some((v) => typeof v !== "string" || v.length > 100)
  )
    errors.push("Invalid network names");
  if (!Array.isArray(d.objects) || d.objects.length > 10000)
    errors.push("Invalid objects");
  else {
    const ids = new Set();
    for (const o of d.objects) {
      if (
        !o ||
        typeof o.id !== "string" ||
        !o.properties ||
        typeof o.properties !== "object" ||
        Array.isArray(o.properties) ||
        ids.has(o.id) ||
        ![
          "building",
          "scenery",
          "sign",
          "light",
          "marking",
          "parking",
          "checkpoint",
          "zone",
          "waypoint",
        ].includes(o.type) ||
        ![o.x, o.z, o.y, o.rotation, o.sx, o.sy, o.sz].every(finite) ||
        Math.min(o.sx, o.sy, o.sz) <= 0
      )
        errors.push("Invalid object");
      ids.add(o.id);
    }
  }
  if (
    !Array.isArray(d.plan?.waypoints) ||
    !d.plan.waypoints.every((p) => finite(p.x) && finite(p.z))
  )
    errors.push("Invalid route");
  return [...new Set(errors)];
}

export function inspectTrack(track) {
 const errors = validate(track); if(errors.length) throw Error(errors.join('; '));
 if(track.plan.waypoints.length<2 || track.plan.waypoints.length>2000) throw Error('A mock route needs 2–2000 waypoints');
 for(const o of track.objects){
  if(Math.max(o.sx,o.sy,o.sz)>2000)throw Error('Object dimensions exceed 2 km');
  for(const ring of [o.properties.footprint,...(o.properties.holes||[])].filter(Boolean)){
   if(!Array.isArray(ring)||ring.length<3||ring.length>5000||!ring.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=50000&&Math.abs(p.z)<=50000))throw Error('Invalid building footprint');
  }
 }
 const n=track.network;
 if(n.nodes.some(v=>Math.abs(v)>500000) || n.edges.some(e=>e[3].some(v=>Math.abs(v)>500000))) throw Error('Local map coordinates must be within 50 km of origin');
 let segments=0;
 for(const edge of n.edges){for(let i=2;i<edge[3].length;i+=2){segments++;if(Math.hypot(edge[3][i]-edge[3][i-2],edge[3][i+1]-edge[3][i-1])>20000)throw Error('Road segments must be shorter than 2 km');}}
 if(segments>60000)throw Error('Too many road geometry segments');
 const prepared=prepareEditorTrack(track),net=buildNet(prepared.network),nodes=prepared.nodes;
 const spawnRoad=nearest(net,track.spawn.x,track.spawn.z);
 if(!spawnRoad || spawnRoad.d>50)throw Error("Spawn must be within 50 metres of a road");
 const route=buildRoute(net,nodes);
 if(!route.steps.length || !Number.isFinite(route.len) || route.len<10) throw Error('Route must contain at least 10 metres of connected roads');
 return {len:route.len,n:route.instructions.length,first:route.instructions[0]?.text||''};
}
