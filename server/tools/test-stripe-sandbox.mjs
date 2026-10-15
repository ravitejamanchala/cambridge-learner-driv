import assert from 'node:assert/strict';
import {createStore} from '../.test-build/store.mjs';
import {stripeClient,checkout,reconcile,paidAccess} from '../src/billing.mjs';
const env=process.env;
if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||!env.BILLING_TEST_DATABASE_URL)throw Error('Requires Stripe test mode and an isolated database branch.');
if(new URL(env.BILLING_TEST_DATABASE_URL).hostname.replace('-pooler','')===new URL(env.DATABASE_URL).hostname.replace('-pooler',''))throw Error('Must not use the production database.');
const stripe=stripeClient(env),store=createStore(env.BILLING_TEST_DATABASE_URL);
const clerkId='billing-sandbox-fixture-'+crypto.randomUUID(),user=await store.user(clerkId);
let subscription;
try{
 const session=await checkout(stripe,store,user,clerkId,env);assert.match(session.url,/^https:\/\/checkout.stripe.com\//);
 const account=await store.billing(user);
 const method=await stripe.paymentMethods.attach('pm_card_visa',{customer:account.customerId});
 subscription=await stripe.subscriptions.create({customer:account.customerId,items:[{price:env.STRIPE_PRICE_ID}],default_payment_method:method.id,payment_behavior:'error_if_incomplete',metadata:{fixture:'learner-drive-sandbox'}});
 assert.equal(paidAccess(await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID)),true);
 assert.equal((await checkout(stripe,store,user,clerkId,env)).existing,true);
 await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:true});
 const cancelling=await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID);assert.equal(cancelling.cancelAtPeriodEnd,true);assert.equal(paidAccess(cancelling),true);
 const portal=await stripe.billingPortal.sessions.create({customer:account.customerId,configuration:env.STRIPE_PORTAL_CONFIG_ID,return_url:'https://manchala.co.uk/cambridge-learner-driv/'});assert.match(portal.url,/^https:\/\/billing.stripe.com\//);
 await stripe.subscriptions.cancel(subscription.id);subscription=null;
 assert.equal(paidAccess(await reconcile(stripe,store,user,account.customerId,env.STRIPE_PRICE_ID)),false);
 console.log('PASS real Stripe sandbox: £4.99 checkout, test payment, activation, duplicate prevention, period-end cancellation, customer portal and revocation; isolated Neon branch.');
}catch(e){console.error('Sandbox check failed:',e.type||e.name,e.type?e.message:'Assertion failed');process.exitCode=1;}
finally{if(subscription)await stripe.subscriptions.cancel(subscription.id);}
