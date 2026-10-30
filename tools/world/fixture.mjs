import fs from "node:fs/promises";
import { fixture } from "../../tests/world-fixture.mjs";
import { projection } from "../../js/world-data/projection.js";
import { mergeSnapshots, relationGeometry } from "./normalize.mjs";
import { compile } from "./build.mjs";
import { hash, atomic } from "./acquire.mjs";
import { area } from "./coverage.mjs";
const { config, data } = fixture(),
  p = projection(config.origin),
  { elements } = mergeSnapshots([data]);
const geometry = relationGeometry(elements.get("relation/100"), elements, p);
const acquisition = {
  status: "complete",
  snapshot: data.osm3s.timestamp_osm_base,
  parts: [{ file: "fixture.json", status: "complete" }],
  expectedParts: ["fixture.json"],
  extent: {
    id: "relation/100",
    version: 1,
    timestamp: data.osm3s.timestamp_osm_base,
    geometry,
    areaSquareMetres: area(geometry.coordinates),
    bufferMetres: 100,
  },
};
const result = compile({
  config,
  acquisition,
  snapshots: [data],
  sources: [
    {
      file: "synthetic-fixture",
      sha256: hash(JSON.stringify(data)),
      license: "CC0",
      provider: "Original test data",
      snapshot: acquisition.snapshot,
      crs: "EPSG:4326",
    },
  ],
});
const output = process.argv[2] || "tests/fixtures/world/dataset";
await fs.mkdir(output, { recursive: true });
for (const [file, text] of result.files)
  await atomic(output + "/" + file, text);
console.log(
  JSON.stringify({
    output,
    version: result.manifest.version,
    structuralPass: result.report.structuralPass,
    tiles: result.manifest.tiles.length,
  }),
);
