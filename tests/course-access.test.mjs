import test from 'node:test';
import assert from 'node:assert/strict';
import {VISIBLE_LESSONS,HIDDEN_LESSON_IDS} from '../js/course-menu.js';
import {hasFullAccess,setAccess,needsLogin,setAuthConfigured,setSignedIn,canAccessPlan} from '../js/access.js';
test('selected starter drills are hidden from the course menu',()=>{
 assert.equal(HIDDEN_LESSON_IDS.size,5);assert.equal(VISIBLE_LESSONS.length,47);
 assert.ok(VISIBLE_LESSONS.every(l=>!HIDDEN_LESSON_IDS.has(l.id)));
});
test('client starts locked and accepts only explicit verified access',()=>{
 assert.equal(hasFullAccess(),false);setAccess('full');assert.equal(hasFullAccess(),false);
 setAccess(true);assert.equal(hasFullAccess(),true);setAccess(false);assert.equal(hasFullAccess(),false);
});

test('an unconfigured build stays open to guests, so local and demo builds still run',()=>{
 setAuthConfigured(false);setSignedIn(false);setAccess(false);
 assert.equal(needsLogin(),false);
 assert.equal(canAccessPlan({kind:'lesson',lesson:{id:'mirror-practice'}}),true);
});
test('once an account service is configured, nothing is playable until the learner signs in',()=>{
 setAuthConfigured(true);setSignedIn(false);setAccess(true);
 assert.equal(needsLogin(),true);
 // not even a free lesson, and a granted subscription cannot stand in for signing in
 assert.equal(canAccessPlan({kind:'lesson',lesson:{id:'mirror-practice'}}),false);
 assert.equal(canAccessPlan({kind:'mock',index:0}),false);
 setSignedIn(true);
 assert.equal(needsLogin(),false);
 assert.equal(canAccessPlan({kind:'lesson',lesson:{id:'mirror-practice'}}),true);
});
test('signing out drops paid access as well as the session',()=>{
 setAuthConfigured(true);setSignedIn(true);setAccess(true);
 assert.equal(canAccessPlan({kind:'mock',index:0}),true);
 setSignedIn(false);
 assert.equal(hasFullAccess(),false);
 assert.equal(canAccessPlan({kind:'mock',index:0}),false);
 setAuthConfigured(false);setSignedIn(false);setAccess(false);
});
