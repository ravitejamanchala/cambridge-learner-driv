import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fixture } from "./world-fixture.mjs";
import {
  projection,
  project,
  unproject,
  tileKey,
  compassToHeading,
  headingToCompass,
} from "../js/world-data/projection.js";
import {
  signedArea,
  ringErrors,
  polygonErrors,
  joinWays,
} from "../js/world-data/geometry.js";
import {
  normalize,
  navigation,
  relationGeometry,
  mergeSnapshots,
} from "../tools/world/normalize.mjs";
import { compile, canonical, build } from "../tools/world/build.mjs";
import {
  requestOSM,
  validateResponse,
  tileQuery,
  hash,
  atomic,
  acquire,
} from "../tools/world/acquire.mjs";
import { bufferBoundary, inventory, area } from "../tools/world/coverage.mjs";
import { Dataset } from "../js/world-data/dataset.js";
function compiled() {
  const { config, data, ids } = fixture(),
    p = projection(config.origin),
    { elements } = mergeSnapshots([data]);
  const geometry = relationGeometry(elements.get("relation/100"), elements, p);
  const acquisition = {
    configHash: hash(JSON.stringify(config)),
    status: "complete",
    snapshot: data.osm3s.timestamp_osm_base,
    expectedParts: ["boundary.json"],
    parts: [
      {
        file: "boundary.json",
        status: "complete",
        sha256: hash(JSON.stringify(data)),
        queryHash: "fixture",
      },
    ],
    extent: {
      id: "relation/100",
      geometry,
      areaSquareMetres: area(geometry.coordinates),
    },
  };
  return {
    config,
    data,
    ids,
    p,
    acquisition,
    result: compile({ config, acquisition, snapshots: [data], sources: [] }),
  };
}
test("Cambridge axes, known location, round trips, tile seams and headings", () => {
  const p = projection([52.205, 0.119]);
  for (const point of [
    [0.14688, 52.21829],
    [0.119, 52.205],
    [0.08, 52.18],
    [0.2, 52.25],
  ]) {
    const world = project(p, point);
    const back = unproject(p, world);
    assert.ok(
      Math.abs(back[0] - point[0]) < 1e-12 &&
        Math.abs(back[1] - point[1]) < 1e-12,
    );
  }
  assert.ok(project(p, [0.14688, 52.21829]).x > 1800);
  assert.ok(project(p, [0.14688, 52.21829]).z < -1400);
  assert.equal(tileKey(-0.001, -1000, 1000), "-1_-1");
  assert.equal(tileKey(1000, 0, 1000), "1_0");
  assert.equal(headingToCompass(compassToHeading(270)), 270);
  assert.throws(() => project(p, [1000, 52]));
});
test("relation assembly retains a courtyard hole and rejects broken members", () => {
  const { data, config } = fixture(),
    n = normalize([data], projection(config.origin)),
    f = n.features.find((f) => f.id === "relation/101");
  assert.equal(n.errors.length, 0);
  assert.equal(f.geometry.coordinates[0].length, 2);
  assert.ok(signedArea(f.geometry.coordinates[0][0]) > 0);
  assert.ok(signedArea(f.geometry.coordinates[0][1]) < 0);
  data.elements = data.elements.filter(
    (e) => !(e.type === "way" && e.id === f.sourceGeometry.members[1].ref),
  );
  const broken = normalize([data], projection(config.origin));
  assert.match(
    broken.errors.find((e) => e.id === "relation/101").reason,
    /Missing/,
  );
});
test("polygon validation rejects self intersections, exterior holes and intersecting holes", () => {
  assert.ok(
    ringErrors([
      [0, 0],
      [10, 10],
      [0, 10],
      [10, 0],
      [0, 0],
    ]).length,
  );
  assert.ok(
    polygonErrors([
      [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [20, 20],
          [22, 20],
          [22, 22],
          [20, 22],
          [20, 20],
        ],
      ],
    ]).includes("hole outside exterior"),
  );
  assert.deepEqual(
    joinWays([
      [1, 2],
      [3, 2],
      [3, 4],
      [4, 1],
    ]),
    [[1, 2, 3, 4, 1]],
  );
  assert.throws(
    () =>
      joinWays([
        [1, 2],
        [2, 3],
      ]),
    /Unclosed/,
  );
});
test("grade separation remains disconnected, turn relation and unknown attributes survive", () => {
  const { config, data, ids } = fixture(),
    p = projection(config.origin),
    n = normalize([data], p),
    g = navigation(n, p);
  assert.equal(g.components.length, 2);
  assert.equal(g.restrictions.length, 1);
  assert.equal(g.restrictions[0].members[1].ref, ids.join);
  assert.ok(g.edges.some((e) => e.bridge === "yes" && e.layer === "1"));
  const unknown = n.features.find((f) => f.tags.building === "terrace");
  assert.equal(unknown.attributes.height.value, null);
  assert.equal(unknown.attributes.height.evidence, "unknown");
  assert.ok(n.features.some((f) => f.kind === "shelter"));
  assert.ok(
    !g.edges.some(
      (e) => e.way === n.features.find((f) => f.kind === "footway").id,
    ),
  );
});
test("source conflicts and provider truncation are explicit", () => {
  const { config, data } = fixture(),
    other = structuredClone(data);
  other.elements[0].lon += 0.001;
  const n = normalize([data, other], projection(config.origin));
  assert.equal(n.conflicts.length, 1);
  assert.throws(
    () => validateResponse({ ...data, remark: "runtime timeout" }),
    /Incomplete/,
  );
  assert.throws(
    () => mergeSnapshots([{ elements: [{ type: "way", id: 1.1 }] }]),
    /identity/,
  );
});
test("buffer inventory covers negative tiles and conservative 1 km margin", () => {
  const polygon = [
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0],
        ],
      ],
    ],
    buffer = bufferBoundary(polygon, 1000),
    tiles = inventory(buffer, 1000);
  assert.ok(tiles.some((t) => t.id === "-1_-1"));
  assert.ok(area(buffer) > area(polygon));
  assert.ok(area(buffer) < 4500000);
  assert.throws(() => inventory(polygon, 0));
});
test("every feature has one owner; references resolve across tile seams; builds deterministic", () => {
  const { result, ...input } = compiled(),
    again = compile({
      config: input.config,
      acquisition: input.acquisition,
      snapshots: [input.data],
      sources: [],
    });
  assert.equal(result.manifest.version, again.manifest.version);
  assert.equal(result.report.structuralPass, true);
  assert.equal(result.manifest.accepted, false);
  const owned = new Map();
  let repeated = 0;
  for (const t of result.manifest.tiles) {
    const tile = JSON.parse(result.files.get(t.path));
    for (const f of tile.features) {
      assert.equal(owned.has(f.id), false);
      owned.set(f.id, t.id);
    }
    for (const r of tile.references) if (r.owner !== tile.id) repeated++;
  }
  assert.ok(repeated > 0);
  for (const t of result.manifest.tiles)
    for (const r of JSON.parse(result.files.get(t.path)).references)
      assert.equal(owned.get(r.id), r.owner);
  assert.equal(result.report.acceptedFeatures, owned.size);
});
test("failed acquisition and unresolved nodes prevent structural acceptance", () => {
  const { config, data, acquisition } = compiled();
  acquisition.parts[0].status = "failed";
  acquisition.status = "incomplete";
  data.elements = data.elements.filter(
    (e) => !(e.type === "node" && e.id === 1),
  );
  const r = compile({ config, acquisition, snapshots: [data], sources: [] });
  assert.equal(r.report.structuralPass, false);
  assert.ok(r.report.unresolvedReferences.length);
  assert.ok(r.report.missingSourceParts.length);
  assert.equal(r.manifest.accepted, false);
});
test("provider retries 429 with backoff, rejects forbidden and incomplete responses", async () => {
  const { data } = fixture();
  let calls = 0;
  const waits = [];
  const response = await requestOSM("https://example.org", "query", {
    fetcher: async () =>
      ++calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "2" } })
        : new Response(JSON.stringify(data)),
    delay: async (ms) => waits.push(ms),
  });
  assert.equal(response.elements.length, data.elements.length);
  assert.deepEqual(waits, [2000]);
  assert.equal(calls, 2);
  await assert.rejects(
    requestOSM("https://example.org", "q", {
      fetcher: async () => new Response("", { status: 403 }),
    }),
    /403/,
  );
  await assert.rejects(
    requestOSM("https://example.org", "q", {
      fetcher: async () =>
        new Response(JSON.stringify({ ...data, remark: "timeout" })),
    }),
    /Incomplete/,
  );
  assert.match(
    tileQuery([52, 0.1, 52.1, 0.2], "2026-01-01T00:00:00Z"),
    /date:/,
  );
});
test("immutable disk build verifies source hashes and detects modified output", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "world-data-"));
  try {
    const { config, data, acquisition } = compiled();
    await atomic(temp + "/source/acquisition.json", acquisition);
    await fs.writeFile(temp + "/source/boundary.json", JSON.stringify(data));
    const a = await build(config, temp + "/source", temp + "/out"),
      b = await build(config, temp + "/source", temp + "/out");
    assert.equal(a.manifest.version, b.manifest.version);
    await fs.writeFile(a.dir + "/navigation.json", "{}");
    await assert.rejects(
      build(config, temp + "/source", temp + "/out"),
      /Immutable/,
    );
    await fs.writeFile(temp + "/source/boundary.json", "{}");
    await assert.rejects(
      build(config, temp + "/source", temp + "/new"),
      /checksum/,
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
test("inspection reader deduplicates requests, bounds cache and detects corrupt files", async () => {
  const { result } = compiled();
  let calls = 0;
  const reader = new Dataset("https://example.org/index.json", {
    maxEntries: 2,
    fetcher: async (url) => {
      calls++;
      await new Promise((r) => setTimeout(r, 2));
      const file = new URL(url).pathname.slice(1),
        text = result.files.get(file);
      return new Response(text || "", { status: text ? 200 : 404 });
    },
  });
  await reader.open();
  const id = result.manifest.tiles[0].id;
  await Promise.all([reader.tile(id), reader.tile(id)]);
  assert.ok(reader.cache.size <= 2);
  const requests = calls;
  await reader.read("validation.json");
  await reader.read("validation.json");
  assert.equal(calls, requests + 1);
  await assert.rejects(reader.read("../escape.json"), /manifest/);
  const bad = new Dataset("https://example.org/index.json", {
    fetcher: async (url) =>
      new Response(
        new URL(url).pathname === "/index.json"
          ? result.files.get("index.json")
          : "{}",
      ),
  });
  await bad.open();
  await assert.rejects(bad.read("validation.json"), /mismatch/);
});
test("acquisition records failure without inventing a boundary and can resume discovery", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "world-acquire-")),
    config = {
      ...fixture().config,
      boundary: {
        name: "Cambridge",
        adminLevel: "8",
        discoveryBounds: [52, 0.0, 52.3, 0.3],
      },
    };
  try {
    await assert.rejects(
      acquire(config, temp, {
        request: async () => {
          throw Error("HTTP 403");
        },
      }),
      /403/,
    );
    const state = JSON.parse(await fs.readFile(temp + "/acquisition.json"));
    assert.equal(state.status, "incomplete");
    assert.equal(state.boundary, null);
    assert.equal(state.parts[0].status, "failed");
    await assert.rejects(
      acquire({ ...config, tileSize: 200 }, temp),
      /Configuration changed/,
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
test("administrative labels are not polygon edges; truly unsupported members stay rejected", () => {
  const { config, data } = fixture(),
    rel = data.elements.find((e) => e.type === "relation" && e.id === 100);
  rel.members.push({ type: "node", ref: 1, role: "admin_centre" });
  let n = normalize([data], projection(config.origin));
  assert.ok(n.features.some((f) => f.id === "relation/100"));
  rel.members.push({ type: "relation", ref: 999, role: "outer" });
  n = normalize([data], projection(config.origin));
  assert.ok(n.errors.some((e) => e.id === "relation/100"));
});
test("empty tile inventory and source metadata gaps stay explicit", () => {
  const { config, acquisition } = compiled();
  const data = {
    elements: [
      {
        type: "node",
        id: 1,
        lat: config.origin[0],
        lon: config.origin[1],
        tags: { natural: "tree" },
      },
    ],
  };
  const r = compile({ config, acquisition, snapshots: [data], sources: [] });
  assert.ok(r.report.emptyTiles > 0);
  assert.equal(r.report.generatedTiles, r.report.expectedTiles);
  assert.equal(r.report.structuralPass, false);
  assert.deepEqual(r.report.missingProvenance, ["node/1"]);
});
test("successful acquisition resumes without network and detects tampered source cache", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "world-resume-")),
    sample = fixture(),
    config = {
      ...sample.config,
      boundary: {
        name: "Cambridge",
        adminLevel: "8",
        discoveryBounds: [52, 0, 52.3, 0.3],
      },
    },
    calls = [];
  try {
    const request = async (_url, query) => {
      calls.push(query);
      return query.includes("out tags;")
        ? {
            ...sample.data,
            elements: [
              sample.data.elements.find(
                (e) => e.type === "relation" && e.id === 100,
              ),
            ],
          }
        : sample.data;
    };
    const first = await acquire(config, temp, {
      request,
      delay: async () => {},
    });
    assert.equal(first.status, "complete");
    assert.equal(first.boundary, "relation/100");
    assert.equal(first.parts.length, first.expectedParts.length);
    assert.ok(calls.slice(1).every((q) => q.includes("[date:")));
    const count = calls.length;
    await acquire(config, temp, { request, delay: async () => {} });
    assert.equal(calls.length, count);
    await fs.writeFile(temp + "/boundary.json", "{}");
    await assert.rejects(
      acquire(config, temp, { request, delay: async () => {} }),
      /integrity mismatch/,
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
test("overlapping multipolygon exteriors are rejected, not silently unioned", () => {
  const { config, data } = fixture(),
    rel = data.elements.find((e) => e.type === "relation" && e.id === 101);
  rel.members.push({ ...rel.members[0] });
  const n = normalize([data], projection(config.origin));
  assert.ok(n.errors.some((e) => e.id === "relation/101"));
});
