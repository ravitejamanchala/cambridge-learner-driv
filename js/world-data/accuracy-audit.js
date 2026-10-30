import {metric} from './normalize.js';
export async function auditCity(reader,onProgress=()=>{}){
 const index=reader.index||await reader.open(),features=new Map(),tiles=[];
 for(const [i,t]of index.tiles.entries()){
  const tile=await reader.tile(t.id);for(const f of tile.features)features.set(f.id,f);
  tiles.push({id:t.id,status:tile.status,features:tile.features.length});onProgress(i+1,index.tiles.length);
 }
 const roads=[...features.values()].filter(f=>f.kind==='road'),stats={roads:roads.length,taggedWidths:0,estimatedOrUnknownWidths:0,independentlyVerifiedWidths:0,taggedLaneCounts:0,paintPresent:0,paintAbsent:0,paintUnknown:0,parkingTagged:0,parkingWidthTagged:0},issues=[];
 for(const f of roads){const t=f.tags||{},width=metric(t.width);if(width!==null)stats.taggedWidths++;else{stats.estimatedOrUnknownWidths++;issues.push({id:f.id,kind:'width',reason:'No usable width measurement tag; default width is an estimate'});}if(t.lanes)stats.taggedLaneCounts++;stats[t.lane_markings==='yes'?'paintPresent':t.lane_markings==='no'?'paintAbsent':'paintUnknown']++;
  if(Object.keys(t).some(k=>k.startsWith('parking:'))){stats.parkingTagged++;if(Object.entries(t).some(([k,v])=>/^parking:.*:width$/.test(k)&&metric(v)!==null))stats.parkingWidthTagged++;else issues.push({id:f.id,kind:'parking',reason:'Parking tags do not establish bay geometry or width'});}
 }
 const rawPaint=[...features.values()].filter(f=>f.tags?.road_marking),parkingSpaces=[...features.values()].filter(f=>f.tags?.amenity==='parking_space');
 return {version:1,datasetVersion:index.version,generatedAt:new Date().toISOString(),coverage:{expectedTiles:index.tiles.length,checkedTiles:tiles.length,uniqueFeatures:features.size,tiles},stats,mappedDetails:{roadMarkingFeatures:rawPaint.length,parkingSpaceFeatures:parkingSpaces.length},accepted:false,independentImageryComparison:'not performed',missingEvidence:['Independent, dated road-edge measurements','Lane-paint, yellow-box and KEEP CLEAR coverage','Individual parking-bay geometry','Imagery registration and acquisition dates'],issues};
}
