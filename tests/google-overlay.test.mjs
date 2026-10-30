import test from 'node:test';import assert from 'node:assert/strict';
import {overlayGeometry} from '../js/map-review/geometry.js';
import {buildNet} from '../js/net.js';
import {applyMappedRoadTags} from '../js/mapped-road-tags.js';
import {generateRoute} from '../js/personal/section.js';
import {roadFixture} from './personal-route-fixture.mjs';
import {measure,section} from '../js/personal/geometry.js';
test('Google overlay uses actual native road surfaces and reversible geographic coordinates',()=>{
 const f=roadFixture([.12,52.2],[.121,52.204]),track=generateRoute(f.osm,section(measure(f.coordinates),0));
 const net=buildNet(track.renderNetwork);applyMappedRoadTags(net,track.osm.ways);
 const before=JSON.stringify(track),data=overlayGeometry(track,net);
 assert.ok(data.features.some(f=>f.layer==='roads'));assert.ok(data.features.some(f=>f.layer==='buildings'));
 const line=data.features.find(f=>f.id==='edge:0');
 assert.ok(Math.abs((line.paths[0][0].lng-net.origin[1])*net.kx-net.edges[0].px[0])<1e-7);
 assert.ok(Math.abs((net.origin[0]-line.paths[0][0].lat)*net.kz-net.edges[0].pz[0])<1e-7);
 assert.equal(JSON.stringify(track),before,'overlay must not modify generated geometry');
 assert.ok(data.features.every(f=>f.paths.flat().every(p=>Number.isFinite(p.lat+p.lng))));
 assert.ok(!data.features.some(f=>f.id.startsWith('dash:')),'unknown paint must not appear as verified markings');
});
import {visionOverlay} from '../js/map-review/vision-proposals.js';
test('vision imports remain proposals and reject non-geographic or claimed verified results',()=>{
 const doc={type:'FeatureCollection',schemaVersion:1,accepted:false,source:{allowsDerivedData:true},georeference:{crs:'EPSG:4326'},features:[{geometry:{type:'Polygon',coordinates:[[[.1,52],[.101,52],[.101,52.001],[.1,52]]]},properties:{kind:'yellow_box',status:'proposal',verified:false,scoreCalibrated:false,score:.7}}]};
 const rows=visionOverlay(doc);assert.equal(rows[0].layer,'proposals');assert.match(rows[0].detail,/not applied/);doc.features[0].properties.verified=true;assert.throws(()=>visionOverlay(doc),/verified/);
});
