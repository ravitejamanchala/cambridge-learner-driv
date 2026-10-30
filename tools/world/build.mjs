import fs from "node:fs/promises";
import { validateIndex, canonical } from "../../js/world-data/schema.js";
export { canonical };
import path from "node:path";
import { projection, unproject } from "../../js/world-data/projection.js";
import { polygonErrors, bounds } from "../../js/world-data/geometry.js";
import { normalize, navigation } from "./normalize.mjs";
import {
  bufferBoundary,
  inventory,
  overlapBounds,
  clipping,
  area,
} from "./coverage.mjs";
import { hash, atomic, validateResponse } from "./acquire.mjs";
const counts = (rows) => {
  const result = {};
  for (const row of rows) result[row] = (result[row] || 0) + 1;
  return result;
};
export function compile({ config, acquisition, snapshots, sources }) {
  const p = projection(config.origin),
    data = normalize(snapshots, p),
    graph = navigation(data, p);
  if (!acquisition.extent?.geometry)
    throw Error("No resolved city boundary; acquisition is not ready");
  const polygons = acquisition.extent.geometry.coordinates,
    invalid = polygonErrors(polygons);
  if (invalid.length)
    throw Error("Invalid city boundary: " + invalid.join("; "));
  const extent = bufferBoundary(polygons, config.bufferMetres),
    tiles = inventory(extent, config.tileSize).map((t) => ({
      ...t,
      status: "empty",
      featureIds: [],
      ownerIds: [],
    }));
  if (config.synthetic)
    for (const f of data.features)
      f.provenance.source =
        "Original synthetic fixture, not OpenStreetMap geography";
  const outside = [];
  for (const f of data.features) {
    // Conservative bbox references preserve entire crossing geometry. Never clip/dedup
    // fragments by their parent ID. Only the owning shard stores the geometry.
    const touched = tiles.filter((t) => overlapBounds(f.bounds, t.bounds));
    if (!touched.length) {
      outside.push(f.id);
      continue;
    }
    f.owner = touched[0].id;
    for (const t of touched) t.featureIds.push(f.id);
    touched[0].ownerIds.push(f.id);
  }
  for (const t of tiles) if (t.featureIds.length) t.status = "populated";
  const sourceMissing = [];
  for (const e of data.elements.values()) {
    for (const id of e.nodes || [])
      if (!data.elements.has(`node/${id}`))
        sourceMissing.push({ id: `way/${e.id}`, missing: `node/${id}` });
    for (const m of e.members || [])
      if (!data.elements.has(`${m.type}/${m.ref}`))
        sourceMissing.push({
          id: `relation/${e.id}`,
          missing: `${m.type}/${m.ref}`,
        });
  }
  const duplicates = [],
    buildings = data.features.filter(
      (f) => f.kind === "building" && f.geometry.type === "MultiPolygon",
    );
  const checked = new Set();
  for (const tile of tiles) {
    const tileIds = new Set(tile.featureIds);
    const local = buildings.filter((f) => tileIds.has(f.id));
    for (let i = 0; i < local.length; i++)
      for (let j = i + 1; j < local.length; j++) {
        const a = local[i],
          b = local[j],
          key = a.id + "|" + b.id;
        if (checked.has(key) || !overlapBounds(a.bounds, b.bounds)) continue;
        checked.add(key);
        const intersection = area(
          clipping.intersection(a.geometry.coordinates, b.geometry.coordinates),
        );
        if (intersection > 1)
          duplicates.push({
            a: a.id,
            b: b.id,
            overlapSquareMetres: intersection,
            reason:
              "Review building parts, relation members or duplicate source footprints; no automatic deletion",
          });
      }
  }
  const unresolved = acquisition.expectedParts?.filter(
    (file) =>
      !acquisition.parts.some(
        (p) => p.file === file && p.status === "complete",
      ),
  ) || ["Missing expected acquisition inventory"];
  const missingProvenance = data.features
    .filter(
      (f) => f.provenance.version === null || f.provenance.timestamp === null,
    )
    .map((f) => f.id);
  const report = {
    schemaVersion: 1,
    city: config.id,
    acquisitionStatus: acquisition.status,
    sourceCoverage: acquisition.sourceCoverage || "bounded-overpass",
    selection: acquisition.selection || null,
    synthetic: !!config.synthetic,
    sourceCounts: counts([...data.elements.values()].map((e) => e.type)),
    featureCounts: counts(data.features.map((f) => f.kind)),
    ledgerCounts: counts(data.ledger.map((f) => f.status)),
    acceptedFeatures: data.features.length,
    acceptedRestrictions: data.restrictions.length,
    sourceConflicts: data.conflicts,
    missingProvenance,
    rejected: data.errors,
    unresolvedReferences: sourceMissing,
    expectedTiles: tiles.length,
    generatedTiles: tiles.length,
    emptyTiles: tiles.filter((t) => t.status === "empty").length,
    missingSourceParts: unresolved,
    acquisitionFailures: acquisition.failures || [],
    outsideExtentDependencies: outside,
    duplicateBuildingCandidates: duplicates,
    unknownBuildingHeights: buildings
      .filter((f) => f.attributes.height.value === null)
      .map((f) => f.id),
    routing: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      componentSizes: graph.components,
      restrictions: graph.restrictions.length,
    },
    structuralPass:
      acquisition.status === "complete" &&
      !data.errors.length &&
      !data.conflicts.length &&
      !sourceMissing.length &&
      !unresolved.length &&
      !missingProvenance.length,
    dataGate: {
      status: "incomplete",
      reasons: [
        "Google satellite review pending",
        "Supporting-source and source-conflict review pending",
        "Regional extract coverage check pending: bbox queries may miss crossing features with no nodes inside the queried extent",
        "Renderer and drivable city integration deferred until data gate passes",
      ],
    },
    visualReview: { reviewed: 0, unreviewed: tiles.length, unavailable: 0 },
    terrain: { status: "unavailable", verticalDatum: null, source: null },
  };
  if (config.synthetic)
    report.dataGate.reasons.unshift(
      "Synthetic test data; cannot establish Cambridge accuracy",
    );
  if (!report.structuralPass)
    report.dataGate.reasons.unshift(
      "Structural or acquisition errors unresolved",
    );
  if (duplicates.length)
    report.dataGate.reasons.push(
      "Building overlap candidates require source reconciliation",
    );
  const files = new Map(),
    put = (file, value) => files.set(file, canonical(value) + "\n");
  const owners = new Map(
    data.features.filter((f) => f.owner).map((f) => [f.id, f.owner]),
  );
  for (const tile of tiles)
    put(`tiles/${tile.id}.json`, {
      schemaVersion: 1,
      ...tile,
      references: tile.featureIds.map((id) => ({ id, owner: owners.get(id) })),
      features: data.features.filter((f) => f.owner === tile.id),
    });
  put("navigation.json", graph);
  if (data.ledger.length <= 10000) put("ledger.json", data.ledger);
  else {
    const shards = [];
    for (let start = 0; start < data.ledger.length; start += 10000) {
      const file = `ledger/${shards.length}.json`;
      put(file, data.ledger.slice(start, start + 10000));
      shards.push(file);
    }
    put("ledger.json", {
      schemaVersion: 1,
      records: data.ledger.length,
      shards,
    });
  }
  put("validation.json", report);
  put("review-grid.json", {
    schemaVersion: 1,
    instructions:
      "Record MATCHES, MISMATCH or CANNOT VERIFY per inspected feature. Overview is not an accuracy percentage.",
    tiles: tiles.map((t) => {
      const a = unproject(p, { x: t.bounds[0], z: t.bounds[1] }),
        b = unproject(p, { x: t.bounds[2], z: t.bounds[3] });
      return {
        id: t.id,
        bounds: t.bounds,
        overview: "unreviewed",
        observations: [],
        google: `https://www.google.com/maps/@?api=1&map_action=map&center=${(a[1] + b[1]) / 2}%2C${(a[0] + b[0]) / 2}&zoom=18&basemap=satellite`,
      };
    }),
  });
  const manifest = {
    schemaVersion: 1,
    city: config.id,
    name: config.name,
    synthetic: !!config.synthetic,
    projection: p,
    tileSize: config.tileSize,
    snapshot: acquisition.snapshot,
    boundary: {
      ...acquisition.extent,
      bufferMetres: config.bufferMetres,
      bufferedGeometry: { type: "MultiPolygon", coordinates: extent },
      bounds: bounds(extent.flat(2)),
      geographicBounds: bounds(
        extent.flat(2).map(([x, z]) => unproject(p, { x, z })),
      ),
    },
    attribution: config.attribution,
    sources,
    accepted: false,
    stage: "data-inspection",
    layers: counts(data.features.map((f) => f.kind)),
    ownership:
      "Whole feature in exactly one owning tile; bbox references in every covered tile; consumers reference-count IDs. Coordinates remain in city frame.",
    tiles: tiles.map((t) => ({
      id: t.id,
      status: t.status,
      bounds: t.bounds,
      path: `tiles/${t.id}.json`,
      references: t.featureIds.length,
      owned: t.ownerIds.length,
    })),
    files: Object.fromEntries(
      [...files].map(([name, text]) => [
        name,
        { sha256: hash(text), bytes: Buffer.byteLength(text) },
      ]),
    ),
  };
  if (acquisition.sourceCoverage === "regional-geometry-intersection") {
    report.dataGate.reasons = report.dataGate.reasons.filter(
      (reason) => !reason.startsWith("Regional extract coverage check pending"),
    );
    put("validation.json", report);
    const reportText = files.get("validation.json");
    manifest.files["validation.json"] = {
      sha256: hash(reportText),
      bytes: Buffer.byteLength(reportText),
    };
  }
  const version = hash(canonical(manifest));
  manifest.version = version;
  validateIndex(manifest);
  put("index.json", manifest);
  return { manifest, files, report };
}
export async function build(config, sourceDir, outputRoot) {
  const acquisition = JSON.parse(
    await fs.readFile(path.join(sourceDir, "acquisition.json"), "utf8"),
  );
  if (acquisition.configHash !== hash(JSON.stringify(config)))
    throw Error("Acquisition/config mismatch");
  const snapshots = [],
    sources = [];
  for (const record of acquisition.parts.filter(
    (p) => p.status === "complete" && p.file !== "discovery.json",
  )) {
    if (!/^(boundary|regional|parts\/-?\d+_-?\d+)\.json$/.test(record.file))
      throw Error("Invalid source path");
    const bytes = await fs.readFile(path.join(sourceDir, record.file));
    if (hash(bytes) !== record.sha256)
      throw Error(`Source checksum mismatch: ${record.file}`);
    const data = validateResponse(JSON.parse(bytes));
    snapshots.push(data);
    sources.push({
      file: record.file,
      sha256: record.sha256,
      queryHash: record.queryHash,
      license: "ODbL-1.0",
      provider: record.provider || config.endpoint,
      sourceKind: record.sourceKind || "overpass",
      upstream: record.upstream || null,
      snapshot: acquisition.snapshot,
      crs: "EPSG:4326",
    });
  }
  const result = compile({ config, acquisition, snapshots, sources }),
    dir = path.join(outputRoot, result.manifest.version);
  // Immutable output: only an identical rebuild may reuse this version directory.
  for (const [name, text] of result.files) {
    const file = path.join(dir, name);
    try {
      if ((await fs.readFile(file, "utf8")) !== text)
        throw Error(`Immutable dataset conflict: ${name}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await atomic(file, text);
    }
  }
  return { ...result, dir };
}
