import {clipping,area} from "../../js/world-data/polygons.js";
export {area};
import { bounds } from "../../js/world-data/geometry.js";
export const rectangle = ([x, z, X, Z]) => [
  [
    [
      [x, z],
      [X, z],
      [X, Z],
      [x, Z],
      [x, z],
    ],
  ],
];
export function bufferBoundary(polygons, metres) {
  if (!Number.isFinite(metres) || metres < 0 || metres > 5000)
    throw Error("Invalid boundary buffer");
  if (!metres) return polygons;
  // Circumscribed 64-gon: conservative <=1.21 m excess at a 1 km buffer.
  const steps = 64,
    radius = metres / Math.cos(Math.PI / steps);
  let result = polygons;
  for (const rings of polygons)
    for (const ring of rings)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!len) continue;
        const dx = (-(b[1] - a[1]) / len) * metres,
          dz = ((b[0] - a[0]) / len) * metres;
        const strip = [
          [
            [
              [a[0] + dx, a[1] + dz],
              [b[0] + dx, b[1] + dz],
              [b[0] - dx, b[1] - dz],
              [a[0] - dx, a[1] - dz],
              [a[0] + dx, a[1] + dz],
            ],
          ],
        ];
        const circle = Array.from({ length: steps }, (_, j) => [
          a[0] + radius * Math.cos((j / steps) * 2 * Math.PI),
          a[1] + radius * Math.sin((j / steps) * 2 * Math.PI),
        ]);
        circle.push(circle[0]);
        result = clipping.union(result, strip, [[circle]]);
      }
  return result;
}
export function inventory(polygons, size) {
  if (!Number.isFinite(size) || size < 100 || size > 5000)
    throw Error("Invalid tile size");
  const [x, z, X, Z] = bounds(polygons.flat(2)),
    tiles = [];
  if (Math.ceil((X - x) / size + 2) * Math.ceil((Z - z) / size + 2) > 10000)
    throw Error("Coverage exceeds bounded city job");
  for (let tz = Math.floor(z / size); tz <= Math.floor(Z / size); tz++)
    for (let tx = Math.floor(x / size); tx <= Math.floor(X / size); tx++) {
      const b = [tx * size, tz * size, (tx + 1) * size, (tz + 1) * size];
      if (area(clipping.intersection(polygons, rectangle(b))) > 1e-6)
        tiles.push({ id: `${tx}_${tz}`, bounds: b });
    }
  return tiles;
}
export function overlapBounds(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
export { clipping };
