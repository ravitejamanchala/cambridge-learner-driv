import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {STREET_ASSETS,streetAssetGeometry,streetAssetHeading} from '../js/uk-street-assets.js';
import {mappedAppearance} from '../js/mapped-scenery.js';
import {pointKind} from '../js/personal/geo/osm-details.js';
import {sceneFeatures} from '../js/personal/geo/map-features.js';
test('street assets remain in their collision envelopes with one lightweight, finite coloured mesh',()=>{
  for(const [kind,dimensions] of Object.entries(STREET_ASSETS)){
    const g=streetAssetGeometry(T,kind,dimensions),p=g.attributes.position;
    assert.ok(p.count>36,kind);assert.ok(p.count/3<1800,kind+' triangle budget');
    assert.equal(g.attributes.color.count,p.count);
    assert.ok([...p.array,...g.attributes.normal.array].every(Number.isFinite),kind);
    for(const axis of ['x','y','z']){assert.ok(g.boundingBox.min[axis]>=-.50001,kind+' min '+axis);assert.ok(g.boundingBox.max[axis]<=.50001,kind+' max '+axis);}
    const o={id:kind,sx:dimensions[0],sy:dimensions[1],sz:dimensions[2],properties:{mapFeature:kind}};
    const m=new T.Mesh(new T.BoxGeometry(),new T.MeshLambertMaterial()),before=structuredClone(o);
    mappedAppearance(T,m,o);assert.equal(m.children.length,0);assert.equal(m.material.vertexColors,true);
    assert.equal(m.userData.streetAsset.kind,kind);assert.deepEqual(o,before);
    m.geometry.dispose();m.material.dispose();g.dispose();
  }
});
test('public transport shelter tags survive the native adapter without inventing shelters at every stop',()=>{
  assert.equal(pointKind({amenity:'shelter',shelter_type:'public_transport'}),'busShelter');
  assert.equal(pointKind({amenity:'shelter',shelter_type:'picnic_shelter'}),null);
  assert.equal(pointKind({highway:'bus_stop'}),'busStop');
  const track={objects:[],network:{origin:[0,0],kx:1,kz:1},georeference:{bounds:[-10,-10,10,10]}};
  const result=sceneFeatures(track,[{id:'node/17',kind:'busShelter',point:[3,4],tags:{direction:'E'}}]);
  const o=result.objects[0];assert.equal(o.x,3);assert.equal(o.z,4);assert.equal(o.rotation,Math.PI/2);
  assert.equal(o.properties.sourceId,'node/17');assert.equal(o.properties.estimatedDimensions,true);
  assert.equal(o.properties.orientationSource,'source direction');
});
test('unknown furniture directions stay unknown rather than pretending to face the road',()=>{
  assert.equal(streetAssetHeading({direction:'towards station'}),undefined);
  assert.equal(streetAssetHeading({}),undefined);
  assert.equal(streetAssetHeading({direction:'north'}),undefined);
  assert.equal(streetAssetHeading({direction:'180'}),0);
});
