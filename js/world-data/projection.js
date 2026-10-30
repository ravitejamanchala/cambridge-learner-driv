// Shared local tangent approximation. Geographic tuples are [longitude, latitude];
// legacy simulator origins are [latitude, longitude]. X east, Z south, Y up.
export function projection(origin, scales = {}) {
  if (
    !Array.isArray(origin) ||
    origin.length !== 2 ||
    !origin.every(Number.isFinite) ||
    Math.abs(origin[0]) > 85 ||
    Math.abs(origin[1]) > 180
  )
    throw Error("Invalid projection origin");
  const kx = scales.kx ?? 111320 * Math.cos((origin[0] * Math.PI) / 180),
    kz = scales.kz ?? 110574;
  if (!(kx > 0 && kz > 0 && Number.isFinite(kx + kz)))
    throw Error("Invalid projection scales");
  return {
    kind: "local-equirectangular",
    origin: [...origin],
    kx,
    kz,
    units: "metres",
    axes: "X east, Y up, Z south",
    geographicCRS: "EPSG:4326",
  };
}
export function project(p, lonLat) {
  if (
    !Array.isArray(lonLat) ||
    lonLat.length !== 2 ||
    !lonLat.every(Number.isFinite) ||
    Math.abs(lonLat[0]) > 180 ||
    Math.abs(lonLat[1]) > 85
  )
    throw Error("Invalid longitude/latitude");
  return {
    x: (lonLat[0] - p.origin[1]) * p.kx,
    z: -(lonLat[1] - p.origin[0]) * p.kz,
  };
}
export function unproject(p, point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
    throw Error("Invalid world coordinate");
  return [p.origin[1] + point.x / p.kx, p.origin[0] - point.z / p.kz];
}
export const tileKey = (x, z, size) => {
  if (!(size > 0) || !Number.isFinite(size + x + z))
    throw Error("Invalid tile coordinate");
  return `${Math.floor(x / size)}_${Math.floor(z / size)}`;
};
// Simulator forward is -Z at heading zero; clockwise compass bearing is positive.
export const compassToHeading = (degrees) => (-degrees * Math.PI) / 180;
export const headingToCompass = (radians) =>
  ((((-radians * 180) / Math.PI) % 360) + 360) % 360;
