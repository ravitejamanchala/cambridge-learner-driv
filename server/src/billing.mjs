import Stripe from 'stripe';
export const MONTHLY_AMOUNT=499;
export const WEB_URL='https://manchala.co.uk/cambridge-learner-driv/';
export function billingConfigured(env){return !!(env.STRIPE_SECRET_KEY&&env.STRIPE_PRICE_ID&&env.STRIPE_WEBHOOK_SECRET);}
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
export async function customerFor(stripe,store,user,clerkId){
 const existing=await store.billing(user);if(existing)return existing.customerId;
 const customer=await stripe.customers.create({metadata:{clerkUserId:clerkId}},{idempotencyKey:'learner-customer-v1-'+user});
 return store.billingCustomer(user,customer.id);
}
export async function checkout(stripe,store,user,clerkId,env){
 await validatePrice(stripe,env.STRIPE_PRICE_ID);
 const customer=await customerFor(stripe,store,user,clerkId);
 const current=await reconcile(stripe,store,user,customer,env.STRIPE_PRICE_ID);
 if(current.subscriptionId&&!['none','canceled','incomplete_expired'].includes(current.status))return {existing:true};
 const open=await stripe.checkout.sessions.list({customer,status:'open',limit:10});
 const reusable=open.data.find(s=>s.metadata?.learnerPlan===env.STRIPE_PRICE_ID);if(reusable?.url)return {url:reusable.url};
 const session=await stripe.checkout.sessions.create({mode:'subscription',customer,line_items:[{price:env.STRIPE_PRICE_ID,quantity:1}],client_reference_id:clerkId,metadata:{learnerPlan:env.STRIPE_PRICE_ID},subscription_data:{metadata:{clerkUserId:clerkId}},success_url:WEB_URL+'?subscription=success',cancel_url:WEB_URL+'?subscription=cancelled',allow_promotion_codes:false},{idempotencyKey:'learner-checkout-v1-'+user+'-'+Math.floor(Date.now()/300000)});
 return {url:session.url};
}
export async function verifyEvent(stripe,body,signature,secret){
 return stripe.webhooks.constructEventAsync(body,signature,secret,300,Stripe.createSubtleCryptoProvider());
}
export const BILLING_EVENTS=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required']);
