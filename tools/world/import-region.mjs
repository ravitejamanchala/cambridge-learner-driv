import fs from "node:fs/promises";
import path from "node:path";
import { projection } from "../../js/world-data/projection.js";
import { mergeSnapshots, relationGeometry } from "./normalize.mjs";
import { hash, atomic } from "./acquire.mjs";
import { area } from "./coverage.mjs";
const [
  configPath = "configs/world/cambridge.json",
  sourceDir = ".world-sources/cambridge-regional",
] = process.argv.slice(2);
const config = JSON.parse(await fs.readFile(configPath, "utf8")),
  selection = JSON.parse(
    await fs.readFile(path.join(sourceDir, "selection.json"), "utf8"),
  );
const bytes = await fs.readFile(path.join(sourceDir, "regional.json")),
  data = JSON.parse(bytes),
  p = projection(config.origin);
if (JSON.stringify(p) !== JSON.stringify(selection.projection))
  throw Error("Regional selection projection mismatch");
const { elements } = mergeSnapshots([data]),
  relation = elements.get(selection.boundary);
if (!relation) throw Error("Boundary source absent from regional selection");
const geometry = relationGeometry(relation, elements, p),
  issues = [
    ...selection.missingDependencies,
    ...selection.selectionErrors.map((e) => e.id + ": " + e.reason),
  ];
const sourceURL =
  "https://download.geofabrik.de/europe/united-kingdom/england/" +
  selection.pbf;
await atomic(path.join(sourceDir, "acquisition.json"), {
  schemaVersion: 1,
  city: config.id,
  configHash: hash(JSON.stringify(config)),
  status: issues.length ? "incomplete" : "complete",
  sourceCoverage: "regional-geometry-intersection",
  boundary: selection.boundary,
  snapshot: selection.snapshot,
  extent: {
    id: selection.boundary,
    version: relation.version,
    timestamp: relation.timestamp,
    geometry,
    areaSquareMetres: area(geometry.coordinates),
    bufferMetres: config.bufferMetres,
  },
  expectedParts: ["regional.json"],
  parts: [
    {
      file: "regional.json",
      status: "complete",
      sha256: hash(bytes),
      queryHash: hash(JSON.stringify(selection)),
      bytes: bytes.length,
      elements: data.elements.length,
      provider: "Geofabrik / OpenStreetMap",
      sourceKind: "regional-pbf",
      upstream: {
        url: sourceURL,
        sha256: selection.pbfSha256,
        bytes: selection.pbfBytes,
        snapshot: selection.snapshot,
      },
    },
  ],
  selection: {
    counts: selection.counts,
    method: selection.selectionMethod,
    unsupportedRelations: selection.unsupportedRelations,
    outsideSelectionAreaErrors: selection.outsideSelectionAreaErrors,
    selectionSafetyMetres: selection.selectionSafetyMetres,
  },
  failures: issues,
});
console.log(
  JSON.stringify({
    boundary: selection.boundary,
    snapshot: selection.snapshot,
    sourceElements: data.elements.length,
    issues: issues.length,
  }),
);
