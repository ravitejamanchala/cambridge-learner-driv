import {boundsCheck,coordinate} from '../personal/geometry.js';
export const TILE_SIZE=1000,BUFFER=100;
// Match the simulator's existing projection: X east, Z south, metres.
export function tileSelection(center){
  coordinate(center);
  const [lon,lat]=center,kx=111320*Math.cos(lat*Math.PI/180),kz=110574;
  const box=half=>boundsCheck([lat-half/kz,lon-half/kx,lat+half/kz,lon+half/kx]);
  return {version:1,size:TILE_SIZE,buffer:BUFFER,center:[...center],origin:[lat,lon],kx,kz,bounds:box(TILE_SIZE/2),dataBounds:box(TILE_SIZE/2+BUFFER)};
}
