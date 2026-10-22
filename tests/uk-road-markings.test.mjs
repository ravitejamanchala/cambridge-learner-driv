import test from 'node:test';
import assert from 'node:assert/strict';
import {longitudinalPattern,paintIntervals,transverseMarkings} from '../js/uk-road-markings.js';
import {dash} from '../js/road-ribbon.js';
test('UK centre and lane markings use distinct speed-dependent presets',()=>{
 assert.deepEqual(longitudinalPattern('centre',40),{diagram:'1008',mark:2,gap:4,width:.1});
 assert.deepEqual(longitudinalPattern('centre',60),{diagram:'1008.1',mark:3,gap:6,width:.15});
 assert.deepEqual(longitudinalPattern('lane',30),{diagram:'1005',mark:2,gap:7,width:.1});
 assert.deepEqual(longitudinalPattern('lane',70),{diagram:'1005.1',mark:2,gap:7,width:.15});
});
test('complete paint marks leave junctions clear without invented warning lengths',()=>{
 const p=longitudinalPattern('centre',30),marks=paintIntervals(50,p);
 assert.deepEqual(marks,[[9,2],[15,2],[21,2],[27,2],[33,2],[39,2]]);
 assert.deepEqual(paintIntervals(10,p),[]);
 assert.ok(paintIntervals(100,longitudinalPattern('lane',30)).every(([s,len])=>len===2&&s+len<=91));
});
test('actual painted strips use prescribed width, not a hardcoded 140 mm',()=>{
 const edge={n:2,len:100,px:[0,100],pz:[0,0],cum:[0,100]};
 for(const mph of [30,60]){const quads=[],p=longitudinalPattern('centre',mph);dash({quad:(...v)=>quads.push(v)},edge,9,p.mark,0,.07,p.width);
  assert.ok(Math.abs(Math.abs(quads[0][1]-quads[0][3])-p.width)<1e-9);
  assert.equal(quads[0][4]-quads[0][0],p.mark);
 }
});
test('STOP gets a solid line; give-way covers every approach lane on one-way roads',()=>{
 const two={w:6.4,e:{way:{oneway:0}}},one={w:6.4,e:{way:{oneway:1}}};
 const stop=transverseMarkings({...two,stop:true});assert.equal(stop.length,1);assert.equal(stop[0].width,.4);
 assert.equal(transverseMarkings({...two,signal:true})[0].width,.2);
 const give=transverseMarkings(one);assert.ok(give.some(p=>p.from<0));assert.ok(give.some(p=>p.to>0));
 assert.deepEqual([...new Set(give.map(p=>p.back))],[0,.5]);
 give.forEach(p=>{assert.ok(Math.abs(p.to-p.from-.6)<1e-9);assert.equal(p.width,.2);assert.ok(p.from>=-2.9-1e-9&&p.to<=2.9+1e-9);});
 assert.ok(transverseMarkings(two).every(p=>p.from>=0));
});
