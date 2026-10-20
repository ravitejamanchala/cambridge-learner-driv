// Offline sign-in and subscription fixture for the browser suites.
// The committed auth-config.js points at the live account service, so a test page would otherwise sit
// behind the sign-in gate with no way through. This routes the account service, the Clerk SDK and the
// API to local fixtures, so a suite can drive any lesson deterministically and without network access.
export async function installAuthFixture(page, { full = true, host = 'clerk.fixture.invalid', api = 'https://api.fixture.invalid' } = {}) {
  await page.route('**/auth-config.js', r => r.fulfill({ contentType: 'text/javascript',
    body: `window.LEARNER_CONFIG={CLERK_PUBLISHABLE_KEY:'pk_test_'+btoa('${host}$'),API_BASE_URL:'${api}'};` }));
  await page.route(`https://${host}/**`, r => r.fulfill({ contentType: 'text/javascript',
    body: `window.Clerk={user:{id:'fixture',firstName:'Test'},session:{getToken:async()=>'fixture'},load:async()=>{},addListener(){},mountUserButton(){},unmountUserButton(){},openSignIn(){},signOut(){}};` }));
  // Progress round-trips through this store, so a reload sees what the previous page saved,
  // the way the real account service behaves.
  const store = { profile: null, revision: 0, sessions: [] };
  await page.route(api + '/**', r => {
    const path = new URL(r.request().url()).pathname, post = r.request().method() === 'POST';
    const sent = () => { try { return JSON.parse(r.request().postData() || '{}'); } catch { return {}; } };
    let body;
    if (path === '/api/me') body = { id: 'internal', access: { full } };
    else if (path === '/api/billing') body = { enabled: true, testMode: true, full, hasCustomer: full, status: full ? 'active' : 'none' };
    else if (path === '/billing/config') body = { enabled: true, testMode: true };
    else if (path === '/api/progress' && post) { const p = sent(); store.profile = p.profile ?? store.profile; store.revision += 1; body = { revision: store.revision }; }
    else if (path === '/api/progress') body = { profile: store.profile, revision: store.revision };
    else if (path === '/api/sessions') { store.sessions.push(sent()); body = { ok: true }; }
    else body = { profile: store.profile, revision: store.revision, sessions: store.sessions };
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  return store;
}
// true once the gate has opened and a drive can start
export const signedIn = page => page.waitForFunction(() => document.querySelector('[data-open=mockSheet]')?.getAttribute('aria-disabled') === 'false', {}, { timeout: 45000 });
