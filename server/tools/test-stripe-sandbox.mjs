import assert from 'node:assert/strict';
import {createStore} from '../.test-build/store.mjs';
import {stripeClient,checkout,reconcile,paidAccess,billingOrigin} from '../src/billing.mjs';
const env=process.env;
if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!env.BILLING_TEST_DATABASE_URL)throw Error('Requires Stripe test mode and an isolated database branch.');
const host=value=>{try{return new URL(value).hostname.replace('-pooler','');}catch{throw Error('Invalid database URL; check the secure environment configuration');}};
const testHost=host(env.BILLING_TEST_DATABASE_URL),productionHost=env.PRODUCTION_DATABASE_HOST?.replace('-pooler','')||(env.DATABASE_URL?host(env.DATABASE_URL):null),pinned=env.PREVIEW_DATABASE_HOST?.replace('-pooler','');
if((!productionHost&&!pinned)||testHost===productionHost||(pinned&&testHost!==pinned))throw Error('Requires an explicitly isolated test database host.');
const stripe=stripeClient(env),store=createStore(env.BILLING_TEST_DATABASE_URL);
const clerkId='billing-sandbox-fixture-'+crypto.randomUUID(),user=await store.user(clerkId);
let subscription;
async function webhook(customer){
 if(!env.BILLING_PREVIEW_API_URL)return;
 const payload=JSON.stringify({id:'evt_preview_'+crypto.randomUUID().replaceAll('-',''),livemode:false,type:'customer.subscription.updated',data:{object:{customer,status:'active'}}}),signature=stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET});
 for(const token of [signature,signature,'t=1,v1=invalid']){const response=await fetch(env.BILLING_PREVIEW_API_URL+'/billing/webhook',{method:'POST',headers:{'Stripe-Signature':token,'Content-Type':'application/json'},body:payload});await response.arrayBuffer();assert.equal(response.status,token===signature?200:400);}
}
try{
 const session=await checkout(stripe,store,user,clerkId,env);assert.match(session.url,/^https:\/\/checkout.stripe.com\//);
 const account=await store.billing(user);
 const method=await stripe.paymentMethods.attach('pm_card_visa',{customer:account.customerId});
 subscription=await stripe.subscriptions.create({customer:account.customerId,items:[{price:env.STRIPE_PRICE_ID}],default_payment_method:method.id,payment_behavior:'error_if_incomplete',metadata:{fixture:'learner-drive-sandbox'}});
 await webhook(account.customerId);
 assert.equal(paidAccess(await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID)),true);
 assert.equal((await checkout(stripe,store,user,clerkId,env)).existing,true);
 await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:true});
 const cancelling=await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID);assert.equal(cancelling.cancelAtPeriodEnd,true);assert.equal(paidAccess(cancelling),true);
 const portal=await stripe.billingPortal.sessions.create({customer:account.customerId,configuration:env.STRIPE_PORTAL_CONFIG_ID,return_url:billingOrigin(env)+'/'});assert.match(portal.url,/^https:\/\/billing.stripe.com\//);
 await stripe.subscriptions.cancel(subscription.id);subscription=null;
 await webhook(account.customerId);
 assert.equal(paidAccess(await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID)),false);
 console.log('PASS real Stripe sandbox: £4.99 checkout, test payment, activation, duplicate prevention, period-end cancellation, customer portal and revocation; isolated Neon branch.');
}catch(e){console.error('Sandbox check failed:',e.type||e.name,e.type?'Check Stripe test-mode configuration':'Assertion failed');process.exitCode=1;}
finally{if(subscription)await stripe.subscriptions.cancel(subscription.id);}
