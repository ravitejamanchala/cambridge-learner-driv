import {filterSignalApproaches} from './signals.js';
import {joinMappedPaths} from '../path-joins.js';
import {buildNet} from '../net.js';
import {applyMappedRoadTags} from '../mapped-road-tags.js';
import {fitRoadCorners} from '../roadside-clearance.js';
import {correctApproaches} from '../junction-approaches.js';

// Shared by the tile inspector and personal drives, before navigation adds nodes.
export function refineTrack(track,data){
 const filtered=filterSignalApproaches(track,data);
 track.network=filtered.network;track.osm.signalSources=filtered.sources;track.osm.omittedSignalApproaches=filtered.omitted;
 track.objects=joinMappedPaths(track.objects);
 let net=buildNet(track.network,{tidyLines:false});applyMappedRoadTags(net,track.osm.ways);fitRoadCorners(net,track.objects);
 track.network=correctApproaches(track.network,net).network;
 net=buildNet(track.network,{tidyLines:false});applyMappedRoadTags(net,track.osm.ways);fitRoadCorners(net,track.objects);
 return net;
}
