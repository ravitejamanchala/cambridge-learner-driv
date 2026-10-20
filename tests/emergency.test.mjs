import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmergencyEvent, EMERGENCY } from '../js/emergency.js';

// A straight 400 m road heading east, with the learner's route along it.
function harness({ roadWidth = 7.3, zebras = [], fillets = [], side = 'behind', oneway = false } = {}) {
  const edge = { id: 1, len: 400, way: { w: roadWidth, oneway, name: 'Test Road', mph: 30 } };
  const route = { len: 400, steps: [{ e: edge, dir: 1 }], stepS: [0], instructions: [] };
  const car = { x: 0, z: 0, th: -Math.PI / 2, v: 0, alive: true, pinned: 0, mesh: { add() {}, remove() {} } };
  const placed = [];
  const traffic = { clock: 0, cars: [car], placeCar(c, e, dir, s, speed, cruise, path) { placed.push({ e, dir, s, speed, cruise, path }); Object.assign(c, { x: s, z: 0, v: speed }); } };
  const faults = [];
  const player = { x: 0, z: 0, th: -Math.PI / 2, v: 0 };
  const test = { route, sRoute: 0, ctx: { lat: 0, tx: 1, tz: 0, way: edge.way }, fault(kind, cat, text, key) { faults.push({ kind, cat, text, key }); } };
  const banners = [];
  const net = { zebras, fillets };
  const event = createEmergencyEvent({ net, traffic, test, player, ui: { banner: t => banners.push(t) }, side });
  const step = (dt = 0.5) => { traffic.clock += dt; event.update(dt, traffic.clock); };
  return { event, step, faults, banners, placed, car, player, test, traffic };
}
// forward offset of the car relative to a learner heading east
const place = (h, forward, lateral = 0) => { h.car.x = h.player.x + forward; h.car.z = h.player.z + lateral; };

