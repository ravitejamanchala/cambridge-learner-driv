import clipping from "../vendor/polygon-clipping.js";
import { signedArea } from "./geometry.js";
export { clipping };
export const area = (polygons) =>
  polygons.reduce(
    (sum, rings) =>
      sum +
      Math.abs(signedArea(rings[0])) -
      rings.slice(1).reduce((a, r) => a + Math.abs(signedArea(r)), 0),
    0,
  );
