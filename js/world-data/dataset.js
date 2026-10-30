import { validateIndex } from "./schema.js";
// Data-inspection reader, not the live driving stream coordinator.
export class Dataset {
  constructor(
    url,
    { fetcher = (...args) => globalThis.fetch(...args), maxEntries = 40 } = {},
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 128)
      throw Error("Invalid cache limit");
    this.url = new URL(url, globalThis.location?.href || "http://localhost/");
    this.fetcher = fetcher;
    this.maxEntries = maxEntries;
    this.cache = new Map();
    this.pending = new Map();
    this.requests = 0;
  }
  async open() {
    const response = await this.fetcher(this.url);
    if (!response.ok) throw Error(`Index HTTP ${response.status}`);
    const index = await response.json();
    validateIndex(index);
    this.index = index;
    return index;
  }
  async read(file) {
    if (!this.index) throw Error("Open the index first");
    if (
      !/^(tiles\/-?\d+_-?\d+|ledger\/\d+|navigation|ledger|validation|review-grid)\.json$/.test(
        file,
      ) ||
      !this.index.files[file]
    )
      throw Error("File not in city manifest");
    if (this.cache.has(file)) {
      const data = this.cache.get(file);
      this.cache.delete(file);
      this.cache.set(file, data);
      return data;
    }
    if (this.pending.has(file)) return this.pending.get(file);
    const promise = (async () => {
      this.requests++;
      const response = await this.fetcher(new URL(file, this.url));
      if (!response.ok) throw Error(`${file}: HTTP ${response.status}`);
      const expected = this.index.files[file];
      if (expected.bytes > 150000000) throw Error("Oversized dataset file");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== expected.bytes)
        throw Error(`Size mismatch: ${file}`);
      const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer),
        hex = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      if (hex !== expected.sha256) throw Error(`Checksum mismatch: ${file}`);
      const data = JSON.parse(new TextDecoder().decode(buffer));
      this.cache.set(file, data);
      while (this.cache.size > this.maxEntries)
        this.cache.delete(this.cache.keys().next().value);
      return data;
    })();
    this.pending.set(file, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(file);
    }
  }
  async tile(id) {
    const info = this.index.tiles.find((t) => t.id === id);
    if (!info) throw Error("Tile is outside the declared inventory");
    const tile = await this.read(info.path);
    if (
      tile.id !== id ||
      !Array.isArray(tile.references) ||
      !Array.isArray(tile.features)
    )
      throw Error("Invalid tile payload");
    const features = new Map(tile.features.map((f) => [f.id, f]));
    const featureIds = new Set(tile.featureIds);
    for (const owner of [...new Set(tile.references.map((r) => r.owner))]) {
      const shard =
        owner === id ? tile : await this.read(`tiles/${owner}.json`);
      for (const f of shard.features)
        if (featureIds.has(f.id)) features.set(f.id, f);
    }
    if (tile.featureIds.some((id) => !features.has(id)))
      throw Error("Missing owned feature");
    return { ...tile, features: [...features.values()] };
  }
}
