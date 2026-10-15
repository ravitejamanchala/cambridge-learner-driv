import { setAccess, hasFullAccess } from './access.js';
import { Profiles } from './profile.js';
import { CloudSync, cloudProfile, cloudSession } from './cloud-sync.js';
export async function initAuth() {
 setAccess(false);
 const config = window.LEARNER_CONFIG;
 if (!config?.CLERK_PUBLISHABLE_KEY || !config?.API_BASE_URL) return;
 const base = new URL(config.API_BASE_URL);
 if (base.protocol !== 'https:' && base.hostname !== 'localhost') return;
 const panel = document.createElement('aside'); panel.id = 'learnerAccount';
 panel.className = 'account-panel';
 panel.innerHTML = '<button data-login>Sign in / create account</button> <span data-avatar></span><button data-logout hidden>Sign out</button><button data-access hidden>Refresh access</button><div class="subscription-offer"><b>Learner Drive Plus · £4.99/month</b><p>Unlock the full course, mock tests and puzzles. Free access includes Highway Code and the first three practical lessons.</p><p>Renews monthly until cancelled. Cancel through Manage subscription; access continues until the paid period ends.</p><p data-billing-status role="status">Free plan</p><button data-subscribe>Subscribe · £4.99/month</button><button data-manage hidden>Manage subscription</button><p data-billing-mode hidden>Test mode — no real payments. Do not enter a real card.</p></div><p data-status>Guest progress stays on this device</p><button data-import hidden>Import guest progress</button><button data-retry hidden>Retry sync</button><button data-local hidden>Keep device progress</button><button data-cloud hidden>Use cloud progress</button>';
 document.querySelector('#profileSheet .body').prepend(panel);
 panel.querySelector('[data-status]').setAttribute('role','status');
 panel.querySelectorAll('button').forEach(button => { button.className='cbtn'; button.type='button'; });
 const el = s => panel.querySelector('[data-'+s+']');
 const status = text => { el('status').textContent = text; el('retry').hidden = !sync; el('local').hidden = el('cloud').hidden = !sync?.conflict; };
 let sync, unsubscribe, activeId, generation=0, authenticatedRequest, pendingSubscribe=false;
 let billingConfig={enabled:false,testMode:false};
 fetch(base.origin+'/billing/config',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(value=>{if(value){billingConfig=value;el('billing-mode').hidden=!value.testMode;}}).catch(()=>{});
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
  const billingStatus=text=>{el('billing-status').textContent=text;};
  const redirect=url=>{const target=new URL(url);if(target.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(target.hostname)||target.username||target.password)throw Error('Invalid checkout');window.location.assign(target.href);};
  async function startCheckout(){
   if(!clerk.user){pendingSubscribe=true;clerk.openSignIn();return;}
   if(!billingConfig.enabled){billingStatus('Subscriptions are being set up. You can use the free lessons now.');return;}
   if(!authenticatedRequest){billingStatus('Please refresh access before subscribing.');return;}
   el('subscribe').disabled=true;billingStatus('Opening secure checkout…');
   try{const result=await authenticatedRequest('/api/billing/checkout',{});redirect(result.url);}
   catch(e){billingStatus(e.code==='subscription_exists'?'You already have a subscription. Use Manage subscription.':e.code==='complimentary_access'?'Your account already has complimentary full access.':'Checkout is unavailable. Please try again.');}
   finally{el('subscribe').disabled=false;}
  }
  el('subscribe').onclick=startCheckout;
  el('manage').onclick=async()=>{try{redirect((await authenticatedRequest('/api/billing/portal',{})).url);}catch{billingStatus('Could not open subscription management. Please try again.');}};
  async function activate(user, force=false) {
   if (!force && (user?.id || null) === activeId) return;
   setAccess(false);authenticatedRequest=null;el('manage').hidden=true;el('subscribe').hidden=false;
   activeId = user?.id || null; const epoch=++generation; unsubscribe?.(); sync?.close(); sync=null;
   clerk.unmountUserButton(el('avatar'));
   el('avatar').replaceChildren(); el('login').hidden=!!user; el('logout').hidden=!user; el('import').hidden=true; el('access').hidden=!user;
   if (!user) { Profiles.useAccount(null); billingStatus('Free plan · sign in to subscribe');status('Free lessons stay on this device. Sign in to save across devices.'); return; }
   el('access').onclick=()=>activate(clerk.user,true).catch(()=>status('Could not verify access. Try Refresh access again.'));
   clerk.mountUserButton(el('avatar'));
   const userId=user.id;
   const request = async (path, body) => {
    if (epoch!==generation || clerk.user?.id!==userId) throw new Error('Account changed');
    const token=await clerk.session?.getToken();
    if (!token || epoch!==generation || clerk.user?.id!==userId) throw new Error('No active session');
    const response=await fetch(base.origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(epoch!==generation||clerk.user?.id!==userId)throw new Error('Account changed');
    if (!response.ok) {const detail=await response.json().catch(()=>({}));if(response.status===403){setAccess(false);status('This progress needs a subscription. Your device copy is kept.');} const error=new Error('Cloud request failed');error.status=response.status;error.code=detail.error;throw error;}
    return response.json();
   };
   const current = new CloudSync({userId,storage:localStorage,request,status}); sync=current;
   // Switch immediately so a drive completed while cloud hydration is pending cannot enter guest storage.
   Profiles.useAccount(userId,current.state.profile || {name:user.firstName || 'Learner',lessons:{},mocks:[],history:[],practiceSeconds:0});
   try { const me=await request('/api/me'); if(epoch!==generation)return;
    const billing=await request('/api/billing');if(epoch!==generation)return;
    const allowed=typeof billing.full==='boolean'?billing.full:me.access?.full===true;
    setAccess(allowed);authenticatedRequest=request;
    billingConfig={enabled:billing.enabled===true,testMode:billing.testMode===true};el('billing-mode').hidden=!billingConfig.testMode;
    el('subscribe').hidden=allowed;el('manage').hidden=!billing.hasCustomer;
    const end=billing.paidUntil?new Date(billing.paidUntil).toLocaleDateString('en-GB'):'';
    billingStatus(billing.complimentary?'Complimentary full access':allowed?(billing.cancelAtPeriodEnd?'Plus access until '+end+' · renewal cancelled':'Plus subscription active'):'Free plan'+(billing.status==='past_due'?' · payment needs attention':''));
    const result=new URL(location.href).searchParams.get('subscription');
    if(result==='success'&&!allowed)billingStatus('Payment confirmation is pending. Use Refresh access in a moment. Free lessons are available meanwhile.');
    if(result==='cancelled')billingStatus('Checkout cancelled. You still have free access.');
   } catch { if(epoch===generation){current.close();sync=null;status('Could not verify your account. Free lessons remain available; try Refresh access again.');}return; }
   unsubscribe=Profiles.subscribe((kind,value)=>{if(kind==='session') current.session(cloudSession(value));else if(value) current.save(cloudProfile(value));});
   try { const profile=await current.hydrate(); if(epoch!==generation)return;
    if (profile) Profiles.useAccount(userId,profile);
    status(hasFullAccess()?'Signed in · full access':'Signed in · free access'); await current.flush();
   } catch { if(epoch===generation)status('Offline: progress stays on this device until sync succeeds.'); }
   if(epoch!==generation)return;
   if(pendingSubscribe){pendingSubscribe=false;startCheckout();}
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
  clerk.addListener(({user})=>{activate(user).catch(()=>status('Account unavailable. Refresh to verify access.'));});
  await activate(clerk.user);
  window.addEventListener('online',()=>sync?.flush());
  setInterval(()=>sync?.flush(),30000);
 } catch { status('Sign-in unavailable. Refresh to try again.'); }
}
