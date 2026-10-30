import test from "node:test";
import assert from "node:assert/strict";
import { normalizeForTrack, GENERATOR } from "../js/personal/geo/normalized.js";
import { applyMappedRoadTags } from "../js/mapped-road-tags.js";
import { laneInfo } from "../js/net.js";
import { lineDashes } from "../js/markings.js";
import { fixture } from "./world-fixture.mjs";
import { generateSection } from "../js/personal/section.js";
import { roadFixture } from "./personal-route-fixture.mjs";
import { measure, section } from "../js/personal/geometry.js";
import { cityRouteSource } from "../js/personal/city-source.js";
test("runtime normalizer preserves shared source holes and refuses malformed buildings", () => {
  const { data, config } = fixture();
  let n = normalizeForTrack(data, config.origin);
  assert.equal(
    n.features.find((f) => f.id === "relation/101").geometry.coordinates[0]
      .length,
    2,
  );
  data.elements
    .find((e) => e.type === "relation" && e.id === 101)
    .members.forEach((m) => (m.role = "inner"));
  n = normalizeForTrack(data, config.origin);
  assert.match(
    n.errors.find((e) => e.id === "relation/101").reason,
    /Missing exterior/,
  );
});
test("new generation marks unknown paint explicitly while preserving authored legacy behaviour", () => {
  const net = { ways: [{}, {}, {}, {}] };
  applyMappedRoadTags(net, [
    { generator: GENERATOR, tags: {} },
    { generator: GENERATOR, tags: { lane_markings: "yes" } },
    { generator: GENERATOR, tags: { lane_markings: "no" } },
    { tags: {} },
  ]);
  assert.deepEqual(
    net.ways.map((w) => w.laneMarkings),
    [false, true, false, true],
  );
});
test("consistent tagged directional lanes preserve a 2+1 split and shifted dividing line", () => {
  const way = { w: 9.6, lanes: 3, oneway: false },
    e = { way, len: 100, a: 0, b: 1 };
  applyMappedRoadTags({ ways: [way] }, [
    {
      generator: GENERATOR,
      tags: {
        "lanes:forward": "2",
        "lanes:backward": "1",
        lane_markings: "yes",
      },
    },
  ]);
  const a = laneInfo(e, 1),
    b = laneInfo(e, -1);
  assert.equal(a.n, 2);
  assert.equal(b.n, 1);
  assert.ok(Math.abs(a.laneW - 3.2) < 1e-9);
  assert.ok(Math.abs(b.laneW - 3.2) < 1e-9);
  const net = { inc: [[{ e }], [{ e }]] };
  assert.ok(
    lineDashes(net, e)
      .filter((x) => x.kind === "centre")
      .every((x) => Math.abs(x.off + 1.6) < 1e-9),
  );
  const bad = { w: 9.6, lanes: 4, oneway: false };
  applyMappedRoadTags({ ways: [bad] }, [
    {
      generator: GENERATOR,
      tags: { "lanes:forward": "2", "lanes:backward": "1" },
    },
  ]);
  assert.equal(bad.directionalLanes, undefined);
});
test("My routes produces a native drivable track using the shared source generator", () => {
  const f = roadFixture([0.12, 52.2], [0.121, 52.204]),
    part = section(measure(f.coordinates), 0),
    track = generateSection(f.osm, part);
  assert.equal(track.osm.generator, GENERATOR);
  assert.equal(track.osm.validation.accepted, false);
  assert.ok(
    track.objects.some((o) => o.type === "building" && o.properties.provenance),
  );
  assert.ok(track.plan.nodes.length > 1);
  assert.equal(track.buildingStyle, "simulator");
});
test("city source 404 falls back, cancellation and corrupt responses do not silently substitute maps", async () => {
  const route = measure([
      [0.12, 52.2],
      [0.121, 52.204],
    ]),
    url = "https://test.invalid/index.json";
  assert.equal(
    await cityRouteSource(route, {
      url,
      fetcher: async () => new Response("", { status: 404 }),
    }),
    null,
  );
  await assert.rejects(
    cityRouteSource(route, { url, fetcher: async () => new Response("{}") }),
    /index/,
  );
  await assert.rejects(
    cityRouteSource(route, {
      url,
      fetcher: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    }),
    (e) => e.name === "AbortError",
  );
});
