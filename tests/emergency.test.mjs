import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmergencyEvent, EMERGENCY } from '../js/emergency.js';

// A straight 400 m road heading east, with the learner's route along it.
function harness({ roadWidth = 7.3, zebras = [], fillets = [], oneway = false } = {}) {
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
  const event = createEmergencyEvent({ net, traffic, test, player, ui: { banner: t => banners.push(t) } });
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
 assert.deepEqual(h.banners,[],'nothing is announced: the police car is there to be seen');
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
 place(h,-25); h.player.v=4; h.step();  // moving when it appears behind
 h.player.v=0;                          // then chooses to stop, on the crossing
 for(let i=0;i<8;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 const cats=h.faults.map(f=>f.cat);
 assert.ok(cats.includes('Emergency vehicle – position'),JSON.stringify(h.faults));
 assert.ok(!cats.includes('Emergency vehicle'),'stopping still counts as making room');
 assert.equal(h.event.result().ok,false);
 assert.match(h.event.result().why,/crossing or in a junction/);
});
test('stopping inside the junction itself is marked',()=>{
 // a 9 m junction with its node right where the learner is sitting
 const h=harness({fillets:[{node:0,nx:0,nz:0,C:[4,4],R:8,w:9}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 place(h,-25); h.player.v=4; h.step();
 h.player.v=0;
 for(let i=0;i<8;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.ok(h.faults.some(f=>f.cat==='Emergency vehicle – position'),JSON.stringify(h.faults));
});
test('waiting at the give-way line short of the junction is an ordinary stop',()=>{
 // same junction, but the learner is held 9 m back at the line rather than in the box
 const h=harness({fillets:[{node:0,nx:9,nz:0,C:[13,4],R:8,w:9}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 place(h,-25); h.player.v=4; h.step();
 h.player.v=0;
 for(let i=0;i<4;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.deepEqual(h.faults,[]); assert.equal(h.event.result().ok,true);
});
test('stopping clear of a junction is not marked',()=>{
 const h=harness({fillets:[{node:0,nx:500,nz:500,C:[500,500],R:8,w:4}]});
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

test('it does not follow for ever: it gives up and the drive carries on',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 for(let i=0;i<Math.ceil(EMERGENCY.giveUp/0.5)+6;i++){place(h,-20);h.step();}
 assert.equal(h.event.phase,'done');
 assert.ok(h.event.events.some(e=>e.type==='emergency-gave-up'));
 assert.equal(h.car.alive,false,'it is off the road, not sitting behind the learner');
 assert.equal(h.event.result().ok,false);
});

test('a vehicle that never reaches the learner is not held against them',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 // it exists, but stays far away for the whole drive
 for(let i=0;i<Math.ceil(EMERGENCY.abandon/0.5)+6;i++){place(h,-400);h.step();}
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

test('it always comes up behind, so the mirrors are what finds it',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 assert.equal(h.event.phase,'coming');
 assert.equal(h.placed[0].dir,1,'travelling the learner\'s way, not against them');
 assert.ok(Array.isArray(h.placed[0].path),'following the learner\'s route up behind them');
 assert.deepEqual(h.banners,[],'nothing announced: it is for the learner to spot');
});
test('it is quicker than anything else on the road',()=>{
 const h=harness();
 h.test.sRoute=100; h.player.v=12; h.step();
 // ordinary traffic cruises at 0.88 to 1.0 of the limit
 assert.ok(h.placed[0].cruise>1.4,'cruise '+h.placed[0].cruise+' should outpace ordinary traffic');
 assert.ok(h.placed[0].speed>=16,'it arrives already moving quickly');
});

test('already stopped in a queue when it arrives is not a stop in a junction',()=>{
 const h=harness({zebras:[{x:0,z:0,w:7.3}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 h.player.v=0; // held in a queue on the crossing before it ever got near
 for(let i=0;i<6;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.deepEqual(h.faults.map(f=>f.cat),[],JSON.stringify(h.faults));
});

test('being forced to a stop by the queue in front is not marked either',()=>{
 const h=harness({zebras:[{x:0,z:0,w:7.3}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 // a stationary car five metres ahead: the learner stops on the crossing with no choice
 h.traffic.cars.push({x:h.player.x+5,z:h.player.z,th:h.player.th,v:0,alive:true});
 place(h,-25); h.player.v=4; h.step();
 h.player.v=0;
 for(let i=0;i<4;i++){place(h,-25);h.step();}
 place(h,20); h.step();
 assert.ok(!h.faults.some(f=>f.cat==='Emergency vehicle – position'),JSON.stringify(h.faults));
});

test('stopping at a junction while it is still a long way back is not marked',()=>{
 const h=harness({zebras:[{x:0,z:0,w:7.3}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 // an ordinary wait to emerge, with the police car still nearly 60 m behind
 place(h,-58); h.step();
 h.player.v=0;
 for(let i=0;i<6;i++){place(h,-58);h.step();}
 h.player.v=10; for(let i=0;i<3;i++){place(h,-20);h.step();}
 place(h,20); h.step();
 assert.ok(!h.faults.some(f=>f.cat==='Emergency vehicle – position'),JSON.stringify(h.faults));
 assert.equal(h.event.result().ok,true);
});

test('edging over the give-way line on the way through is not sitting in the junction',()=>{
 const h=harness({fillets:[{node:0,nx:0,nz:0,C:[4,4],R:8,w:9}]});
 h.test.sRoute=100; h.player.v=12; h.step();
 place(h,-25); h.player.v=4; h.step();
 h.player.v=0; place(h,-25); h.step(); // a one-second pause, then away again
 h.player.v=8; for(let i=0;i<3;i++){place(h,-20);h.step();}
 place(h,20); h.step();
 assert.ok(!h.faults.some(f=>f.cat==='Emergency vehicle – position'),JSON.stringify(h.faults));
});
