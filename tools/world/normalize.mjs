import { clipping, area } from "./coverage.mjs";
import { canonical } from "../../js/world-data/schema.js";
import { project } from "../../js/world-data/projection.js";
import {
  joinWays,
  orient,
  inside,
  polygonErrors,
  bounds,
} from "../../js/world-data/geometry.js";
export const sourceId = (e) => `${e.type}/${e.id}`;
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
export function category(tags = {}) {
  if (tags.type === "restriction") return "restriction";
  if (tags.boundary === "administrative") return "boundary";
  if (
    (tags.building && tags.building !== "no") ||
    (tags["building:part"] && tags["building:part"] !== "no")
  )
    return "building";
  if (DRIVABLE.has(tags.highway)) return "road";
  if (
    [
      "footway",
      "path",
      "pedestrian",
      "steps",
      "cycleway",
      "bridleway",
    ].includes(tags.highway)
  )
    return tags.highway;
  if (tags.natural === "water" || tags.waterway) return "water";
  if (tags.railway) return "rail";
  if (tags.barrier) return tags.barrier;
  if (tags.natural === "tree") return "tree";
  if (tags.highway === "street_lamp") return "lamp";
  if (tags.highway === "bus_stop") return "busStop";
  if (
    [
      "traffic_signals",
      "crossing",
      "stop",
      "give_way",
      "mini_roundabout",
    ].includes(tags.highway)
  )
    return tags.highway;
  if (tags.traffic_sign) return "sign";
  const amenity = {
    shelter: "shelter",
    bench: "bench",
    waste_basket: "bin",
    post_box: "postBox",
    bicycle_parking: "bicycleParking",
    parking: "parking",
  };
  if (amenity[tags.amenity]) return amenity[tags.amenity];
  if (
    tags.landuse ||
    tags.leisure ||
    ["wood", "scrub", "grassland", "sand", "beach"].includes(tags.natural)
  )
    return "ground";
  return null;
}
export function metric(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(
    /^\s*(\d+(?:\.\d+)?)\s*(m|metres?|ft|feet)?\s*$/i,
  );
  return match
    ? Number(match[1]) * (/ft|feet/i.test(match[2] || "") ? 0.3048 : 1)
    : null;
}
export function mergeSnapshots(snapshots) {
  const elements = new Map(),
    conflicts = [];
  for (const data of snapshots) {
    if (data.remark || !Array.isArray(data.elements))
      throw Error(
        `Incomplete OSM response: ${data.remark || "elements absent"}`,
      );
    for (const e of data.elements) {
      if (
        !["node", "way", "relation"].includes(e.type) ||
        !Number.isSafeInteger(e.id)
      )
        throw Error("Invalid OSM identity");
      const id = sourceId(e),
        old = elements.get(id);
      if (old && canonical(old) !== canonical(e)) conflicts.push(id);
      if (!old) elements.set(id, e); // Snapshot conflict is a gate failure, never silently choose newest.
    }
  }
  return { elements, conflicts: [...new Set(conflicts)].sort() };
}
export function relationGeometry(e, elements, p) {
  const members = (e.members || []).filter(
    (m) => !["label", "admin_centre", "subarea"].includes(m.role),
  );
  if (
    members.some(
      (m) => m.type !== "way" || !["", "outer", "inner"].includes(m.role || ""),
    )
  )
    throw Error("Unsupported polygon member type or role");
  const rings = (role) =>
    joinWays(
      members
        .filter((m) => (m.role === "inner" ? "inner" : "outer") === role)
        .map((m) => {
          const w = elements.get(`way/${m.ref}`);
          if (!w?.nodes?.length) throw Error(`Missing way/${m.ref}`);
          return w.nodes;
        }),
    ).map((ids) => ids.map((id) => nodePoint(id, elements, p)));
  const outer = rings("outer"),
    inner = rings("inner");
  if (!outer.length) throw Error("Missing exterior");
  const polygons = outer.map((r) => [orient(r, true)]);
  for (const hole of inner) {
    const owners = outer
      .map((r, i) => (inside(hole[0], r) ? i : -1))
      .filter((i) => i >= 0);
    if (owners.length !== 1) throw Error("Orphan or ambiguous inner ring");
    polygons[owners[0]].push(orient(hole, false));
  }
  return { type: "MultiPolygon", coordinates: polygons };
}
function nodePoint(id, elements, p) {
  const n = elements.get(`node/${id}`);
  if (!n) throw Error(`Missing node/${id}`);
  const { x, z } = project(p, [n.lon, n.lat]);
  return [x, z];
}
function geometry(e, elements, p, kind) {
  if (e.type === "node")
    return { type: "Point", coordinates: nodePoint(e.id, elements, p) };
  if (e.type === "relation") return relationGeometry(e, elements, p);
  const coords = (e.nodes || []).map((n) => nodePoint(n, elements, p));
  if (coords.length < 2) throw Error("Too few way nodes");
  const area =
    e.tags?.area === "yes" ||
    ["building", "ground", "parking"].includes(kind) ||
    (kind === "water" && !e.tags?.waterway) ||
    e.tags?.waterway === "riverbank";
  if (area) {
    if (e.nodes[0] !== e.nodes.at(-1)) throw Error("Unclosed area way");
    return { type: "MultiPolygon", coordinates: [[orient(coords, true)]] };
  }
  return { type: "LineString", coordinates: coords };
}
export const geometryPoints = (g) =>
  g.type === "Point"
    ? [g.coordinates]
    : g.type === "LineString"
      ? g.coordinates
      : g.coordinates.flat(2);
