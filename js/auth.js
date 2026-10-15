import { Profiles } from './profile.js';
import { CloudSync, cloudProfile, cloudSession } from './cloud-sync.js';
export async function initAuth() {
 const config = window.LEARNER_CONFIG;
 if (!config?.CLERK_PUBLISHABLE_KEY || !config?.API_BASE_URL) return;
 const base = new URL(config.API_BASE_URL);
 if (base.protocol !== 'https:' && base.hostname !== 'localhost') return;
 const panel = document.createElement('aside'); panel.id = 'learnerAccount';
 panel.className = 'account-panel';
 panel.innerHTML = '<button data-login>Sign in / create account</button> <span data-avatar></span><button data-logout hidden>Sign out</button><p data-status>Guest progress stays on this device</p><button data-import hidden>Import guest progress</button><button data-retry hidden>Retry sync</button><button data-local hidden>Keep device progress</button><button data-cloud hidden>Use cloud progress</button>';
 document.querySelector('#profileSheet .body').prepend(panel);
 panel.querySelector('[data-status]').setAttribute('role','status');
 panel.querySelectorAll('button').forEach(button => { button.className='cbtn'; button.type='button'; });
 const el = s => panel.querySelector('[data-'+s+']');
 const status = text => { el('status').textContent = text; el('retry').hidden = !sync; el('local').hidden = el('cloud').hidden = !sync?.conflict; };
 let sync, unsubscribe, activeId, generation=0;
 try {
  // Official ClerkJS SDK loaded from the Clerk frontend API encoded in the public key.
  const key = config.CLERK_PUBLISHABLE_KEY;
  if (!/^pk_(test|live)_/.test(key)) throw new Error('Invalid publishable key');
  const host = atob(key.replace(/^pk_(test|live)_/, '')).replace(/\$$/, '');
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error('Invalid Clerk host');
  await new Promise((resolve,reject) => { const script=document.createElement('script');script.crossOrigin='anonymous';script.dataset.clerkPublishableKey=key;script.src='https://'+host+'/npm/@clerk/clerk-js@5/dist/clerk.browser.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script); });
  const clerk = window.Clerk; await clerk.load();
  el('login').onclick = () => clerk.openSignIn();
  el('logout').onclick = () => clerk.signOut();
  el('retry').onclick = () => sync?.flush();
  async function activate(user) {
   if ((user?.id || null) === activeId) return;
   activeId = user?.id || null; const epoch=++generation; unsubscribe?.(); sync?.close(); sync=null;
   clerk.unmountUserButton(el('avatar'));
   el('avatar').replaceChildren(); el('login').hidden=!!user; el('logout').hidden=!user; el('import').hidden=true;
   if (!user) { Profiles.useAccount(null); status('Guest progress stays on this device'); return; }
   clerk.mountUserButton(el('avatar'));
   const userId=user.id;
   const request = async (path, body) => {
    if (epoch!==generation || clerk.user?.id!==userId) throw new Error('Account changed');
    const token=await clerk.session?.getToken();
    if (!token || epoch!==generation || clerk.user?.id!==userId) throw new Error('No active session');
    const response=await fetch(base.origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if (!response.ok) { const error=new Error('Cloud request failed');error.status=response.status;throw error; }
    return response.json();
   };
   const current = new CloudSync({userId,storage:localStorage,request,status}); sync=current;
   // Switch immediately so a drive completed while cloud hydration is pending cannot enter guest storage.
   Profiles.useAccount(userId,current.state.profile || {name:user.firstName || 'Learner',lessons:{},mocks:[],history:[],practiceSeconds:0});
   unsubscribe=Profiles.subscribe((kind,value)=>{if(kind==='session') current.session(cloudSession(value));else if(value) current.save(cloudProfile(value));});
   try { const profile=await current.hydrate(); if(epoch!==generation)return;
    if (profile) Profiles.useAccount(userId,profile);
    status('Signed in'); await current.flush();
   } catch { if(epoch===generation)status('Offline: progress stays on this device until sync succeeds.'); }
   if(epoch!==generation)return;
   el('import').hidden=!Profiles.guest() || localStorage.getItem('guest-import.'+userId)==='done';
   el('import').onclick=()=>{
    const guest=Profiles.guest();
    if (!guest || !window.confirm('Copy the selected guest learner into this account? This replaces this account’s current progress. Guest data is kept.'))return;
    const imported=structuredClone(guest);
    for(const r of imported.history || []) {r.sessionId ||= crypto.randomUUID();current.session(cloudSession(r));}
    Profiles.useAccount(userId,imported);current.save(cloudProfile(imported));
    localStorage.setItem('guest-import.'+userId,'done');el('import').hidden=true;
   };
   const resolve=async keep=>{try{const p=await current.resolve(keep);if(epoch===generation)Profiles.useAccount(userId,p || {name:user.firstName || 'Learner',lessons:{},mocks:[],history:[],practiceSeconds:0});}catch{status('Could not resolve progress. Retry when online.');}};
   el('local').onclick=()=>resolve(true);el('cloud').onclick=()=>resolve(false);
  }
  clerk.addListener(({user})=>{activate(user).catch(()=>status('Account unavailable. Guest mode remains available.'));});
  await activate(clerk.user);
  window.addEventListener('online',()=>sync?.flush());
  setInterval(()=>sync?.flush(),30000);
 } catch { status('Sign-in unavailable. You can continue as a guest.'); }
}
