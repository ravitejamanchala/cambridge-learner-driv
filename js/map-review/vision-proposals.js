const kinds=new Set(['road_surface','lane_marking','yellow_box','keep_clear','parking_bay','arrow']);
export function visionOverlay(doc){
 if(doc?.type!=='FeatureCollection'||doc.schemaVersion!==1||doc.accepted!==false||doc.georeference?.crs!=='EPSG:4326'||doc.source?.allowsDerivedData!==true||!Array.isArray(doc.features)||doc.features.length>10000)throw Error('Invalid vision proposal document. Use a licensed-image proposal export.');
 return doc.features.map((f,i)=>{
  const p=f.properties,g=f.geometry;if(!kinds.has(p?.kind)||p.status!=='proposal'||p.verified!==false||p.scoreCalibrated!==false||!Number.isFinite(p.score)||p.score<0||p.score>1||g?.type!=='Polygon'||!Array.isArray(g.coordinates)||!g.coordinates.length||g.coordinates.length>100)throw Error('Invalid or purportedly verified vision feature');
  const paths=g.coordinates.map(r=>{if(!Array.isArray(r)||r.length<4||r.length>5000||r.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||Math.abs(v[0])>180||Math.abs(v[1])>85))throw Error('Invalid proposal polygon');return r.map(([lng,lat])=>({lat,lng}));});
  const all=paths.flat();return {layer:'proposals',id:'vision:'+i,polygon:true,paths,bounds:{west:Math.min(...all.map(p=>p.lng)),east:Math.max(...all.map(p=>p.lng)),south:Math.min(...all.map(p=>p.lat)),north:Math.max(...all.map(p=>p.lat))},detail:JSON.stringify({kind:p.kind,status:'UNVERIFIED PROPOSAL — not applied to the simulator',uncalibratedScore:p.score,source:doc.source,model:doc.model,registrationVerified:false},null,2)};
 });
}
