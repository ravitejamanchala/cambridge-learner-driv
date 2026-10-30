import { normalize } from "../../world-data/normalize.js";
import { projection, project, unproject } from "../../world-data/projection.js";
import { areaKind, pointKind } from "./osm-details.js";
import { sceneFeatures, PATH_KINDS } from "./map-features.js";
export const GENERATOR = "source-normalized-v1";
// One normalization implementation for the city inspector and the actual My routes worker.
export function normalizeForTrack(data, origin) {
  const p = projection(origin);
  if (data.normalized) {
    const source = data.normalized;
    const point = ([x, z]) => {
      const q = project(p, unproject(source.projection, { x, z }));
      return [q.x, q.z];
    };
    return {
      features: source.features.map((f) => ({
        ...f,
        geometry: {
          type: f.geometry.type,
          coordinates:
            f.geometry.type === "Point"
              ? point(f.geometry.coordinates)
              : f.geometry.type === "LineString"
                ? f.geometry.coordinates.map(point)
                : f.geometry.coordinates.map((poly) =>
                    poly.map((r) => r.map(point)),
                  ),
        },
      })),
      errors: source.errors || [],
      conflicts: [],
      restrictions: source.restrictions || [],
      version: source.version,
    };
  }
  const n = normalize([data], p);
  if (n.conflicts.length)
    throw Error("Conflicting source versions. Retry map generation.");
  return n;
}
export function normalizedScenery(track, normalized, { limits = {} } = {}) {
  const features = [];
  for (const f of normalized.features) {
    const g = f.geometry,
      t = f.tags || {},
      base = { id: f.id, tags: t, name: t.name };
    if (g.type === "MultiPolygon") {
      const kind = areaKind(t);
      if (kind)
        g.coordinates.forEach((rings, i) =>
          features.push({ ...base, id: f.id + "/" + i, kind, rings }),
        );
    } else if (g.type === "LineString") {
      const kind = PATH_KINDS.has(t.highway)
        ? t.highway
        : ["wall", "fence", "hedge"].includes(t.barrier)
          ? t.barrier
          : t.railway === "rail"
            ? "rail"
            : null;
      if (kind)
        features.push({
          ...base,
          kind,
          line: g.coordinates,
          width: f.attributes?.width?.value ?? undefined,
        });
    } else {
      const kind = pointKind(t);
      if (kind)
        features.push({
          ...base,
          kind,
          point: g.coordinates,
          height: f.attributes?.height?.value ?? undefined,
          measured: f.attributes?.height?.value != null,
        });
    }
  }
  const result = sceneFeatures(track, features, { limits });
  result.osm.restrictions = normalized.restrictions.map((r) => ({
    osmId: Number(r.id.split("/")[1]),
    tags: r.tags,
    members: r.members,
  }));
  result.osm.controlPoints = normalized.features
    .filter(
      (f) =>
        f.geometry.type === "Point" &&
        (["crossing", "stop", "give_way", "traffic_signals"].includes(f.kind) ||
          f.tags?.traffic_sign),
    )
    .map((f) => ({
      osmId: Number(f.id.split("/")[1]),
      ...f.sourceGeometry,
      tags: f.tags,
    }));
  return result;
}
