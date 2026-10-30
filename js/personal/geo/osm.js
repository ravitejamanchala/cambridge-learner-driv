import {enrichBuildings} from './building-details.js';
import {clearRoadside} from '../../roadside-clearance.js';
import {clearRoadBuildings} from '../../editor-road-clearance.js';
import {GENERATOR,normalizeForTrack,normalizedScenery} from './normalized.js';
// OSM geometry -> the simulator's existing decimetre network plus editable footprints.
const DRIVABLE = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
  "service",
  "road",
  "track",
]);
export function osmLength(value, fallback) {
  if (value == null) return fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return /ft|feet|'/i.test(String(value)) ? n * 0.3048 : n;
}
export function osmSpeed(value, highway) {
  if (value && /^\d/.test(value)) {
    const n = parseFloat(value);
    return /mph/i.test(value) ? n : n * 0.621371;
  }
  return highway === "motorway"
    ? 70
    : /trunk/.test(highway)
      ? 60
      : highway === "living_street"
        ? 10
        : 30;
}
// Liang-Barsky segment clipping keeps a bounded import bounded, even when an OSM way extends far outside it.
function clip(a, b, box) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    p = [-dx, dx, -dz, dz],
    q = [a.x - box.minX, box.maxX - a.x, a.z - box.minZ, box.maxZ - a.z];
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 4; i++) {
    if (!p[i]) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) lo = Math.max(lo, r);
      else hi = Math.min(hi, r);
      if (lo > hi) return null;
    }
  }
  return [
    { x: a.x + lo * dx, z: a.z + lo * dz },
    { x: a.x + hi * dx, z: a.z + hi * dz },
  ];
}
export function convertOSM(data, b, { boundsCheck, makeTrack, object, limits={} }) {
  boundsCheck(b);
  if (!Array.isArray(data?.elements) || data.elements.length > (limits.elements||30000))
    throw Error(
      "Import is too large. Choose a smaller area (maximum 30,000 OSM elements).",
    );
  const origin = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2],
    kx = 111320 * Math.cos((origin[0] * Math.PI) / 180),
    kz = 110574,
    project = (p) => ({
      x: (p.lon - origin[1]) * kx,
      z: -(p.lat - origin[0]) * kz,
    });
  const box = {
    minX: (b[1] - origin[1]) * kx,
    maxX: (b[3] - origin[1]) * kx,
    minZ: -(b[2] - origin[0]) * kz,
    maxZ: -(b[0] - origin[0]) * kz,
  };
  const nodes = new Map(
    data.elements
      .filter(
        (e) =>
          e.type === "node" && Number.isFinite(e.lat) && Number.isFinite(e.lon),
      )
      .map((e) => [e.id, e]),
  );
  const normalized=normalizeForTrack(data,origin),validRoads=new Set(normalized.features.filter(f=>f.kind==='road'&&f.geometry.type==='LineString').map(f=>f.id));
  const allWays = new Map(
    data.elements.filter((e) => e.type === "way").map((e) => [e.id, e]),
  );
  const roads = [...allWays.values()].filter(
    (w) =>
      validRoads.has("way/"+w.id) && DRIVABLE.has(w.tags?.highway) &&
      !["no", "private"].includes(w.tags?.motor_vehicle) &&
      w.nodes?.length > 1,
  );
  const usage = new Map();
  for (const way of roads)
    for (const id of new Set(way.nodes))
      usage.set(id, (usage.get(id) || 0) + 1);
  const n = {
    version: 1,
    source: "OpenStreetMap",
    origin,
    kx,
    kz,
    names: [],
    classes: [],
    nodes: [],
    ways: [],
    edges: [],
    stops: [],
    zebras: [],
    giveways: [],
    minis: [],
    rbs: [],
  };
  const sourceWays = [],
    sourceEdges = [],
    warnings = [],
    indices = new Map(),
    nodeRefs = [];
  const index = (key, p, osmId) => {
    if (!indices.has(key)) {
      indices.set(key, n.nodes.length / 2);
      n.nodes.push(Math.round(p.x * 10), Math.round(p.z * 10));
      nodeRefs.push(osmId ?? null);
    }
    return indices.get(key);
  };
  for (const way of roads) {
    const tags = way.tags,
      oneWayTag =
        tags["oneway:motorcar"] ?? tags["oneway:motor_vehicle"] ?? tags.oneway,
      ids = oneWayTag === "-1" ? way.nodes.toReversed() : way.nodes,
      valid = ids.every((id) => nodes.has(id));
    if (!valid) {
      warnings.push(`Road ${way.id}: missing nodes; not imported`);
      continue;
    }
    const oneway =
      ["yes", "1", "true", "-1"].includes(oneWayTag) ||
      (!["no", "0", "false"].includes(oneWayTag) &&
        (tags.junction === "roundabout" || tags.highway === "motorway"));
    const lanes = Math.min(
      12,
      Math.max(1, parseInt(tags.lanes) || (Number(tags['lanes:forward'])>0&&Number(tags['lanes:backward'])>0?Number(tags['lanes:forward'])+Number(tags['lanes:backward']):0) || (oneway || ["service", "track", "living_street"].includes(tags.highway) ? 1 : 2)),
    );
    const width = Math.min(60, Math.max(2, osmLength(tags.width, lanes * 3.2)));
    let cls = n.classes.indexOf(tags.highway);
    if (cls < 0) {
      cls = n.classes.length;
      n.classes.push(tags.highway);
    }
    n.names.push(tags.name || tags.ref || "Unnamed road");
    const wi = n.ways.length;
    n.ways.push([
      n.names.length - 1,
      cls,
      Math.round(osmSpeed(tags.maxspeed, tags.highway)),
      +!tags.maxspeed,
      +oneway,
      width,
      +(tags.junction === "roundabout"),
      lanes,
      0,
      0,
      15,
    ]);
    const flags = [];
    if (!tags.width) flags.push("Width estimated");
    if (!tags.lanes) flags.push("Lane count estimated");
    if (tags.bridge === "yes" || tags.tunnel === "yes" || Number(tags.layer))
      flags.push("Elevation needs review");
    if (tags.highway === "road") flags.push("Road type unknown");
    sourceWays.push({ osmId: way.id, tags, flags, generator:GENERATOR, markingEvidence:tags.lane_markings==='yes'?'tagged':tags.lane_markings==='no'?'absent':'unknown' });
    let current = null;
    const flush = () => {
      if (current && current.points.length > 1) {
        const p = current.points;
        if (
          Math.hypot(p.at(-1).x - p[0].x, p.at(-1).z - p[0].z) > 0.05 ||
          p.length > 2
        ) {
          n.edges.push([
            index(current.start, p[0], current.startId),
            index(current.end, p.at(-1), current.endId),
            wi,
            p.flatMap((v) => [Math.round(v.x * 10), Math.round(v.z * 10)]),
          ]);
          sourceEdges.push({
            osmWayId: way.id,
            startOsmNode: current.startId,
            endOsmNode: current.endId,
          });
        }
      }
      current = null;
    };
    for (let i = 1; i < ids.length; i++) {
      const a = project(nodes.get(ids[i - 1])),
        c = project(nodes.get(ids[i])),
        clipped = clip(a, c, box);
      if (!clipped) {
        flush();
        continue;
      }
      const [p, q] = clipped;
      const originalA = Math.hypot(p.x - a.x, p.z - a.z) < 0.001,
        originalB = Math.hypot(q.x - c.x, q.z - c.z) < 0.001;
      const ka = originalA ? "n:" + ids[i - 1] : `clip:${way.id}:${i}:a`,
        kb = originalB ? "n:" + ids[i] : `clip:${way.id}:${i}:b`;
      if (!current || current.end !== ka) {
        flush();
        current = {
          start: ka,
          startId: originalA ? ids[i - 1] : null,
          points: [p],
        };
      }
      current.points.push(q);
      current.end = kb;
      current.endId = originalB ? ids[i] : null;
      const feature = nodes.get(ids[i]).tags?.highway;
      if (
        !originalB ||
        usage.get(ids[i]) > 1 ||
        [
          "traffic_signals",
          "stop",
          "give_way",
          "crossing",
          "mini_roundabout",
        ].includes(feature)
      )
        flush();
    }
    flush();
  }
  // Preserve native edge-indexed signals/crossings at their real nodes. Their phasing is an approximation to review.
  for (let ei = 0; ei < n.edges.length; ei++) {
    const e = n.edges[ei],
      ref = sourceEdges[ei],
      f = e[3];
    let len = 0;
    for (let j = 2; j < f.length; j += 2)
      len += Math.hypot(f[j] - f[j - 2], f[j + 1] - f[j - 1]);
    for (const [id, at, dir] of [
      [ref.startOsmNode, Math.min(25, len / 3), -1],
      [ref.endOsmNode, Math.max(0, len - Math.min(25, len / 3)), 1],
    ]) {
      const node = nodes.get(id),
        tags = node?.tags;
      if (!tags) continue;
      if (tags.highway === "traffic_signals" && !(n.ways[e[2]][4] && dir < 0)) {
        const dx = f.at(-2) - f[0],
          dz = f.at(-1) - f[1];
        n.stops.push([
          ei,
          at,
          dir,
          Math.abs(Number(id)) % 100000,
          Math.abs(dx) > Math.abs(dz) ? 1 : 0,
        ]);
      }
      if ((tags.highway === "stop" || tags.highway === "give_way") && !(n.ways[e[2]][4] && dir < 0))
        n.giveways.push([ei, at, dir, +(tags.highway === "stop")]);
      if (tags.highway === "crossing" && (tags.crossing === 'zebra' || tags.crossing_ref === 'zebra' || tags['crossing:markings'] === 'zebra'))
        n.zebras.push([ei, at]);
    }
  }
  for (const node of nodes.values())
    if (node.tags?.highway === "mini_roundabout") {
      const p = project(node);
      if (
        p.x >= box.minX &&
        p.x <= box.maxX &&
        p.z >= box.minZ &&
        p.z <= box.maxZ
      )
        n.minis.push([Math.round(p.x * 10), Math.round(p.z * 10)]);
    }
  const objects = [],memberBuildings=new Set();
  // Relations own their member footprints; keep complete source rings and holes at
  // selection edges instead of rectangle-clipping a house into an invented shape.
  for(const f of normalized.features)if(f.kind==='building'&&f.sourceGeometry?.members)
    for(const m of f.sourceGeometry.members)if(m.type==='way')memberBuildings.add('way/'+m.ref);
  for(const f of normalized.features){
    if(f.kind!=='building'||f.geometry.type!=='MultiPolygon'||memberBuildings.has(f.id))continue;
    for(const [part,rings] of f.geometry.coordinates.entries()){
      const footprint=rings[0].slice(0,-1).map(([x,z])=>({x,z})),xs=footprint.map(p=>p.x),zs=footprint.map(p=>p.z);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      if(maxX<box.minX||minX>box.maxX||maxZ<box.minZ||minZ>box.maxZ||maxX-minX<.3||maxZ-minZ<.3)continue;
      const tags=f.tags||{},o=object('building',(minX+maxX)/2,(minZ+maxZ)/2);
      Object.assign(o,{id:'building:'+f.id+':'+part,name:tags.name||'Building '+f.id,sx:maxX-minX,sz:maxZ-minZ,sy:6,y:Math.max(0,osmLength(tags.min_height,0))});
      o.properties={osmId:f.id,tags,footprint,holes:rings.slice(1).map(r=>r.slice(0,-1).map(([x,z])=>({x,z}))),provenance:f.provenance,heightEstimated:!tags.height};
      objects.push(o);
    }
  }
  if (!n.edges.length)
    throw Error(
      "No drivable roads in this area. Move the selection or make it larger.",
    );
  if (
    n.edges.length > (limits.edges||10000) ||
    n.nodes.length > (limits.nodes||40000) ||
    objects.length > (limits.objects||10000)
  )
    throw Error("Area exceeds editor limits. Choose a smaller selection.");
  const buildingDetails = enrichBuildings(objects, data, project);
  const t = makeTrack(n);
  t.buildingDetails = buildingDetails;
  t.title = "Imported OSM world";
  t.sceneryMode = "authored";
  t.objects = objects;
  t.osm = {
    ways: sourceWays,
    edges: sourceEdges,
    warnings,
    dataTimestamp: data.osm3s?.timestamp_osm_base || null,
    generator:GENERATOR,datasetVersion:normalized.version||null,
    validation:{accepted:false,rejected:normalized.errors,normalizedFeatures:normalized.features.length,unknownMarkings:sourceWays.filter(w=>w.markingEvidence==='unknown').length},
  };
  t.georeference = {
    bounds: b,
    provider: "OpenStreetMap",
    importedAt: new Date().toISOString(),
  };
  const e = n.edges.reduce((best, e) =>
      e[3].length > best[3].length ? e : best,
    ),
    f = e[3];
  const dx = f[2] - f[0],
    dz = f[3] - f[1],
    len = Math.hypot(dx, dz) || 1;
  const tx = dx / len,
    tz = dz / len;
  t.spawn = {
    x: f[0] / 10 + tx * 3 + tz * 1.6,
    z: f[1] / 10 + tz * 3 - tx * 1.6,
    heading: Math.atan2(-tx, -tz),
  };
  t.plan.waypoints = [{ x: t.spawn.x, z: t.spawn.z, road: "", label: "Imported start" }];
  return clearRoadside(normalizedScenery(clearRoadBuildings(t),normalized,{limits}));
}