export function normalize(snapshots, p) {
  const { elements, conflicts } = mergeSnapshots(snapshots),
    features = [],
    ledger = [],
    errors = [],
    restrictions = [];
  for (const e of [...elements.values()].sort((a, b) =>
    sourceId(a).localeCompare(sourceId(b), "en"),
  )) {
    const id = sourceId(e),
      kind = category(e.tags),
      status = {
        id,
        kind,
        status: "unsupported",
        reason: "No normalized category; source retained",
      };
    ledger.push(status);
    if (!kind) {
      if (!e.tags || !Object.keys(e.tags).length) {
        status.status = "dependency";
        status.reason = "Untagged source geometry";
      }
      continue;
    }
    try {
      if (kind === "restriction") {
        const members = e.members || [],
          missing = members.filter((m) => !elements.has(`${m.type}/${m.ref}`));
        if (missing.length)
          throw Error(
            "Missing restriction members: " +
              missing.map((m) => `${m.type}/${m.ref}`).join(","),
          );
        if (
          !members.some((m) => m.role === "from") ||
          !members.some((m) => m.role === "via") ||
          !members.some((m) => m.role === "to")
        )
          throw Error("Incomplete turn restriction");
        restrictions.push({
          id,
          tags: e.tags,
          members,
          version: e.version ?? null,
          timestamp: e.timestamp ?? null,
        });
        status.status = "accepted";
        status.reason =
          "Preserved separately; simulator enforcement not yet integrated";
        continue;
      }
      const g = geometry(e, elements, p, kind);
      if (g.type === "MultiPolygon") {
        const bad = polygonErrors(g.coordinates);
        if (bad.length) throw Error(bad.join("; "));
        const union = clipping.union(g.coordinates);
        if (Math.abs(area(union) - area(g.coordinates)) > 0.01)
          throw Error("Overlapping multipolygon parts");
      }
      const t = e.tags || {},
        height = metric(t.height),
        levels = Number(t["building:levels"]);
      const provenance = {
        source: "OpenStreetMap",
        id,
        version: e.version ?? null,
        timestamp: e.timestamp ?? null,
      };
      features.push({
        id,
        kind,
        geometry: g,
        bounds: bounds(geometryPoints(g)),
        tags: t,
        provenance,
        sourceGeometry:
          e.type === "node"
            ? { lon: e.lon, lat: e.lat }
            : e.type === "way"
              ? { nodes: e.nodes }
              : { members: e.members },
        attributes: {
          height: {
            value: height,
            evidence: height === null ? "unknown" : "height tag",
          },
          levels: {
            value: Number.isFinite(levels) && levels > 0 ? levels : null,
            evidence: t["building:levels"] ? "tag" : "unknown",
          },
          width: {
            value: metric(t.width),
            evidence: metric(t.width) === null ? "unknown" : "width tag",
          },
          layer: t.layer ?? null,
          bridge: t.bridge ?? null,
          tunnel: t.tunnel ?? null,
          access: t.access ?? null,
          lanes: t.lanes ?? null,
          oneway: t.oneway ?? null,
          maxspeed: t.maxspeed ?? null,
        },
      });
      status.status = "accepted";
      status.reason = null;
    } catch (error) {
      status.status = "rejected";
      status.reason = error.message;
      errors.push({ id, kind, reason: error.message });
    }
  }
  return { features, restrictions, ledger, errors, conflicts, elements };
}
export function navigation(normalized, p) {
  const nodes = new Map(),
    edges = [],
    parent = new Map();
  const root = (id) => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r);
    while (id !== r) {
      const next = parent.get(id);
      parent.set(id, r);
      id = next;
    }
    return r;
  };
  for (const f of normalized.features.filter(
    (f) => f.kind === "road" && f.geometry.type === "LineString",
  )) {
    const ids = f.sourceGeometry.nodes;
    ids.forEach((id) => {
      if (!nodes.has(id)) {
        nodes.set(id, nodePoint(id, normalized.elements, p));
        parent.set(id, id);
      }
    });
    for (let i = 1; i < ids.length; i++) {
      if (ids[i - 1] === ids[i]) continue;
      edges.push({
        id: `${f.id}:${i - 1}`,
        way: f.id,
        from: ids[i - 1],
        to: ids[i],
        oneway: f.tags.oneway ?? null,
        implicitRoundabout: f.tags.junction === "roundabout",
        access: f.tags.access ?? null,
        motorVehicle: f.tags.motor_vehicle ?? null,
        layer: f.tags.layer ?? null,
        bridge: f.tags.bridge ?? null,
        tunnel: f.tags.tunnel ?? null,
      });
      parent.set(root(ids[i]), root(ids[i - 1]));
    }
  }
  const components = new Map();
  for (const id of nodes.keys()) {
    const r = root(id);
    components.set(r, (components.get(r) || 0) + 1);
  }
  return {
    nodes: [...nodes].map(([id, position]) => ({ id, position })),
    edges,
    restrictions: normalized.restrictions,
    components: [...components.values()].sort((a, b) => b - a),
    note: "Connectivity is source node identity, not coordinate proximity. Components are observations, not automatically errors. Access and turn tags are retained, not yet a runnable city router.",
  };
}
