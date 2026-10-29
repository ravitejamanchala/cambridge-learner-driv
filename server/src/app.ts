import { basicProgressAllowed, isFreeLesson, FREE_LESSON_IDS } from '../../shared/access-policy.mjs';
import { billingConfigured, paidAccess, stripeClient, checkout, reconcile, verifyEvent, BILLING_EVENTS, billingOrigin } from './billing.mjs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { hasFullAccess } from './access.mjs';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { createStore } from './store';
import { progressInput, sessionInput, pageInput } from './validation.mjs';
import { z } from 'zod';
type Env = { DATABASE_URL: string; CLERK_SECRET_KEY: string; FRONTEND_URL: string; STRIPE_SECRET_KEY?: string; STRIPE_PRICE_ID?: string; STRIPE_WEBHOOK_SECRET?: string; STRIPE_PORTAL_CONFIG_ID?: string; BILLING_PREVIEW?: string; RATE_LIMITER: { limit(input: {key: string}): Promise<{success: boolean}> } };
export function createApp(deps: { store?: any; verify?: any; stripe?: any; getAccess?: (subject: string, env: Env) => Promise<boolean> } = {}) {
 const storeFor=(env:Env)=>deps.store||createStore(env.DATABASE_URL,undefined,env.STRIPE_SECRET_KEY?.startsWith('sk_live_')?'live':'test');
 const app = new Hono<{ Bindings: Env; Variables: { full: boolean; manual: boolean; subject: string; user: string; store: ReturnType<typeof createStore> } }>();
 app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options','nosniff'); await next(); });
 app.use('*', cors({ origin: (origin, c) => origin === c.env.FRONTEND_URL ? origin : '', allowHeaders: ['Authorization','Content-Type'], allowMethods: ['GET','POST','OPTIONS'], maxAge: 600 }));
 app.get('/health', c => c.json({ ok: true }));
 app.get('/health/ready', async c => {
  if (!c.env.DATABASE_URL || !c.env.CLERK_SECRET_KEY || !c.env.FRONTEND_URL || !c.env.RATE_LIMITER) return c.json({ ok:false },503);
  try { await storeFor(c.env).ready(); return c.json({ok:true}); } catch { return c.json({ok:false},503); }
 });
 app.get('/billing/config', c=>c.json({enabled:billingConfigured(c.env),testMode:!!c.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),amount:499,currency:'gbp',interval:'month'}));
 app.post('/billing/webhook',bodyLimit({maxSize:262144,onError:c=>c.json({error:'body_too_large'},413)}),async c=>{
  if(!billingConfigured(c.env))return c.json({error:'billing_not_configured'},503);
  const stripe=deps.stripe||stripeClient(c.env);
  let event;
  try{event=await verifyEvent(stripe,await c.req.text(),c.req.header('Stripe-Signature')||'',c.env.STRIPE_WEBHOOK_SECRET);}catch{return c.json({error:'invalid_signature'},400);}
  if(event.livemode !== c.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))return c.json({error:'billing_mode_mismatch'},400);
  if(!BILLING_EVENTS.has(event.type))return c.json({received:true});
  const store=storeFor(c.env);
  if(await store.billingEvent(event.id))return c.json({received:true});
  const raw=event.data.object.customer;const customer=typeof raw==='string'?raw:raw?.id;
  const owner=customer?await store.billingOwner(customer):null;
  if(owner)await reconcile(stripe,store,owner,customer,c.env.STRIPE_PRICE_ID,event.id);
  return c.json({received:true});
 });
 app.use('/api/*', bodyLimit({ maxSize: 262144, onError: c => c.json({error:'body_too_large'},413) }));
 app.use('/api/*', async (c,next) => {
  if (c.env.BILLING_PREVIEW==='true'&&!billingConfigured(c.env))return c.json({error:'preview_not_configured'},503);
  if (!c.env.CLERK_SECRET_KEY || !c.env.DATABASE_URL || !c.env.RATE_LIMITER || !c.env.FRONTEND_URL) return c.json({error:'not_configured'},503);
  const origin = c.req.header('Origin');
  if (origin && origin !== c.env.FRONTEND_URL) return c.json({error:'origin_not_allowed'},403);
  if (!(await c.env.RATE_LIMITER.limit({key:'ip:'+ (c.req.header('CF-Connecting-IP') || 'unknown')})).success) return c.json({error:'rate_limited'},429);
  const match = /^Bearer (\S+)$/.exec(c.req.header('Authorization') || '');
  if (!match) return c.json({error:'unauthorized'},401);
  let claims;
  try { claims = await (deps.verify || verifyToken)(match[1], {secretKey:c.env.CLERK_SECRET_KEY, authorizedParties:[c.env.FRONTEND_URL]}); } catch { return c.json({error:'unauthorized'},401); }
  if (!claims.sub || !claims.sid) return c.json({error:'unauthorized'},401);
  if (!(await c.env.RATE_LIMITER.limit({key:'user:'+claims.sub})).success) return c.json({error:'rate_limited'},429);
  const manual = deps.getAccess ? await deps.getAccess(claims.sub,c.env) : hasFullAccess(await createClerkClient({secretKey:c.env.CLERK_SECRET_KEY}).users.getUser(claims.sub));
  const store = storeFor(c.env);
  const user=await store.user(claims.sub);
  const billing=await store.billing?.(user);
  c.set('manual',manual===true);c.set('subject',claims.sub);c.set('full',manual===true||(billingConfigured(c.env)&&paidAccess(billing)));
  c.set('store',store);c.set('user',user);await next();
 });
 app.get('/api/me', c => c.json({id:c.get('user'),access:{full:c.get('full'),course:c.get('full'),mock:c.get('full'),puzzles:c.get('full'),freeLessonIds:FREE_LESSON_IDS}}));
 app.get('/api/billing',async c=>{
  const store=c.get('store');const current=await store.billing(c.get('user'));
  const state=current&&billingConfigured(c.env)?await reconcile(deps.stripe||stripeClient(c.env),store,c.get('user'),current.customerId,c.env.STRIPE_PRICE_ID):current;
  return c.json({enabled:billingConfigured(c.env),testMode:!!c.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),full:c.get('manual')||(billingConfigured(c.env)&&paidAccess(state)),complimentary:c.get('manual'),status:state?.status||'none',paidUntil:state?.paidUntil||null,cancelAtPeriodEnd:state?.cancelAtPeriodEnd||false,hasCustomer:!!current});
 });
 app.post('/api/billing/checkout',async c=>{
  if(!billingConfigured(c.env))return c.json({error:'billing_not_configured'},503);
  if(c.get('manual'))return c.json({error:'complimentary_access'},409);
  const result=await checkout(deps.stripe||stripeClient(c.env),c.get('store'),c.get('user'),c.get('subject'),c.env);
  return result.existing?c.json({error:'subscription_exists'},409):c.json(result);
 });
 app.post('/api/billing/portal',async c=>{
  if(!billingConfigured(c.env))return c.json({error:'billing_not_configured'},503);
  const account=await c.get('store').billing(c.get('user'));if(!account)return c.json({error:'no_subscription'},404);
  const session=await (deps.stripe||stripeClient(c.env)).billingPortal.sessions.create({customer:account.customerId,configuration:c.env.STRIPE_PORTAL_CONFIG_ID,return_url:billingOrigin(c.env)+'/?subscription=manage'});
  return c.json({url:session.url});
 });
 app.get('/api/progress', async c => c.json(await c.get('store').progress(c.get('user'))));
 app.post('/api/progress', async c => {
  const input = progressInput.safeParse(await c.req.json().catch(()=>null));
  if (!input.success) return c.json({error:'invalid_request'},400);
  if(!c.get('full')&&!basicProgressAllowed(input.data.profile,(await c.get('store').progress(c.get('user'))).profile))return c.json({error:'subscription_required'},403);
  const result = await c.get('store').saveProgress(c.get('user'),input.data);
  return result ? c.json(result) : c.json({error:'revision_conflict'},409);
 });
 app.get('/api/sessions', async c => {
  const page = pageInput.safeParse(c.req.query()); if (!page.success) return c.json({error:'invalid_request'},400);
  const {limit,offset} = page.data; const rows = await c.get('store').list(c.get('user'),limit+1,offset);
  return c.json({sessions:rows.slice(0,limit), nextOffset:rows.length>limit?offset+limit:null});
 });
 app.post('/api/sessions', async c => {
  const input = sessionInput.safeParse(await c.req.json().catch(()=>null)); if (!input.success) return c.json({error:'invalid_request'},400);
  if(!c.get('full')&&(input.data.kind!=='lesson'||!isFreeLesson(input.data.data.lessonId)))return c.json({error:'subscription_required'},403);
  const result = await c.get('store').saveSession(c.get('user'),input.data);
  return result ? c.json(result, result.duplicate?200:201) : c.json({error:'session_conflict'},409);
 });
 app.get('/api/sessions/:id', async c => {
  if (!z.uuid().safeParse(c.req.param('id')).success) return c.json({error:'invalid_request'},400);
  const session = await c.get('store').session(c.get('user'),c.req.param('id')); return session ? c.json(session) : c.json({error:'not_found'},404);
 });
 app.notFound(c=>c.json({error:'not_found'},404));
 app.onError((_err,c)=>c.json({error:'service_unavailable'},503));
 return app;
}
