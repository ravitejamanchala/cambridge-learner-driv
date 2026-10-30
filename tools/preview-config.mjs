export function billingPreviewConfig(env){
 const {PREVIEW_CLERK_PUBLISHABLE_KEY:key,BILLING_PREVIEW_API_URL:api,PREVIEW_FRONTEND_URL:frontend}=env;
 if(!/^pk_test_[A-Za-z0-9_=+-]+$/.test(key||''))throw Error('Billing preview requires a Clerk test publishable key');
 const a=new URL(api),f=new URL(frontend);
 if(a.protocol!=='https:'||a.origin!==api||!/^learner-drive-(pr-\d+|cockpit-review|routes-review|design-review)-billing\.[a-z0-9-]+\.workers\.dev$/.test(a.hostname))throw Error('Expected an isolated billing preview Worker');
 if(f.protocol!=='https:'||f.origin!==frontend||!/^(pr-\d+|cockpit-review|routes-review|design-review)-billing\.learner-drive-app\.pages\.dev$/.test(f.hostname))throw Error('Expected a billing preview Pages origin');
 return {BILLING_PREVIEW:true,CLERK_PUBLISHABLE_KEY:key,API_BASE_URL:api};
}
