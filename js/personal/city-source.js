import { Dataset } from "../world-data/dataset.js";
import { project, unproject } from "../world-data/projection.js";
import { clipping, area } from "../world-data/polygons.js";
import { section } from "./geometry.js";
// Use the same immutable source tiles as the inspector when the entire route
// corridor is covered. Other places use the live source broker and SAME normalizer.
export async function cityRouteSource(
  route,
  { signal, onStatus = () => {}, url, fetcher = fetch } = {},
) {
  if (!url) {
    if (typeof document === "undefined") return null;
    const configured = document.querySelector(
      "meta[name=world-data-index]",
    )?.content;
    if (!configured) return null;
    url = new URL(configured, document.baseURI);
  }
  const target = url;
  const initial = await fetcher(target, { signal });
  if (initial.status === 404) return null;
  if (!initial.ok)
    throw Error("The Cambridge dataset could not load. Please retry.");
  const index = await initial.json();
  const reader = new Dataset(target, {
    fetcher: (url) => fetcher(url, { signal }),
  });
  // Validate before trusting any file paths or source geometry.
  const { validateIndex } = await import("../world-data/schema.js");
  validateIndex(index);
  reader.index = index;
  const polygons = index.boundary.bufferedGeometry.coordinates;
  const parts = Array.from({ length: Math.ceil(route.length / 600) }, (_, i) =>
    section(route, i),
  );
  const boxes = parts.map((part) => {
    const b = part.bounds,
      a = project(index.projection, [b[1], b[2]]),
      c = project(index.projection, [b[3], b[0]]);
    return [a.x, a.z, c.x, c.z];
  });
  // Corner checks miss concave gaps and holes. Require the whole corridor box.
  if (boxes.some(([x,z,X,Z]) => area(clipping.difference(
    [[[[x,z],[X,z],[X,Z],[x,Z],[x,z]]]], polygons,
  )) > .01)) return null;
  const selected = index.tiles.filter((t) =>
    boxes.some(
      (b) =>
        t.bounds[0] <= b[2] &&
        t.bounds[2] >= b[0] &&
        t.bounds[1] <= b[3] &&
        t.bounds[3] >= b[1],
    ),
  );
  const features = new Map();
  for (const [i, t] of selected.entries()) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    onStatus(
      `Preparing Cambridge roads and scenery · tile ${i + 1} of ${selected.length}…`,
    );
    for (const f of (await reader.tile(t.id)).features) features.set(f.id, f);
  }
  const elements = new Map(),
    add = (e) => {
      const key = e.type + "/" + e.id,
        old = elements.get(key);
      if (
        old &&
        e.type === "node" &&
        (Math.abs(old.lon - e.lon) > 1e-7 || Math.abs(old.lat - e.lat) > 1e-7)
      )
        throw Error("City source node coordinates disagree.");
      elements.set(
        key,
        old ? { ...old, ...e, tags: { ...old.tags, ...e.tags } } : e,
      );
    };
  for (const f of features.values()) {
    const common = {
      id: Number(f.id.split("/")[1]),
      tags: f.tags,
      version: f.provenance.version,
      timestamp: f.provenance.timestamp,
    };
    if (f.geometry.type === "Point" && f.id.startsWith("node/")) {
      const [lon, lat] = unproject(index.projection, {
        x: f.geometry.coordinates[0],
        z: f.geometry.coordinates[1],
      });
      add({ ...common, type: "node", lon, lat });
    }
    if (
      f.geometry.type === "LineString" &&
      f.id.startsWith("way/") &&
      f.sourceGeometry.nodes
    ) {
      if (f.sourceGeometry.nodes.length !== f.geometry.coordinates.length)
        throw Error(
          "City source way geometry does not match its node references.",
        );
      f.geometry.coordinates.forEach(([x, z], i) => {
        const [lon, lat] = unproject(index.projection, { x, z });
        add({ type: "node", id: f.sourceGeometry.nodes[i], lon, lat });
      });
      add({ ...common, type: "way", nodes: f.sourceGeometry.nodes });
    }
  }
  const [report, graph] = await Promise.all([
    reader.read("validation.json"),
    reader.read("navigation.json"),
  ]);
  const bounds = [
    Math.min(...parts.map((p) => p.bounds[0])),
    Math.min(...parts.map((p) => p.bounds[1])),
    Math.max(...parts.map((p) => p.bounds[2])),
    Math.max(...parts.map((p) => p.bounds[3])),
  ];
  return {
    data: {
      elements: [...elements.values()],
      osm3s: { timestamp_osm_base: index.snapshot },
      normalized: {
        features: [...features.values()],
        projection: index.projection,
        version: index.version,
        errors: report.rejected,
        restrictions: graph.restrictions.filter((r) =>
          r.members.some(
            (m) => m.type === "way" && elements.has("way/" + m.ref),
          ),
        ),
      },
    },
    part: {
      bounds,
      coordinates: route.coordinates,
      sourceSections: selected.length,
    },
  };
}
