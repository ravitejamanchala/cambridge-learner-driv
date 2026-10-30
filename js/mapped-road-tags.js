// Preserve source facts in the render graph without changing the native JSON
// schema. Missing tags retain the existing fallback; 'separate' uses mapped paths.
export function applyMappedRoadTags(net,sources=[]){
 for(let i=0;i<net.ways.length;i++){
  const way=net.ways[i],tags=sources[i]?.tags||{};
  way.laneMarkings=tags.lane_markings!=='no';
  const sideWidth=side=>{
   const both=tags['sidewalk:both'],specific=tags['sidewalk:'+side];
   const value=specific??both??(tags.sidewalk==='both'?'yes':tags.sidewalk==='left'||tags.sidewalk==='right'?(tags.sidewalk===side?'yes':'no'):tags.sidewalk);
   if(['no','none','separate'].includes(value))return 0;
   const raw=tags['sidewalk:'+side+':width']??tags['sidewalk:both:width']??tags['sidewalk:width'];
   const width=typeof raw==='string'&&/^\s*\d+(\.\d+)?\s*(m)?\s*$/.test(raw)?parseFloat(raw):NaN;
   return Number.isFinite(width)?Math.max(.3,Math.min(10,width)):2;
  };
  way.sidewalkWidths=['motorway','motorway_link'].includes(way.cls)?[0,0]:[sideWidth('left'),sideWidth('right')];
  if(tags.oneway==='-1')way.sidewalkWidths.reverse();
 }
}
