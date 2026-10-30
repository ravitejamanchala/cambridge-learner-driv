// Original synthetic topology. NOT surveyed Cambridge geometry.
import { projection, unproject } from "../js/world-data/projection.js";
export function fixture() {
  const config = {
    id: "synthetic-cambridge-test",
    name: "Synthetic geometry test — not Cambridge geography",
    synthetic: true,
    origin: [52.21829, 0.14688],
    bufferMetres: 100,
    tileSize: 500,
    acquisitionTileMetres: 1000,
    endpoint: "https://overpass-api.de/api/interpreter",
    attribution: "Original synthetic test fixture, CC0; not OSM data",
  };
  const p = projection(config.origin),
    elements = [];
  let nextNode = 1,
    nextWay = 1;
  const node = (x, z, tags) => {
    const [lon, lat] = unproject(p, { x, z }),
      id = nextNode++;
    elements.push({
      type: "node",
      id,
      lon,
      lat,
      ...(tags ? { tags } : {}),
      version: 1,
      timestamp: "2026-01-01T00:00:00Z",
    });
    return id;
  };
  const way = (nodes, tags) => {
    const id = nextWay++;
    elements.push({
      type: "way",
      id,
      nodes,
      tags,
      version: 1,
      timestamp: "2026-01-01T00:00:00Z",
    });
    return id;
  };
  const ring = (points) => {
    const ids = points.map(([x, z]) => node(x, z));
    return [...ids, ids[0]];
  };
  const city = way(
    ring([
      [-700, -700],
      [700, -700],
      [700, 700],
      [-700, 700],
    ]),
    {},
  );
  elements.push({
    type: "relation",
    id: 100,
    tags: {
      type: "multipolygon",
      boundary: "administrative",
      name: "Synthetic city",
      admin_level: "8",
    },
    members: [{ type: "way", ref: city, role: "outer" }],
    version: 1,
    timestamp: "2026-01-01T00:00:00Z",
  });
  const a = node(-650, 0),
    b = node(0, 0),
    c = node(650, 0),
    d = node(0, 650);
  const road = way([a, b, c], {
      highway: "residential",
      name: "Fixture road",
      lanes: "2",
      maxspeed: "20 mph",
    }),
    turn = way([b, d], { highway: "residential", oneway: "yes" });
  way([node(-300, -650), node(-300, 650)], {
    highway: "primary",
    bridge: "yes",
    layer: "1",
    name: "Grade separated crossing",
  });
  const outer = way(
      ring([
        [80, 90],
        [220, 90],
        [220, 220],
        [80, 220],
      ]),
      {},
    ),
    inner = way(
      ring([
        [120, 120],
        [160, 120],
        [160, 160],
        [120, 160],
      ]),
      {},
    );
  elements.push({
    type: "relation",
    id: 101,
    tags: { type: "multipolygon", building: "school", height: "12" },
    members: [
      { type: "way", ref: outer, role: "outer" },
      { type: "way", ref: inner, role: "inner" },
    ],
    version: 1,
    timestamp: "2026-01-01T00:00:00Z",
  });
  way(
    ring([
      [-550, -180],
      [-400, -180],
      [-400, -100],
      [-550, -100],
    ]),
    { building: "terrace", "building:levels": "2" },
  );
  way(
    ring([
      [200, -400],
      [560, -400],
      [560, -150],
      [200, -150],
    ]),
    { natural: "water" },
  );
  way([node(-600, 50), node(600, 50)], { highway: "footway" });
  node(-100, -60, { amenity: "shelter", shelter_type: "bus_stop" });
  node(100, -60, { natural: "tree" });
  node(140, -60, { amenity: "bench" });
  elements.push({
    type: "relation",
    id: 102,
    tags: { type: "restriction", restriction: "no_left_turn" },
    members: [
      { type: "way", ref: road, role: "from" },
      { type: "node", ref: b, role: "via" },
      { type: "way", ref: turn, role: "to" },
    ],
    version: 1,
    timestamp: "2026-01-01T00:00:00Z",
  });
  return {
    config,
    data: {
      version: 0.6,
      generator: "SlayDrive synthetic fixture",
      osm3s: { timestamp_osm_base: "2026-01-01T00:00:00Z" },
      elements,
    },
    ids: { road, turn, city, join: b },
  };
}
