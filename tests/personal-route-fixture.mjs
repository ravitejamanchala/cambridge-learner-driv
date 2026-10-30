import {metres} from '../js/personal/geometry.js';
export function roadFixture(start,end){
 const count=Math.max(4,Math.ceil(metres(start,end)/24)),coordinates=[];
 for(let i=0;i<=count;i++){const t=i/count;coordinates.push([start[0]+(end[0]-start[0])*t+.0003*Math.sin(t*Math.PI),start[1]+(end[1]-start[1])*t]);}
 const elements=[],road=[];let id=1;
 const node=(lon,lat,tags)=>{const n={type:'node',id:id++,lon,lat,...(tags?{tags}:{})};elements.push(n);return n.id;};
 for(const [lon,lat]of coordinates)road.push(node(lon,lat));
 elements.push({type:'way',id:id++,nodes:road,tags:{highway:'residential',name:'Fixture practice road',lanes:'2',width:'6.4',maxspeed:'20 mph',sidewalk:'both'}});
 for(let i=2;i<coordinates.length-2;i+=3){const p=coordinates[i],prev=coordinates[i-1],next=coordinates[i+1],kx=111320*Math.cos(p[1]*Math.PI/180),dx=(next[0]-prev[0])*kx,dz=(next[1]-prev[1])*110574,len=Math.hypot(dx,dz);for(const side of [-1,1]){
 const lon=p[0]-dz/len*side*20/kx,lat=p[1]+dx/len*side*20/110574;
 const ring=[[-4,-5],[4,-5],[4,5],[-4,5]].map(([x,z])=>node(lon+x/kx,lat+z/110574));ring.push(ring[0]);elements.push({type:'way',id:id++,nodes:ring,tags:{building:'house','building:levels':'2'}});
 }}
 return {coordinates,osm:{version:.6,elements},waypoints:[{location:start,distance:0},{location:end,distance:0}]};
}
