// Access is obtained from the authenticated API, never from browser-editable user metadata/storage.
let full = false;
export function hasFullAccess() { return full; }
export function setAccess(allowed) {
 const next=allowed===true;if(next===full)return;full=next;
 if(typeof window!=='undefined')window.dispatchEvent(new Event('learner-access-change'));
}
