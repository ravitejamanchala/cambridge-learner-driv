import {enrichBuildings} from './building-details.js';
import {clearRoadside} from '../../roadside-clearance.js';
import {clearRoadBuildings} from '../../editor-road-clearance.js';
import {addOSMDetails} from './osm-details.js';
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
function polygonClip(points, box) {
  let out = points.slice();
  for (const [inside, cross] of [
    [
      (p) => p.x >= box.minX,
      (a, b) => ({
        x: box.minX,
        z: a.z + ((b.z - a.z) * (box.minX - a.x)) / (b.x - a.x),
      }),
    ],
    [
      (p) => p.x <= box.maxX,
      (a, b) => ({
        x: box.maxX,
        z: a.z + ((b.z - a.z) * (box.maxX - a.x)) / (b.x - a.x),
      }),
    ],
    [
      (p) => p.z >= box.minZ,
      (a, b) => ({
        z: box.minZ,
        x: a.x + ((b.x - a.x) * (box.minZ - a.z)) / (b.z - a.z),
      }),
    ],
    [
      (p) => p.z <= box.maxZ,
      (a, b) => ({
        z: box.maxZ,
        x: a.x + ((b.x - a.x) * (box.maxZ - a.z)) / (b.z - a.z),
      }),
    ],
  ]) {
    const input = out;
    out = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length],
        c = input[i];
      if (inside(c)) {
        if (!inside(a)) out.push(cross(a, c));
        out.push(c);
      } else if (inside(a)) out.push(cross(a, c));
    }
  }
  return out;
}
function rings(parts) {
  const pending = parts.filter((p) => p?.length > 1).map((p) => [...p]),
    result = [];
  while (pending.length) {
    let chain = pending.shift(),
      progress = true;
    while (chain[0] !== chain.at(-1) && progress) {
      progress = false;
      for (let i = 0; i < pending.length; i++) {
        let p = pending[i];
        if (chain.at(-1) === p.at(-1)) p = p.toReversed();
        if (chain.at(-1) === p[0]) {
          chain.push(...p.slice(1));
          pending.splice(i, 1);
          progress = true;
          break;
        }
        if (chain[0] === p[0]) p = p.toReversed();
        if (chain[0] === p.at(-1)) {
          chain.unshift(...p.slice(0, -1));
          pending.splice(i, 1);
          progress = true;
          break;
        }
      }
    }
    if (chain[0] === chain.at(-1)) result.push(chain);
  }
  return result;
}
function inPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
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
  const allWays = new Map(
    data.elements.filter((e) => e.type === "way").map((e) => [e.id, e]),
  );
  const roads = [...allWays.values()].filter(
    (w) =>
      DRIVABLE.has(w.tags?.highway) &&
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
      Math.max(1, parseInt(tags.lanes) || (oneway || ["service", "track", "living_street"].includes(tags.highway) ? 1 : 2)),
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
    sourceWays.push({ osmId: way.id, tags, flags });
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
  const objects = [],
    relationWays = new Set();
  function building(ids, tags, osmId, holes = []) {
    if (ids.some((id) => !nodes.has(id))) return;
    let footprint = polygonClip(
      ids.map((id) => project(nodes.get(id))),
      box,
    );
    if (
      footprint.length > 1 &&
      Math.hypot(
        footprint[0].x - footprint.at(-1).x,
        footprint[0].z - footprint.at(-1).z,
      ) < 0.01
    )
      footprint.pop();
    if (footprint.length < 3) return;
    const xs = footprint.map((p) => p.x),
      zs = footprint.map((p) => p.z),
      width = Math.max(...xs) - Math.min(...xs),
      depth = Math.max(...zs) - Math.min(...zs);
    if (width < 0.3 || depth < 0.3) return;
    const height = Math.min(
      150,
      osmLength(tags.height, (parseFloat(tags["building:levels"]) || 2) * 3),
    );
    const o = object(
      "building",
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
    Object.assign(o, {
      name: tags.name || "Building " + osmId,
      sx: width,
      sz: depth,
      sy: height,
      y: Math.max(0, osmLength(tags.min_height, 0)),
    });
    o.properties = {
      osmId,
      tags,
      footprint,
      holes: holes
        .map((h) =>
          h.filter((id) => nodes.has(id)).map((id) => project(nodes.get(id))),
        )
        .filter((h) => h.length > 2 && inPolygon(h[0], footprint)),
      heightEstimated: !tags.height && !tags["building:levels"],
    };
    objects.push(o);
  }
  for (const rel of data.elements.filter(
    (e) =>
      e.type === "relation" &&
      e.tags?.building &&
      e.tags.type === "multipolygon",
  )) {
    const members = rel.members?.filter((m) => m.type === "way") || [],
      outer = rings(
        members
          .filter((m) => m.role !== "inner")
          .map((m) => allWays.get(m.ref)?.nodes),
      ),
      inner = rings(
        members
          .filter((m) => m.role === "inner")
          .map((m) => allWays.get(m.ref)?.nodes),
      );
    for (const m of members) relationWays.add(m.ref);
    for (const ring of outer)
      building(ring, rel.tags, "relation/" + rel.id, inner);
  }
  for (const w of allWays.values())
    if (
      w.tags?.building &&
      !relationWays.has(w.id) &&
      w.nodes?.length > 3 &&
      w.nodes[0] === w.nodes.at(-1)
    )
      building(w.nodes, w.tags, "way/" + w.id);
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
  return clearRoadside(addOSMDetails(clearRoadBuildings(t),data,{limits}));
}
