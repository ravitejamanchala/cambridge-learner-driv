export const same = (a, b) => a[0] === b[0] && a[1] === b[1];
export function bounds(points) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of points) {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], z);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], z);
  }
  return b;
}
export function signedArea(ring) {
  let a = 0;
  for (let i = 1; i < ring.length; i++)
    a += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return a / 2;
}
export function inside(point, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segmentsIntersect(a, b, c, d) {
  const eps = 1e-8,
    on = (p, q, r) =>
      Math.abs(cross(p, q, r)) < eps &&
      r[0] >= Math.min(p[0], q[0]) - eps &&
      r[0] <= Math.max(p[0], q[0]) + eps &&
      r[1] >= Math.min(p[1], q[1]) - eps &&
      r[1] <= Math.max(p[1], q[1]) + eps;
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}
export function ringErrors(ring) {
  if (
    !Array.isArray(ring) ||
    ring.length < 4 ||
    ring.some((p) => p.length !== 2 || !p.every(Number.isFinite)) ||
    !same(ring[0], ring.at(-1))
  )
    return ["unclosed or invalid ring"];
  const errors = [];
  if (Math.abs(signedArea(ring)) < 0.01) errors.push("zero area");
  for (let i = 0; i < ring.length - 1; i++) {
    if (same(ring[i], ring[i + 1])) errors.push("duplicate adjacent vertex");
    for (let j = i + 2; j < ring.length - 1; j++)
      if (
        !(i === 0 && j === ring.length - 2) &&
        segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])
      )
        errors.push("self intersection");
  }
  return [...new Set(errors)];
}
export function polygonErrors(polygons, { allowPointTouches = false } = {}) {
  const errors = [];
  for (const rings of polygons) {
    rings.forEach((r) => errors.push(...ringErrors(r)));
    for (let i = 1; i < rings.length; i++) {
      if (
        !(allowPointTouches
          ? rings[i].some((point) => inside(point, rings[0]))
          : inside(rings[i][0], rings[0]))
      )
        errors.push("hole outside exterior");
      for (let j = 0; j < i; j++) {
        if (
          j > 0 &&
          (inside(rings[i][0], rings[j]) || inside(rings[j][0], rings[i]))
        )
          errors.push("overlapping holes");
        for (let a = 1; a < rings[i].length; a++)
          for (let b = 1; b < rings[j].length; b++)
            if (
              segmentsIntersect(
                rings[i][a - 1],
                rings[i][a],
                rings[j][b - 1],
                rings[j][b],
              ) &&
              (!allowPointTouches ||
                crossesOrOverlaps(
                  rings[i][a - 1],
                  rings[i][a],
                  rings[j][b - 1],
                  rings[j][b],
                ))
            )
              errors.push("intersecting rings");
      }
    }
  }
  return [...new Set(errors)];
}
export function joinWays(parts) {
  const pending = parts.map((p) => p.slice()),
    rings = [];
  while (pending.length) {
    const ring = pending.shift();
    while (ring[0] !== ring.at(-1)) {
      const candidates = pending
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p[0] === ring.at(-1) || p.at(-1) === ring.at(-1));
      if (candidates.length !== 1)
        throw Error(
          candidates.length
            ? "Ambiguous relation ring"
            : "Unclosed relation ring",
        );
      const { p, i } = candidates[0];
      pending.splice(i, 1);
      if (p[0] !== ring.at(-1)) p.reverse();
      ring.push(...p.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
export function orient(ring, positive) {
  return signedArea(ring) > 0 === positive ? ring : ring.slice().reverse();
}

// OGC polygons may have isolated point contacts between rings. Crossing interiors
// or a shared segment still invalidates an assembled area.
function crossesOrOverlaps(a, b, c, d) {
  const values = [
    cross(a, b, c),
    cross(a, b, d),
    cross(c, d, a),
    cross(c, d, b),
  ];
  if (values[0] * values[1] < 0 && values[2] * values[3] < 0) return true;
  if (values.every((v) => Math.abs(v) < 1e-8)) {
    const axis = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0 : 1;
    return (
      Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) >
      1e-8
    );
  }
  return false;
}
