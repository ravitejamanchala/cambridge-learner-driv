import test from 'node:test';
import assert from 'node:assert/strict';
import {VISIBLE_LESSONS,HIDDEN_LESSON_IDS} from '../js/course-menu.js';
import {hasFullAccess,setAccess} from '../js/access.js';
test('selected starter and parking drills are hidden from the course menu',()=>{
 assert.equal(HIDDEN_LESSON_IDS.size,8);assert.equal(VISIBLE_LESSONS.length,32);
 assert.ok(VISIBLE_LESSONS.every(l=>!HIDDEN_LESSON_IDS.has(l.id)));
});
test('client starts locked and accepts only explicit verified access',()=>{
 assert.equal(hasFullAccess(),false);setAccess('full');assert.equal(hasFullAccess(),false);
 setAccess(true);assert.equal(hasFullAccess(),true);setAccess(false);assert.equal(hasFullAccess(),false);
});
