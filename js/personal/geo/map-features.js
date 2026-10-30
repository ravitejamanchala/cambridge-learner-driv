import polygonClipping from '../../vendor/polygon-clipping.js';
// Shared native-object adapter. All geometry entering this module is in the
// track's metre coordinates (X east, Z south), never source tile coordinates.
export const AREA_KINDS=new Set(['grass','forest','park','sports','water','parking','plaza','industrial','gravel','cemetery','railway','sand','garden']);
export const PATH_KINDS=new Set(['footway','cycleway','path','pedestrian','steps','bridleway']);
const POINT_SIZES={tree:[4,7,4],lamp:[.25,6,.25],bench:[1.8,.9,.65],bin:[.6,1,.6],bollard:[.2,.9,.2],gate:[2,1.2,.2],postBox:[.5,1.3,.5],bicycleParking:[1.5,.8,.6],busStop:[.18,2.5,.18],sign:[.6,2.2,.15]};
export function sceneFeatures(track,features,{source='OpenStreetMap',attribution=track.attribution,limits={}}={}){
  const b=track.georeference.bounds,n=track.network;
  const box=[(b[1]-n.origin[1])*n.kx,-(b[2]-n.origin[0])*n.kz,(b[3]-n.origin[1])*n.kx,-(b[0]-n.origin[0])*n.kz];
  const boundary=[[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]],[box[0],box[1]]]];
  const output=[],ids=new Set(track.objects.map(o=>o.id)),counts={},excluded=[];
  const push=(f,o,part)=>{
    o.id=`map:${f.id}:${part}`;if(ids.has(o.id))return;ids.add(o.id);
    o.name=f.name||f.kind;o.properties={...o.properties,mapFeature:f.kind,source,sourceId:f.id,tags:f.tags||{},estimatedDimensions:true,heightSource:f.measured?'OSM height tag':'estimate or processed reference',collision:o.type==='scenery',reviewRequired:true};
    if(Math.max(o.sx,o.sy,o.sz)>(limits.extent||2000))throw Error('Mapped feature exceeds the simulator object limit.');
    output.push(o);counts[f.kind]=(counts[f.kind]||0)+1;
    if(output.length+track.objects.length>(limits.objects||10000))throw Error('Detailed world exceeds browser object capacity.');
  };
  const object=(type,x,z,sx,sy,sz,y=0,rotation=0)=>({type,x,z,sx,sy,sz,y,rotation,properties:{}});
  for(const f of features){
    if(!f||typeof f.id!=='string'||!/^[\w:./-]{1,180}$/.test(f.id))throw Error('Invalid mapped feature ID');
    const valid=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=(limits.coordinate||100000));
    if(f.rings){
      if(!AREA_KINDS.has(f.kind))continue;
      if(!Array.isArray(f.rings)||f.rings.length>100||f.rings.some(r=>!Array.isArray(r)||r.length<3||r.length>5000||!r.every(valid)))throw Error('Invalid mapped area');
      const rings=f.rings.map(r=>[...r,...(r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?[]:[r[0]])]);
      for(const [part,poly]of polygonClipping.intersection([rings],boundary).entries()){
        const xs=poly[0].map(p=>p[0]),zs=poly[0].map(p=>p[1]),sx=Math.max(...xs)-Math.min(...xs),sz=Math.max(...zs)-Math.min(...zs);
        if(sx<.1||sz<.1)continue;
        const o=object('marking',(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2,sx,.008,sz,.004);
        o.properties={footprint:poly[0].slice(0,-1).map(([x,z])=>({x,z})),holes:poly.slice(1).map(r=>r.slice(0,-1).map(([x,z])=>({x,z})))};
        push(f,o,part);
      }
    }else if(f.line){
      if(!PATH_KINDS.has(f.kind)&&!['wall','fence','hedge','rail'].includes(f.kind))continue;
      if(!Array.isArray(f.line)||f.line.length>5000||!f.line.every(valid))throw Error('Invalid mapped line');
      const path=PATH_KINDS.has(f.kind),width=Math.min(20,Math.max(.1,Number(f.width)||(path?2:f.kind==='hedge'?.7:.15)));
      for(let i=1;i<f.line.length;i++){
        // Clip the centreline to the same selection; keep non-drivable paths out of road routing.
        const a=f.line[i-1],b=f.line[i],dx=b[0]-a[0],dz=b[1]-a[1];let lo=0,hi=1;
        for(const [p,q]of [[-dx,a[0]-box[0]],[dx,box[2]-a[0]],[-dz,a[1]-box[1]],[dz,box[3]-a[1]]]){if(!p){if(q<0)hi=-1;}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}
        if(lo>=hi)continue;
        const length=Math.hypot(dx,dz)*(hi-lo);if(length<.1)continue;
        const height=path?.008:Math.min(5,Math.max(.2,Number(f.height)||1.2));
        push(f,object(path?'marking':'scenery',a[0]+dx*(lo+hi)/2,a[1]+dz*(lo+hi)/2,width,height,length,path?.018:0,Math.atan2(dx,dz)),i);
      }
    }else if(f.point&&POINT_SIZES[f.kind]){
      if(!valid(f.point))throw Error('Invalid mapped point');
      const [x,z]=f.point;if(x<box[0]||x>box[2]||z<box[1]||z>box[3])continue;
      const dims=[...POINT_SIZES[f.kind]];if(Number.isFinite(f.height)&&f.height>0)dims[1]=Math.min(50,f.height);
      const o=object('scenery',x,z,...dims);if(Number.isFinite(f.heading))o.rotation=f.heading;
      push(f,o,0);
    }
  }
  // Positions are preserved. Suspect overlaps are reported, never silently relocated.
  const all=[...track.objects,...output],totals={};for(const o of all)if(o.properties.mapFeature)totals[o.properties.mapFeature]=(totals[o.properties.mapFeature]||0)+1;
  return {...track,objects:all,mapFeatures:{version:1,source,attribution,counts:totals,excluded,reviewRequired:true}};
}
