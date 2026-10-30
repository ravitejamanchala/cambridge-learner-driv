// Opt-in sandbox only. Called by the preview workflow; never touches the live Worker.
import {spawnSync} from 'node:child_process';
import {appendFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripeClient,validatePrice,BILLING_EVENTS} from '../src/billing.mjs';
const env=process.env,alias=env.PREVIEW_ALIAS;
if(!/^(pr-\d+|cockpit-review|routes-review|design-review)$/.test(alias||''))throw Error('Invalid preview alias');
const required=['PREVIEW_DATABASE_URL','PREVIEW_DATABASE_HOST','PREVIEW_CLERK_SECRET_KEY','PREVIEW_CLERK_PUBLISHABLE_KEY','PREVIEW_STRIPE_SECRET_KEY','PREVIEW_STRIPE_PRICE_ID'];
const missing=required.filter(k=>!env[k]);
mkdirSync('../test-results',{recursive:true});
function evidence(value){writeFileSync('../test-results/billing-preview.json',JSON.stringify(value,null,2));}
if(missing.length){evidence({status:'not-configured',missing});console.log('Billing preview is not configured. Missing names: '+missing.join(', '));if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'Billing sandbox not deployed: configure '+missing.join(', ')+'. Visual preview remains available.\n');process.exit(0);}
let hostname;try{hostname=new URL(env.PREVIEW_DATABASE_URL).hostname.replace('-pooler','');}catch{throw Error('Invalid preview database URL; check the secret in the environment');}
if(hostname!==env.PREVIEW_DATABASE_HOST.replace('-pooler','')||hostname===env.PRODUCTION_DATABASE_HOST?.replace('-pooler',''))throw Error('Expected the explicitly configured isolated database host');
if(!env.PREVIEW_STRIPE_SECRET_KEY.startsWith('sk_test_')||!env.PREVIEW_CLERK_SECRET_KEY.startsWith('sk_test_')||!env.PREVIEW_CLERK_PUBLISHABLE_KEY.startsWith('pk_test_'))throw Error('Preview requires Stripe and Clerk test credentials');
const name='learner-drive-'+alias+'-billing',frontend='https://'+alias+'-billing.learner-drive-app.pages.dev';
const stripe=stripeClient({STRIPE_SECRET_KEY:env.PREVIEW_STRIPE_SECRET_KEY});
const redactions=[...required,'CLOUDFLARE_API_TOKEN','GH_TOKEN','GITHUB_TOKEN'].map(k=>env[k]).filter(Boolean);
const redact=s=>redactions.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),String(s));
function wrangler(args,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{input,encoding:'utf8',env});if(r.status!==0)throw Error('Preview Worker operation failed: '+redact(r.stderr).slice(-1200));return r.stdout||'';}
let hook,installed=false;
try{
 await validatePrice(stripe,env.PREVIEW_STRIPE_PRICE_ID);
 const output=wrangler(['deploy','--config','wrangler.preview.toml','--name',name,'--var','FRONTEND_URL:'+frontend,'--var','BILLING_PREVIEW:true']);
 const api=output.match(new RegExp('https://'+name+'\\.[a-z0-9-]+\\.workers\\.dev'))?.[0];if(!api)throw Error('Preview Worker did not report its URL');
 const endpoint=api+'/billing/webhook',previous=[];
 for await(const e of stripe.webhookEndpoints.list({limit:100}))if(e.url===endpoint)previous.push(e);
 // Stripe only returns a signing secret on creation. Install the new secret before
 // retiring old preview endpoints; duplicate delivery is handled idempotently.
 hook=await stripe.webhookEndpoints.create({url:endpoint,enabled_events:[...BILLING_EVENTS],description:'SlayDrive isolated preview '+alias});
 let portal;for await(const candidate of stripe.billingPortal.configurations.list({limit:100}))if(candidate.active&&candidate.metadata?.slaydrivePreview===alias&&candidate.default_return_url===frontend){portal=candidate;break;}
 portal ||= await stripe.billingPortal.configurations.create({metadata:{slaydrivePreview:alias},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'}},default_return_url:frontend});
 const secrets={DATABASE_URL:env.PREVIEW_DATABASE_URL,CLERK_SECRET_KEY:env.PREVIEW_CLERK_SECRET_KEY,STRIPE_SECRET_KEY:env.PREVIEW_STRIPE_SECRET_KEY,STRIPE_PRICE_ID:env.PREVIEW_STRIPE_PRICE_ID,STRIPE_WEBHOOK_SECRET:hook.secret,STRIPE_PORTAL_CONFIG_ID:portal.id};
 redactions.push(...Object.values(secrets));
 wrangler(['secret','bulk','--config','wrangler.preview.toml','--name',name],JSON.stringify(secrets));installed=true;
 let ready=false;for(let i=0;i<12;i++){const r=await fetch(api+'/health/ready',{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();if(r.ok){ready=true;break;}await new Promise(r=>setTimeout(r,2500));}if(!ready)throw Error('Preview database is not ready; apply the existing migrations to the isolated branch');
 const config=await (await fetch(api+'/billing/config')).json();if(!config.enabled||!config.testMode)throw Error('Preview billing readiness failed');
 const smoke=spawnSync(process.execPath,['tools/test-stripe-sandbox.mjs'],{encoding:'utf8',env:{...env,...secrets,DATABASE_URL:'',BILLING_TEST_DATABASE_URL:env.PREVIEW_DATABASE_URL,BILLING_PREVIEW:'true',FRONTEND_URL:frontend,BILLING_PREVIEW_API_URL:api}});
 if(smoke.status!==0)throw Error('Stripe sandbox verification failed: '+redact(smoke.stderr).slice(-1200));
 console.log(redact(smoke.stdout));
 for(const old of previous)await stripe.webhookEndpoints.del(old.id);
 evidence({status:'ready',api,frontend,testMode:true,stripeSandbox:'passed'});
 if(env.GITHUB_ENV)appendFileSync(env.GITHUB_ENV,'BILLING_PREVIEW_API_URL='+api+'\nPREVIEW_FRONTEND_URL='+frontend+'\n');
 if(env.GITHUB_OUTPUT)appendFileSync(env.GITHUB_OUTPUT,'ready=true\n');
 console.log('Isolated Stripe test-mode backend ready: '+api);
}catch(error){if(hook&&!installed)await stripe.webhookEndpoints.del(hook.id).catch(()=>{});evidence({status:'failed',reason:'Sandbox setup failed; inspect workflow diagnostics'});throw Error(redact(error.message));}
