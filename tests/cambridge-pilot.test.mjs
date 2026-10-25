import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {inspectTrack} from '../js/editor-track.js';import {prepareEditorTrack} from '../js/editor-routing.js';import {buildNet,buildRoute} from '../js/net.js';
const load=d=>JSON.parse(fs.readFileSync(new URL('../examples/cambridge-pilot/brookmount-'+d+'.json',import.meta.url)));
test('both real Cambridge loop exports survive import without default map substitution or shortcutting',()=>{
 const tracks=['clockwise','anticlockwise'].map(load);
 for(const track of tracks){const meta=inspectTrack(track);assert.ok(Math.abs(meta.len-track.practiceLoop.distanceMetres)<1);assert.ok(meta.len>6000&&meta.len<6500);assert.equal(track.practiceMode,'experimental');assert.deepEqual(track.plan.waypoints[0],track.plan.waypoints.at(-1));assert.equal(track.sceneryMode,'procedural');assert.ok(track.network.edges.length>1000);assert.ok(track.network.names.includes('Kirkwood Road'));const prepared=prepareEditorTrack(track),net=buildNet(prepared.network),route=buildRoute(net,prepared.nodes);assert.ok(route.steps.every(s=>s.dir===1||!s.e.way.oneway),'never reverse a one-way edge');const restored=JSON.parse(JSON.stringify(track));assert.deepEqual(inspectTrack(restored),meta);}
 assert.notDeepEqual(tracks[0].plan,tracks[1].plan);assert.notDeepEqual(tracks[0].spawn,tracks[1].spawn);
});
