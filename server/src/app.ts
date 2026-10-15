import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { verifyToken } from '@clerk/backend';
import { createStore } from './store';
import { progressInput, sessionInput, pageInput } from './validation.mjs';
import { z } from 'zod';
type Env = { DATABASE_URL: string; CLERK_SECRET_KEY: string; FRONTEND_URL: string; RATE_LIMITER: { limit(input: {key: string}): Promise<{success: boolean}> } };
export function createApp(deps: { store?: any; verify?: any } = {}) {
 const app = new Hono<{ Bindings: Env; Variables: { user: string; store: ReturnType<typeof createStore> } }>();
 app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options','nosniff'); await next(); });
 app.use('*', cors({ origin: (origin, c) => origin === c.env.FRONTEND_URL ? origin : '', allowHeaders: ['Authorization','Content-Type'], allowMethods: ['GET','POST','OPTIONS'], maxAge: 600 }));
 app.get('/health', c => c.json({ ok: true }));
 app.get('/health/ready', async c => {
  if (!c.env.DATABASE_URL || !c.env.CLERK_SECRET_KEY || !c.env.FRONTEND_URL || !c.env.RATE_LIMITER) return c.json({ ok:false },503);
  try { await (deps.store || createStore(c.env.DATABASE_URL)).ready(); return c.json({ok:true}); } catch { return c.json({ok:false},503); }
 });
 app.use('/api/*', bodyLimit({ maxSize: 262144, onError: c => c.json({error:'body_too_large'},413) }));
 app.use('/api/*', async (c,next) => {
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
  const store = deps.store || createStore(c.env.DATABASE_URL);
  c.set('store',store); c.set('user',await store.user(claims.sub)); await next();
 });
 app.get('/api/me', c => c.json({id:c.get('user')}));
 app.get('/api/progress', async c => c.json(await c.get('store').progress(c.get('user'))));
 app.post('/api/progress', async c => {
  const input = progressInput.safeParse(await c.req.json().catch(()=>null));
  if (!input.success) return c.json({error:'invalid_request'},400);
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
