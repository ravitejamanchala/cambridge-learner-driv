export function validateIndex(index) {
  const box = (b) =>
    Array.isArray(b) &&
    b.length === 4 &&
    b.every(Number.isFinite) &&
    b[0] <= b[2] &&
    b[1] <= b[3];
  if (
    index?.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(index.version) ||
    typeof index.city !== "string" ||
    typeof index.accepted !== "boolean"
  )
    throw Error("Unsupported city index");
  const p = index.projection;
  if (
    p?.kind !== "local-equirectangular" ||
    p.units !== "metres" ||
    !Array.isArray(p.origin) ||
    p.origin.length !== 2 ||
    !p.origin.every(Number.isFinite) ||
    Math.abs(p.origin[0]) > 85 ||
    Math.abs(p.origin[1]) > 180 ||
    !(p.kx > 0 && p.kz > 0 && Number.isFinite(p.kx + p.kz))
  )
    throw Error("Invalid city projection");
  if (
    !(index.tileSize >= 100 && index.tileSize <= 5000) ||
    !Array.isArray(index.tiles) ||
    !index.tiles.length ||
    index.tiles.length > 10000 ||
    !index.files
  )
    throw Error("Invalid tile inventory");
  const ids = new Set();
  for (const t of index.tiles) {
    if (
      !/^-?\d+_-?\d+$/.test(t.id) ||
      ids.has(t.id) ||
      !box(t.bounds) ||
      t.path !== "tiles/" + t.id + ".json" ||
      !["empty", "populated", "missing", "failed"].includes(t.status)
    )
      throw Error("Invalid or duplicate tile");
    ids.add(t.id);
    const [x, z] = t.id.split("_").map(Number),
      s = index.tileSize;
    if (
      t.bounds.some((v, i) => v !== [x * s, z * s, (x + 1) * s, (z + 1) * s][i])
    )
      throw Error("Tile bounds disagree with identity");
    if (["empty", "populated"].includes(t.status) && !index.files[t.path])
      throw Error("Tile is missing from file inventory");
  }
  for (const [name, file] of Object.entries(index.files))
    if (
      !/^(tiles\/-?\d+_-?\d+|navigation|ledger|validation|review-grid)\.json$/.test(
        name,
      ) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      file.bytes > 150000000
    )
      throw Error("Invalid file manifest");
  return index;
}

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
