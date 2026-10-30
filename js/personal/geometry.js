// Recipes stay in lon/lat. Bounded provider requests are combined into one
// X-east / Z-south world with a stable origin before the drive starts.
export const SECTION_METRES = 600, OVERLAP_METRES = 150;
export const MOCK_MIN_METRES=6*1609.344;
export const eligibleForMock=recipe=>measure(decode(recipe.geometry)).length>MOCK_MIN_METRES;
export function coordinate(p) {
  if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 85) throw Error('Choose a valid location on the map.');
  return p;
}
export function metres(a,b) {
  const rad=Math.PI/180, lat=(b[1]-a[1])*rad, lon=(b[0]-a[0])*rad;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(lat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(lon/2)**2)));
}
export function measure(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length<2 || coordinates.length>300000) throw Error('The routing service returned incomplete or oversized road geometry.');
  const cum=[0];coordinate(coordinates[0]);
  for(let i=1;i<coordinates.length;i++){coordinate(coordinates[i]);cum.push(cum.at(-1)+metres(coordinates[i-1],coordinates[i]));}
  if(cum.at(-1)<10)throw Error('Choose start and finish at least 10 metres apart.');
  return {coordinates,cum,length:cum.at(-1)};
}
export function at(route,s) {
  s=Math.max(0,Math.min(route.length,s));let lo=0,hi=route.cum.length-1;
  while(lo+1<hi){const m=(lo+hi)>>1;if(route.cum[m]<=s)lo=m;else hi=m;}
  const a=route.coordinates[lo],b=route.coordinates[hi],t=(s-route.cum[lo])/(route.cum[hi]-route.cum[lo]||1);
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
export function slice(route,start,end) {
  const points=[at(route,start)];
  for(let i=lowerBound(route.cum,start);i<route.cum.length&&route.cum[i]<end;i++)if(route.cum[i]>start)points.push(route.coordinates[i]);
  points.push(at(route,end));return points;
}
export function boundsCheck(b) {
  if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<-85||b[2]>85||b[1]<-180||b[3]>180||b[0]>=b[2]||b[1]>=b[3]||(b[2]-b[0])*111320>2000||(b[3]-b[1])*111320*Math.cos(b[0]*Math.PI/180)>2000)throw Error('This map section cannot be loaded safely. Choose another route.');
  return b;
}
export function section(route,index) {
  const count=Math.ceil(route.length/SECTION_METRES);
  if(!Number.isInteger(index)||index<0||index>=count)throw Error('Unknown route section.');
  const start=Math.max(0,index*SECTION_METRES-OVERLAP_METRES),end=Math.min(route.length,(index+1)*SECTION_METRES+OVERLAP_METRES),coordinates=slice(route,start,end);
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]),lat=(Math.min(...ys)+Math.max(...ys))/2,dy=180/110574,dx=180/(111320*Math.cos(lat*Math.PI/180));
  const bounds=boundsCheck([Math.min(...ys)-dy,Math.min(...xs)-dx,Math.max(...ys)+dy,Math.max(...xs)+dx]);
  return {index,count,start,end,coordinates,bounds,advance:Math.min(route.length,(index+1)*SECTION_METRES)};
}
export const project=(n,p)=>({x:(p[0]-n.origin[1])*n.kx,z:-(p[1]-n.origin[0])*n.kz});
export const unproject=(n,p)=>[n.origin[1]+p.x/n.kx,n.origin[0]-p.z/n.kz];
function lowerBound(cum,s){let a=0,b=cum.length;while(a<b){const m=(a+b)>>1;if(cum[m]<s)a=m+1;else b=m;}return a;}
// Search near the last measured progress, so a loop cannot jump to a later lap.
export function locate(route,p,previous=0) {
  const scale=111320*Math.cos(p[1]*Math.PI/180);let best={s:previous,d:Infinity};
  for(let i=Math.max(1,lowerBound(route.cum,previous-80));i<route.coordinates.length&&route.cum[i-1]<=previous+120;i++){
    if(route.cum[i]<previous-80||route.cum[i-1]>previous+120)continue;
    const a=route.coordinates[i-1],b=route.coordinates[i],x=(a[0]-p[0])*scale,z=(a[1]-p[1])*110574,dx=(b[0]-a[0])*scale,dz=(b[1]-a[1])*110574,t=Math.max(0,Math.min(1,-(x*dx+z*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(x+t*dx,z+t*dz);
    if(d<best.d)best={d,s:route.cum[i-1]+t*(route.cum[i]-route.cum[i-1])};
  }return best;
}
export function encode(points) {
  let out='',last=[0,0];for(const p of points)for(let i=0;i<2;i++){const v=Math.round(p[i]*1e6),d=v-last[i];last[i]=v;let n=d<0?~(d<<1):d<<1;while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>>=5;}out+=String.fromCharCode(n+63);}return out;
}
export function decode(text) {
  if(typeof text!=='string'||text.length>3000000)throw Error('Invalid saved route.');
  let i=0,last=[0,0],points=[];while(i<text.length){const p=[];for(let axis=0;axis<2;axis++){let n=0,shift=0,b;do{if(i>=text.length||shift>30)throw Error('Invalid saved route.');b=text.charCodeAt(i++)-63;if(b<0||b>63)throw Error('Invalid saved route.');n|=(b&31)<<shift;shift+=5;}while(b>=32);last[axis]+=(n&1)?~(n>>>1):n>>>1;p.push(last[axis]/1e6);}coordinate(p);points.push(p);if(points.length>300000)throw Error('Oversized saved route.');}return points;
}