test('the blue-light vehicle only appears once the learner is driving along the route',()=>{
 const h=harness();
 h.step(); assert.equal(h.event.phase,'idle'); assert.equal(h.placed.length,0);
 h.test.sRoute=EMERGENCY.trigger+5; h.player.v=1; h.step();
 assert.equal(h.event.phase,'idle','not while crawling');
 h.player.v=12; h.step();
 assert.equal(h.event.phase,'coming'); assert.equal(h.placed.length,1);
 assert.ok(h.placed[0].cruise>1,'it travels above the limit');
 assert.match(h.banners.at(-1),/Blue lights behind you/);
});
test('slowing down and letting it past is a pass with no faults',()=>{
 const h=harness(); h.test.sRoute=100; h.player.v=12; h.step();
 h.player.v=1; for(let i=0;i<8;i++){place(h,-30);h.step();}
 place(h,20); h.step();
 assert.equal(h.event.phase,'passing');
 assert.deepEqual(h.faults,[]);
 assert.equal(h.event.result().ok,true);
 assert.match(h.event.result().why,/let the emergency vehicle past/);
});
test('pulling in towards the kerb counts even without slowing to a crawl',()=>{
 const h=harness(); h.test.sRoute=100; h.player.v=12; h.step();
 h.test.ctx.lat=7.3/2-0.5; // hard over to the nearside
 for(let i=0;i<4;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.deepEqual(h.faults,[]); assert.equal(h.event.result().ok,true);
});
test('driving on and making no room is a driving fault, marked once',()=>{
 const h=harness(); h.test.sRoute=100; h.player.v=12; h.step();
 for(let i=0;i<8;i++){place(h,-25);h.step();}
 place(h,20); h.step(); h.step();
 assert.equal(h.faults.length,1);
 assert.equal(h.faults[0].kind,'D'); assert.equal(h.faults[0].cat,'Emergency vehicle');
 assert.equal(h.event.result().ok,false);
});
test('holding it up for too long is marked before it ever gets past',()=>{
 const h=harness(); h.test.sRoute=100; h.player.v=12; h.step();
 for(let i=0;i<Math.ceil(EMERGENCY.follow/0.5)+4;i++){place(h,-20);h.step();}
 assert.equal(h.faults.length,1); assert.equal(h.faults[0].cat,'Emergency vehicle');
 assert.equal(h.event.result().ok,false);
 assert.match(h.event.result().why,/did not let the emergency vehicle behind you through/i);
});
test('stopping on a crossing to let it past is marked separately',()=>{
 const h=harness({zebras:[{x:0,z:0,w:7.3}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 h.player.v=0; // stopped dead, with the crossing underneath
 for(let i=0;i<4;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 const cats=h.faults.map(f=>f.cat);
 assert.ok(cats.includes('Emergency vehicle – position'),JSON.stringify(h.faults));
 assert.ok(!cats.includes('Emergency vehicle'),'stopping still counts as making room');
 assert.equal(h.event.result().ok,false);
 assert.match(h.event.result().why,/crossing or in a junction/);
});
test('stopping clear of a junction is not marked',()=>{
 const h=harness({fillets:[{C:[500,500],R:8,w:4}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 h.player.v=0;
 for(let i=0;i<4;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.deepEqual(h.faults,[]); assert.equal(h.event.result().ok,true);
});
test('an event that never triggers reports that, rather than passing by default',()=>{
 const h=harness(); h.step(); assert.equal(h.event.result().ok,false);
 assert.match(h.event.result().why,/never reached you/);
});

test('it can also come the other way, and is assessed the same',()=>{
 const h=harness({side:'oncoming'});
 h.test.sRoute=100; h.player.v=12; h.step();
 assert.equal(h.event.phase,'coming'); assert.equal(h.event.side,'oncoming');
 assert.match(h.banners.at(-1),/coming towards you/);
 // it closes from ahead while the learner slows right down, then goes by
 h.player.v=1; for(let i=0;i<6;i++){place(h,40-i*5);h.step();}
 place(h,-20); h.step();
 assert.equal(h.event.phase,'passing');
 assert.deepEqual(h.faults,[]); assert.equal(h.event.result().ok,true);
});
test('driving on past an oncoming blue light is marked too',()=>{
 const h=harness({side:'oncoming'});
 h.test.sRoute=100; h.player.v=12; h.step();
 for(let i=0;i<6;i++){place(h,40-i*5);h.step();}
 place(h,-20); h.step();
 assert.equal(h.faults.length,1); assert.equal(h.faults[0].cat,'Emergency vehicle');
});
test('with no two-way road ahead it comes up behind instead',()=>{
 const h=harness({side:null,oneway:true});
 h.test.sRoute=100; h.player.v=12; h.step();
 assert.equal(h.event.side,'behind');
});

test('it does not follow for ever: it gives up and the drive carries on',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 for(let i=0;i<Math.ceil(EMERGENCY.giveUp/0.5)+6;i++){place(h,-20);h.step();}
 assert.equal(h.event.phase,'done');
 assert.ok(h.event.events.some(e=>e.type==='emergency-gave-up'));
 assert.equal(h.car.alive,false,'it is off the road, not sitting behind the learner');
 assert.equal(h.event.result().ok,false);
});

test('an oncoming vehicle is given the route back to the learner, not left to pick its own turns',()=>{
 const h=harness({side:'oncoming'});
 h.test.sRoute=100; h.player.v=12; h.step();
 const placed=h.placed[0];
 assert.ok(Array.isArray(placed.path)&&placed.path.length,'it follows a path');
 assert.equal(placed.dir,-1,'facing back down the learner\'s route');
 assert.equal(placed.path[0].dir,-1);
});
test('a vehicle that never reaches the learner is not held against them',()=>{
 const h=harness({side:'oncoming'});
 h.test.sRoute=100; h.player.v=12; h.step();
 // it exists, but stays far away for the whole drive
 for(let i=0;i<Math.ceil(EMERGENCY.abandon/0.5)+6;i++){place(h,400);h.step();}
 assert.equal(h.event.phase,'done');
 assert.deepEqual(h.faults,[],'nothing is marked for an event that never arrived');
 assert.match(h.event.result().why,/never reached you/);
});

test('time it spends stuck further back is not counted as the learner holding it up',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 // it is in sight but 50 m back, queued at lights: well past the hold-up allowance in seconds
 for(let i=0;i<Math.ceil(EMERGENCY.giveUp/0.5)+10;i++){place(h,-50);h.step();}
 assert.deepEqual(h.faults.map(f=>f.cat),[],'the learner is not marked for a queue behind them');
});
