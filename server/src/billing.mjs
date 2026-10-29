import Stripe from 'stripe';
export const MONTHLY_AMOUNT=499;
export const WEB_URL='https://app.slaydrive.com/';
// Origins are deployment configuration, never supplied by a checkout request.
export function billingOrigin(env){
 const origin=env.FRONTEND_URL || WEB_URL.slice(0,-1),url=new URL(origin);
 if(url.origin!==origin||url.username||url.password)throw Error('Expected a frontend origin');
 if(env.BILLING_PREVIEW==='true'){
  const local=['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:';
  const hosted=url.protocol==='https:'&&/^(pr-\d+|cockpit-review)-billing\.learner-drive-app\.pages\.dev$/.test(url.hostname);
  if(!local&&!hosted)throw Error('Unsupported billing preview origin');
  if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!env.CLERK_SECRET_KEY?.startsWith('sk_test_'))throw Error('Billing previews require Stripe and Clerk test mode');
 }else if(origin!==new URL(WEB_URL).origin)throw Error('Unexpected production frontend origin');
 return origin;
}
export function billingConfigured(env){
 if(!/^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY||'')||!env.STRIPE_PRICE_ID||!env.STRIPE_WEBHOOK_SECRET)return false;
 try{billingOrigin(env);return true;}catch{return false;}
}
export function paidAccess(state, now=Date.now()){
 return state?.status==='active'&&new Date(state.paidUntil).getTime()>now;
}
export function stripeClient(env){return new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2,timeout:10000});}
export async function validatePrice(stripe,priceId){
 const p=await stripe.prices.retrieve(priceId);
 if(!p.active||p.currency!=='gbp'||p.unit_amount!==MONTHLY_AMOUNT||p.recurring?.interval!=='month'||p.recurring?.interval_count!==1||p.billing_scheme!=='per_unit'||p.recurring?.usage_type!=='licensed')throw Error('Unexpected subscription price');
 return p;
}
// Read Stripe's current state, never grant from the redirect or event payload.
export async function reconcile(stripe,store,user,customerId,priceId,eventId){
 const observedAt=new Date().toISOString();
 const subscriptions=[];
 for await(const s of stripe.subscriptions.list({customer:customerId,status:'all',limit:100,expand:['data.latest_invoice']})){
  const item=s.items.data.find(i=>i.price.id===priceId);if(!item)continue;
  const invoice=s.latest_invoice;
  const end=item.current_period_end ?? s.current_period_end;
  const paid=s.status==='active'&&invoice&&typeof invoice!=='string'&&invoice.status==='paid'&&end*1000>Date.now();
  subscriptions.push({subscriptionId:s.id,status:paid?'active':s.status==='active'?'payment_pending':s.status,paidUntil:end?new Date(end*1000).toISOString():null,cancelAtPeriodEnd:s.cancel_at_period_end});
 }
 const state=subscriptions.find(s=>paidAccess(s))||subscriptions.find(s=>!['canceled','incomplete_expired'].includes(s.status))||subscriptions[0]||{subscriptionId:null,status:'none',paidUntil:null,cancelAtPeriodEnd:false};
 await store.saveBilling(user,state,observedAt,eventId);return state;
}
export async function customerFor(stripe,store,user,clerkId,namespace='production'){
 const existing=await store.billing(user);if(existing)return existing.customerId;
 const customer=await stripe.customers.create({metadata:{clerkUserId:clerkId}},{idempotencyKey:'learner-customer-v2-'+namespace+'-'+user});
 return store.billingCustomer(user,customer.id);
}
export async function checkout(stripe,store,user,clerkId,env){
 const origin=billingOrigin(env);
 await validatePrice(stripe,env.STRIPE_PRICE_ID);
 const customer=await customerFor(stripe,store,user,clerkId,origin);
 const current=await reconcile(stripe,store,user,customer,env.STRIPE_PRICE_ID);
 if(current.subscriptionId&&!['none','canceled','incomplete_expired'].includes(current.status))return {existing:true};
 const open=await stripe.checkout.sessions.list({customer,status:'open',limit:10});
 const reusable=open.data.find(s=>s.metadata?.learnerPlan===env.STRIPE_PRICE_ID&&s.success_url===origin+'/?subscription=success'&&s.cancel_url===origin+'/?subscription=cancelled');if(reusable?.url)return {url:reusable.url};
 const session=await stripe.checkout.sessions.create({mode:'subscription',customer,line_items:[{price:env.STRIPE_PRICE_ID,quantity:1}],client_reference_id:clerkId,metadata:{learnerPlan:env.STRIPE_PRICE_ID},subscription_data:{metadata:{clerkUserId:clerkId}},success_url:origin+'/?subscription=success',cancel_url:origin+'/?subscription=cancelled',allow_promotion_codes:false},{idempotencyKey:'learner-checkout-v2-'+origin+'-'+user+'-'+Math.floor(Date.now()/300000)});
 return {url:session.url};
}
export async function verifyEvent(stripe,body,signature,secret){
 return stripe.webhooks.constructEventAsync(body,signature,secret,300,Stripe.createSubtleCryptoProvider());
}
export const BILLING_EVENTS=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required']);
