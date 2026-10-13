import { TRAFFIC } from './config.js';
// Validate the final lane position, not the midpoint of a potentially long edge.
export function safeTrafficSpawn(point, origin, first = false) {
  const dx=point.x-origin.x,dz=point.z-origin.z,distance=Math.hypot(dx,dz);
  if(distance<(first?40:TRAFFIC.spawnMin)||distance>TRAFFIC.spawnMax)return false;
  if(!first && Number.isFinite(origin.th)) {
    const forward=dx*-Math.sin(origin.th)+dz*-Math.cos(origin.th);
    const lateral=Math.abs(dx*-Math.cos(origin.th)-dz*-Math.sin(origin.th));
    if(forward>0 && lateral<forward*1.5)return false;
  }
  return true;
}
