import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAlias} from '../tools/preview-alias.mjs';

test('PR previews always use their own number',()=>{
  assert.equal(previewAlias('24','feature/professional-ui'),'pr-24');
  assert.throws(()=>previewAlias('24\nPREVIEW_ALIAS=main','feature/professional-ui'));
});
test('development previews cannot replace production or another review',()=>{
  assert.equal(previewAlias('','feature/professional-ui'),'design-review');
  assert.equal(previewAlias('','feature/personal-route-builder'),'routes-review');
  assert.equal(previewAlias('','feature/production-cockpit-billing'),'cockpit-review');
  for(const branch of ['main','gh-pages','feature/unknown','toString'])assert.throws(()=>previewAlias('',branch));
});
