// Durable, account-scoped outbox. Tokens are obtained at request time and never stored.
export class CloudSync {
 constructor({ userId, storage, request, status = () => {} }) {
  this.key = 'cambridge-cloud.v1.' + userId; this.storage = storage; this.request = request; this.status = status;
  try { this.state = JSON.parse(storage.getItem(this.key)); } catch {}
  this.state ||= { revision: 0, profile: null, dirty: false, sessions: [] };
  this.closed = false; this.running = null; this.conflict = false;
 }
 persist() { try { this.storage.setItem(this.key, JSON.stringify(this.state)); } catch { this.status('Storage full: keep this page open until progress syncs.'); } }
 save(profile) { this.state.profile = structuredClone(profile); this.state.dirty = true; this.persist(); return this.flush(); }
 session(session) { if (!this.state.sessions.some(s => s.id === session.id)) this.state.sessions.push(structuredClone(session)); this.persist(); return this.flush(); }
 async hydrate() {
  const remote = await this.request('/api/progress');
  if (this.closed) return;
  if (!this.state.dirty) { this.state.profile = remote.profile; this.state.revision = remote.revision; this.persist(); }
  return this.state.profile;
 }
 flush() {
  if (this.closed || this.conflict) return Promise.resolve();
  if (this.running) return this.running;
  this.running = this.drain().catch(e => { if (!this.closed) this.status(e.status === 409 ? 'Progress changed on another device. Choose which copy to keep.' : 'Saved on this device. Cloud sync will retry.'); }).finally(() => { this.running = null; });
  return this.running;
 }
 async drain() {
  while (!this.closed && (this.state.dirty || this.state.sessions.length)) {
   if (this.state.dirty) {
    const profile = this.state.profile;
    let result;
    try { result = await this.request('/api/progress', { revision:this.state.revision, profile }); }
    catch (e) { if (e.status === 409) this.conflict = true; throw e; }
    if (this.closed) return;
    this.state.revision = result.revision;
    if (this.state.profile === profile) this.state.dirty = false;
    this.persist();
   }
   const session = this.state.sessions[0];
   if (session) {
    await this.request('/api/sessions',session);
    if (this.closed) return;
    this.state.sessions.shift(); this.persist();
   }
  }
  if (!this.closed) this.status('Cloud progress saved');
 }
 async resolve(keepLocal) {
  const remote = await this.request('/api/progress'); if (this.closed) return;
  this.state.revision = remote.revision;
  if (!keepLocal) this.state.profile = remote.profile;
  this.state.dirty = keepLocal; this.conflict = false; this.persist(); await this.flush();
  return this.state.profile;
 }
 close() { this.closed = true; }
}
export function cloudProfile(p) {
 if (!p) return null;
 return {name:p.name,lessons:p.lessons || {},mocks:p.mocks || [],history:p.history || [],practiceSeconds:p.practiceSeconds || 0};
}
export function cloudSession(r) {
 return {id:r.sessionId,startedAt:new Date(r.at - (r.duration || 0) * 1000).toISOString(),duration:r.duration || 0,kind:r.lessonId?'lesson':'mock',data:r,faults:r.report?.faults || [],feedback:r.report || null};
}
