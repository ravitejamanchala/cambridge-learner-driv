import {readFile,writeFile,chmod} from 'node:fs/promises';
import {stripeClient,validatePrice,BILLING_EVENTS,WEB_URL} from '../src/billing.mjs';
const env=process.env;
if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw Error('This setup tool only configures Stripe test mode.');
const stripe=stripeClient(env);
try{
 await validatePrice(stripe,env.STRIPE_PRICE_ID);
 const url='https://learner-drive-api.manchala0024.workers.dev/billing/webhook';
 const endpoints=await stripe.webhookEndpoints.list({limit:100});
 let endpoint=endpoints.data.find(e=>e.url===url&&e.status==='enabled');
 let secret=env.STRIPE_WEBHOOK_SECRET;
 if(endpoint&&!secret)throw Error('Existing endpoint needs its signing secret in the environment file.');
 if(!endpoint){endpoint=await stripe.webhookEndpoints.create({url,enabled_events:[...BILLING_EVENTS],description:'Learner Drive subscription status'});secret=endpoint.secret;}
 let config=env.STRIPE_PORTAL_CONFIG_ID;
 if(!config){const portal=await stripe.billingPortal.configurations.create({features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'}},default_return_url:WEB_URL});config=portal.id;}
 const values={STRIPE_WEBHOOK_SECRET:secret,STRIPE_PORTAL_CONFIG_ID:config};
 let source=await readFile('.env','utf8');
 for(const [key,value] of Object.entries(values)){
  const regex=new RegExp('^'+key+'=.*$','m');source=regex.test(source)?source.replace(regex,key+'='+value):source+'\n'+key+'='+value+'\n';
 }
 await writeFile('.env',source);await chmod('.env',0o600);
 console.log(JSON.stringify({testMode:true,priceId:env.STRIPE_PRICE_ID,webhookId:endpoint.id,portalId:config,configured:true}));
}catch(e){console.error('Stripe setup failed:',e.type||'configuration',e.statusCode||'',e.type?e.message:'Check existing configuration.');process.exitCode=1;}
