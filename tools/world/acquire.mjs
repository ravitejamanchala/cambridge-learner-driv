import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { projection, unproject } from "../../js/world-data/projection.js";
import { relationGeometry, mergeSnapshots } from "./normalize.mjs";
import { bufferBoundary, inventory, area } from "./coverage.mjs";
export const hash = (text) => createHash("sha256").update(text).digest("hex");
export async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file + ".tmp",
    typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n",
  );
  await fs.rename(file + ".tmp", file);
}
export function validateResponse(data) {
  if (
    data.remark ||
    !Array.isArray(data.elements) ||
    !data.osm3s?.timestamp_osm_base
  )
    throw Error(
      `Incomplete provider response: ${data.remark || "missing elements/timestamp"}`,
    );
  if (data.elements.length > 1000000)
    throw Error("Source part exceeds one million elements");
  return data;
}
export async function requestOSM(
  endpoint,
  query,
  {
    fetcher = fetch,
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
    attempts = 3,
  } = {},
) {
  if (new URL(endpoint).protocol !== "https:")
    throw Error("Source endpoint must use HTTPS");
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SlayDrive-Cambridge-data-audit/1.0",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180000),
      });
    } catch (error) {
      throw Error(
        `Source request failed: ${error.message}${error.cause?.message ? " (" + error.cause.message + ")" : ""}`,
        { cause: error },
      );
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === attempts - 1)
        throw Error(`Provider HTTP ${response.status}; retries exhausted`);
      const retry = response.headers.get("retry-after"),
        seconds = Number(retry);
      const wait = retry
        ? Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retry) - Date.now()
        : 5000 * 2 ** attempt;
      if (!Number.isFinite(wait) || wait > 60000)
        throw Error(
          `Provider asks for a later retry (${retry}); job saved, resume later`,
        );
      await delay(Math.max(1000, wait));
      continue;
    }
    if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > 150000000)
      throw Error("Provider body too large");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 150000000) throw Error("Provider body too large");
      chunks.push(chunk);
    }
    return validateResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  }
}
const selector = "[out:json][timeout:120]";
export function tileQuery(bounds, snapshot) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(snapshot))
    throw Error("Invalid snapshot timestamp");
  const box = bounds.join(",");
  // Bounded roots, full downward recursion for ways/relation dependencies.
  return `${selector}[date:"${snapshot}"];(nwr[highway](${box});nwr[building](${box});nwr["building:part"](${box});nwr[landuse](${box});nwr[natural](${box});nwr[waterway](${box});nwr[leisure](${box});nwr[barrier](${box});nwr[railway](${box});nwr[amenity](${box});nwr[traffic_sign](${box});rel[type=restriction](${box}););(._;>>;);out meta;`;
}
export async function acquire(
  config,
  dir,
  {
    request = requestOSM,
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  await fs.mkdir(dir, { recursive: true });
  const stateFile = path.join(dir, "acquisition.json");
  let state;
  try {
    state = JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const configHash = hash(JSON.stringify(config));
  if (state && state.configHash !== configHash)
    throw Error("Configuration changed; use a new snapshot directory");
  if (!state) {
    state = {
      schemaVersion: 1,
      city: config.id,
      configHash,
      status: "pending",
      boundary: null,
      snapshot: null,
      parts: [],
      failures: [],
    };
    await atomic(stateFile, state);
  }
  const part = async (file, query) => {
    const queryHash = hash(query),
      existing = state.parts.find((p) => p.file === file);
    if (existing?.status === "complete") {
      const bytes = await fs.readFile(path.join(dir, file));
      if (existing.queryHash !== queryHash || hash(bytes) !== existing.sha256)
        throw Error(`Cached source integrity mismatch: ${file}`);
      return validateResponse(JSON.parse(bytes));
    }
    const record = existing || { file, queryHash };
    if (!existing) state.parts.push(record);
    record.status = "pending";
    await atomic(stateFile, state);
    try {
      const data = await request(config.endpoint, query),
        text = JSON.stringify(data) + "\n";
      await atomic(path.join(dir, file), text);
      Object.assign(record, {
        status: "complete",
        sha256: hash(text),
        elements: data.elements.length,
        bytes: Buffer.byteLength(text),
      });
      delete record.error;
      await atomic(stateFile, state);
      return data;
    } catch (error) {
      record.status = "failed";
      record.error = error.message;
      await atomic(stateFile, state);
      throw error;
    }
  };
  try {
    if (!state.boundary) {
      const b = config.boundary;
      if (!/^[\w ()-]+$/.test(b.name) || !/^\d+$/.test(b.adminLevel))
        throw Error("Invalid boundary selector");
      const found = await part(
        "discovery.json",
        `${selector};rel[boundary=administrative][admin_level="${b.adminLevel}"][name="${b.name}"](${b.discoveryBounds.join(",")});out tags;`,
      );
      const candidates = found.elements.filter((e) => e.type === "relation");
      if (candidates.length !== 1)
        throw Error(`Expected one boundary; found ${candidates.length}`);
      state.boundary = `relation/${candidates[0].id}`;
      state.snapshot = found.osm3s.timestamp_osm_base;
      await atomic(stateFile, state);
    }
    const id = state.boundary.split("/")[1];
    const boundary = await part(
      "boundary.json",
      `${selector}[date:"${state.snapshot}"];rel(${id});(._;>>;);out meta;`,
    );
    const { elements } = mergeSnapshots([boundary]),
      p = projection(config.origin),
      relation = elements.get(state.boundary);
    if (!relation) throw Error("Boundary relation missing");
    const shape = relationGeometry(relation, elements, p),
      buffered = bufferBoundary(shape.coordinates, config.bufferMetres),
      tiles = inventory(buffered, config.acquisitionTileMetres);
    state.extent = {
      id: state.boundary,
      version: relation.version ?? null,
      timestamp: relation.timestamp ?? null,
      geometry: shape,
      areaSquareMetres: area(shape.coordinates),
      bufferMetres: config.bufferMetres,
      bufferApproximation: "circumscribed 64-gon",
      bufferedGeometry: { type: "MultiPolygon", coordinates: buffered },
    };
    state.expectedParts = [
      "discovery.json",
      "boundary.json",
      ...tiles.map((t) => `parts/${t.id}.json`),
    ];
    await atomic(stateFile, state);
    for (const tile of tiles) {
      const a = unproject(p, { x: tile.bounds[0], z: tile.bounds[3] }),
        b = unproject(p, { x: tile.bounds[2], z: tile.bounds[1] });
      const file = `parts/${tile.id}.json`;
      if (
        !state.parts.some((p) => p.file === file && p.status === "complete")
      ) {
        console.log(
          `Acquiring ${file} (${state.parts.filter((p) => p.status === "complete").length}/${state.expectedParts.length})`,
        );
        await delay(1500);
      }
      await part(file, tileQuery([a[1], a[0], b[1], b[0]], state.snapshot));
    }
    state.status = "complete";
    state.failures = [];
    await atomic(stateFile, state);
    return state;
  } catch (error) {
    state.status = "incomplete";
    state.failures = [error.message];
    await atomic(stateFile, state);
    throw error;
  }
}
