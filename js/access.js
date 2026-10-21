import { canUsePlan, isFreeLesson } from '../shared/access-policy.mjs';
export { isFreeLesson };
// Paid access comes only from the authenticated API, never browser metadata/storage.
let full=false;
// Sign-in gate: when the deployment has an account service configured, nothing is playable until the
// learner is signed in. Builds without one (local development, the demo build) stay open as guests.
let authConfigured=false,signedIn=false;
const announce=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('learner-access-change'));};
export function hasFullAccess(){return full;}
export function needsLogin(){return authConfigured&&!signedIn;}
export function canAccessPlan(plan){return !needsLogin()&&canUsePlan(plan,full);}
export function setAccess(allowed){
 const next=allowed===true;if(next===full)return;full=next;announce();
}
export function setAuthConfigured(configured){
 const next=configured===true;if(next===authConfigured)return;authConfigured=next;announce();
}
export function setSignedIn(value){
 const next=value===true;if(next===signedIn)return;signedIn=next;if(!next)full=false;announce();
}
