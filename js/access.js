import { canUsePlan, isFreeLesson } from '../shared/access-policy.mjs';
export { isFreeLesson };
// Paid access comes only from the authenticated API, never browser metadata/storage.
let full=false;
export function hasFullAccess(){return full;}
export function canAccessPlan(plan){return canUsePlan(plan,full);}
export function setAccess(allowed){
 const next=allowed===true;if(next===full)return;full=next;
 if(typeof window!=='undefined')window.dispatchEvent(new Event('learner-access-change'));
}
