// Reproducible, checksummed data bundle for preview deployments. Never runs in browser.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { validateIndex, canonical } from "../../js/world-data/schema.js";
import { hash } from "./acquire.mjs";
const MAX_FILE = 24 * 1024 * 1024,
  MAX_TOTAL = 300 * 1024 * 1024;
export async function packDataset(source, destination) {
  const index = validateIndex(
    JSON.parse(await fs.readFile(path.join(source, "index.json"), "utf8")),
  );
  const files = {};
  for (const name of ["index.json", ...Object.keys(index.files).sort()])
    files[name] = await fs.readFile(path.join(source, name), "utf8");
  verify(files);
  const archive = gzipSync(Buffer.from(JSON.stringify(files)), { level: 9 });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, archive);
  await fs.writeFile(
    destination + ".json",
    canonical({
      schemaVersion: 1,
      version: index.version,
      city: index.city,
      sha256: hash(archive),
      bytes: archive.length,
      license: "ODbL-1.0",
      attribution: index.attribution,
    }) + "\n",
  );
  return {
    version: index.version,
    bytes: archive.length,
    files: Object.keys(files).length,
  };
}
function verify(files) {
  const index = validateIndex(JSON.parse(files["index.json"]));
  const { version, ...unsigned } = index;
  if (hash(canonical(unsigned)) !== version)
    throw Error("Dataset version mismatch");
  const expected = new Set(["index.json", ...Object.keys(index.files)]);
  if (Object.keys(files).length !== expected.size)
    throw Error("Archive inventory mismatch");
  let total = 0;
  for (const [name, text] of Object.entries(files)) {
    if (!expected.has(name) || typeof text !== "string")
      throw Error("Unexpected archive file");
    const bytes = Buffer.byteLength(text);
    total += bytes;
    if (bytes > MAX_FILE || total > MAX_TOTAL)
      throw Error("Archive size exceeds deployment limit");
    const entry = index.files[name];
    if (entry && (entry.bytes !== bytes || entry.sha256 !== hash(text)))
      throw Error("Archive content checksum mismatch");
  }
  return index;
}
export async function installDataset(archivePath, out) {
  const [archive, receipt] = await Promise.all([
    fs.readFile(archivePath),
    fs.readFile(archivePath + ".json", "utf8").then(JSON.parse),
  ]);
  if (archive.length !== receipt.bytes || hash(archive) !== receipt.sha256)
    throw Error("Archive checksum mismatch");
  const files = JSON.parse(gunzipSync(archive, { maxOutputLength: MAX_TOTAL }));
  const index = verify(files);
  if (index.version !== receipt.version)
    throw Error("Archive receipt version mismatch");
  // Validate every entry before writing any files; paths are restricted by validateIndex.
  for (const [name, text] of Object.entries(files)) {
    const destination = path.join(out, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, text);
  }
  return index;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!process.argv[2] || !process.argv[3])
    throw Error(
      "Usage: node tools/world/archive.mjs dataset-directory archive.json.gz",
    );
  console.log(await packDataset(process.argv[2], process.argv[3]));
}
