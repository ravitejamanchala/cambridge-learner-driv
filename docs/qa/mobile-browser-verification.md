# Mobile browser compatibility verification

Verified 15 October 2026 against production source 700f89bddc55b6e215c259a7a813ce02c995aeda. Seven local browser profiles passed: iPhone SE, iPhone 13, landscape iPhone 13, iPad Mini (Playwright WebKit), Pixel 7, landscape Pixel 7 and Galaxy S9+ (Chromium). Two live production login UI cases passed: iPhone 13/WebKit and Pixel 7/Chromium. The existing five-layout Chromium devices-browser suite also passed.

Checks cover WebGL startup, cockpit lesson completion, control visibility/hit-testing/44px size/no overlap, drive/steer inputs, focus-loss release, active-drive rotation, reload persistence, and offline in-session guest progress. Local gameplay checks mock only public auth config/CDN dependencies and seed prerequisite completion. Live UI checks use real production Clerk and CDN resources and never submit credentials.

This is browser emulation, not native or physical-device testing. WebKit simultaneous input uses synthetic PointerEvents; Chromium uses CDP multitouch. Hardware performance, safe areas, native lifecycle, deep links and completed authentication require device tests. No native iOS/Android wrapper exists yet. The host has no iOS simulator or Android SDK. Screenshots show crowded instruction/fault panels on small screens. The live web app has no controlling service worker or manifest; offline cold startup was not verified.

Reproduce with Node 24+: npm ci; npx playwright install webkit chromium; npm run build; npm run test:mobile; npm run test:mobile:live. CHROMIUM_PATH optionally selects an installed browser, PLAYWRIGHT_BROWSERS_PATH selects the runtime cache, and MOBILE_OUTPUT selects matrix artifact output. The scripts create isolated browser profiles, never use the user's browser/session, and leave production state untouched.

No simulator implementation or production deployment was changed by this test work.
