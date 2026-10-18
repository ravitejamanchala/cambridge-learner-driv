// WGS84 <-> the sim's local metric plane.
// Mirrors tools/build_net.py: x is east, z is south, origin at the data centre.
// kx/kz are metres per degree at that latitude, stored in every area file.
export function projector({ origin: [lon0, lat0], kx, kz }) {
  return {
    toLocal: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * kz],
    toWgs: (x, z) => [x / kx + lon0, -z / kz + lat0],
  };
}
