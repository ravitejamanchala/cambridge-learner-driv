import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createApp} from '../.test-build/app.mjs';
import {paidAccess,validatePrice,reconcile,checkout} from '../src/billing.mjs';
import {basicProgressAllowed} from '../../shared/access-policy.mjs';
const env={DATABASE_URL:'fake',CLERK_SECRET_KEY:'fake',FRONTEND_URL:'https://manchala.co.uk',RATE_LIMITER:{limit:async()=>({success:true})},STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_499',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const period=Math.floor(Date.now()/1000)+86400;
const good={id:'sub_1',status:'active',latest_invoice:{status:'paid'},cancel_at_period_end:false,items:{data:[{price:{id:'price_499'},current_period_end:period}]}};
const price={active:true,currency:'gbp',unit_amount:499,billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
function fixture(){
 let state=null,saved=0;const processed=new Set();let subscriptions=[good];
 const stripe={customers:{create:async()=>({id:'cus_1'})},webhooks:new Stripe('sk_test_fixture').webhooks,prices:{retrieve:async()=>price},subscriptions:{list:()=>({async *[Symbol.asyncIterator](){yield* subscriptions;}})},checkout:{sessions:{list:async()=>({data:[]}),create:async args=>{assert.equal(args.customer,'cus_1');assert.equal(args.line_items[0].price,'price_499');assert.equal(args.mode,'subscription');return {url:'https://checkout.stripe.com/fixture'};}}},billingPortal:{sessions:{create:async args=>{assert.equal(args.customer,'cus_1');return {url:'https://billing.stripe.com/fixture'};}}}};
 const store={user:async()=> 'user-1',billing:async()=>state?{customerId:'cus_1',...state}:null,billingCustomer:async()=> 'cus_1',billingOwner:async c=>c==='cus_1'?'user-1':null,billingEvent:async id=>processed.has(id),saveBilling:async(_u,s,_time,id)=>{state=s;saved++;if(id)processed.add(id);},progress:async()=>({profile:null,revision:0}),saveProgress:async()=>({revision:1})};
 const app=createApp({store,stripe,getAccess:async()=>false,verify:async()=>({sub:'clerk-1',sid:'s'})});
 const req=(path,opts={})=>app.request(path,{headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},...opts},env);
 return {stripe,store,req,app,setSubscriptions:s=>{subscriptions=s;},getSaved:()=>saved,setState:s=>{state=s;}};
}
test('paid access expires; cancellations keep access only through paid term',()=>{
 const state={status:'active',paidUntil:new Date(Date.now()+1000).toISOString(),cancelAtPeriodEnd:true};
 assert.equal(paidAccess(state),true);assert.equal(paidAccess({...state,status:'past_due'}),false);assert.equal(paidAccess({...state,paidUntil:'2000-01-01'}),false);
});
test('checkout enforces GBP 4.99 per month and prevents duplicate subscriptions',async()=>{
 const f=fixture();await validatePrice(f.stripe,'price_499');
 for(const change of [{unit_amount:999},{currency:'usd'},{active:false},{recurring:{interval:'year',interval_count:1,usage_type:'licensed'}}])await assert.rejects(()=>validatePrice({prices:{retrieve:async()=>({...price,...change})}},'price_499'));
 assert.deepEqual(await checkout(f.stripe,f.store,'user-1','clerk-1',env),{existing:true});
 f.setSubscriptions([]);assert.equal((await checkout(f.stripe,f.store,'user-1','clerk-1',env)).url,'https://checkout.stripe.com/fixture');
});
test('reconciliation requires a paid invoice and matching product, ignores payload grants',async()=>{
 const f=fixture();assert.equal(paidAccess(await reconcile(f.stripe,f.store,'user-1','cus_1','price_499')),true);
 f.setSubscriptions([{...good,latest_invoice:{status:'open'}}]);assert.equal(paidAccess(await reconcile(f.stripe,f.store,'user-1','cus_1','price_499')),false);
 f.setSubscriptions([{...good,items:{data:[{price:{id:'other'},current_period_end:period}]}}]);assert.equal(paidAccess(await reconcile(f.stripe,f.store,'user-1','cus_1','price_499')),false);
});
test('real Stripe webhook signatures, duplicate delivery, cancellation and unknown customers',async()=>{
 const f=fixture();const send=async(id,customer='cus_1',sig=true)=>{
  const payload=JSON.stringify({id,type:'customer.subscription.updated',data:{object:{customer,status:'active'}}});
  const header=Stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET});
  return f.app.request('/billing/webhook',{method:'POST',headers:{'Stripe-Signature':sig?header:'t=1,v1=fake'},body:payload},env);
 };
 assert.equal((await send('evt_bad','cus_1',false)).status,400);assert.equal(f.getSaved(),0);
 assert.equal((await send('evt_1')).status,200);assert.equal(f.getSaved(),1);await send('evt_1');assert.equal(f.getSaved(),1);
 assert.equal((await (await f.req('/api/me')).json()).access.full,true);
 f.setSubscriptions([{...good,status:'canceled'}]);await send('evt_2');assert.equal((await (await f.req('/api/me')).json()).access.full,false);
 await send('evt_unknown','cus_unknown');assert.equal(f.getSaved(),2);
});
test('billing routes require auth, use only authenticated customer, fail safely without config',async()=>{
 const f=fixture();assert.equal((await f.app.request('/api/billing/checkout',{method:'POST'},env)).status,401);
 assert.equal((await f.app.request('/api/billing/checkout',{method:'POST',headers:{Authorization:'Bearer f'}},{...env,STRIPE_SECRET_KEY:undefined})).status,503);
 f.setState({status:'active',paidUntil:new Date(period*1000).toISOString()});
 assert.equal((await (await f.req('/api/billing/portal',{method:'POST',body:JSON.stringify({customer:'cus_victim'})})).json()).url,'https://billing.stripe.com/fixture');
});
test('free progress cannot create premium lesson results or mock results',()=>{
 const base={lessons:{},mocks:[],history:[]};
 assert.equal(basicProgressAllowed({...base,lessons:{'controlled-stop':{passed:true}},history:[{lessonId:'controlled-stop'}]},null),true);
 assert.equal(basicProgressAllowed({...base,lessons:{'move-off':{passed:true}}},null),false);
 assert.equal(basicProgressAllowed({...base,mocks:[{pass:true}]},null),false);
 assert.equal(basicProgressAllowed({...base,history:[{lessonId:'move-off'}]},null),false);
 assert.equal(basicProgressAllowed({...base,lessons:{paid:{passed:true,attempts:1}}},{...base,lessons:{paid:{attempts:1,passed:true}}}),true);
 const old={...base,lessons:{'move-off':{passed:true}}};assert.equal(basicProgressAllowed(old,old),true);assert.equal(basicProgressAllowed(base,old),false);
});
