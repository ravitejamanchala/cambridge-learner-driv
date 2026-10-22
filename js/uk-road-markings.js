// UK longitudinal marking presets (metres), based on Traffic Signs Manual
// Chapter 5 diagrams 1008/1008.1 (centre) and 1005/1005.1 (lane).
// These choose permitted standard dimensions; they do not determine whether
// a real location requires a warning line, double whites or another treatment.
export function longitudinalPattern(kind, mph) {
  const fast = mph > 40;
  if (kind === 'centre') return {diagram:fast?'1008.1':'1008',mark:fast?3:2,gap:fast?6:4,width:fast ? 0.15 : 0.1};
  if (kind === 'lane') return {diagram:fast?'1005.1':'1005',mark:2,gap:7,width:fast ? 0.15 : 0.1};
  throw Error('Unknown longitudinal marking kind');
}
export function paintIntervals(length,pattern,setback=9) {
  const result=[];
  // Keep complete marks out of the junction clearance. Never stretch the last
  // mark to fill the remaining road, or invent hazard markings at every junction.
  for(let s=setback;s+pattern.mark<=length-setback;s+=pattern.mark+pattern.gap)result.push([s,pattern.mark]);
  return result;
}
export function transverseMarkings(feature) {
  const left=feature.e.way.oneway?-feature.w/2+.3:.2,right=feature.w/2-.3;
  if(right<=left)return [];
  if(feature.signal || feature.stop)return [{from:left,to:right,width:feature.signal ? 0.2 : 0.4,back:0}];
  const bars=[];
  for(const back of [0,.5])for(let o=left;o+.6<=right;o+=.9)bars.push({from:o,to:o+.6,width:.2,back});
  return bars;
}
