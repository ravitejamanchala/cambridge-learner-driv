import { writeFileSync } from 'node:fs';
const {CLERK_PUBLISHABLE_KEY, API_BASE_URL} = process.env;
if (!/^pk_(test|live)_/.test(CLERK_PUBLISHABLE_KEY || '') || !API_BASE_URL || new URL(API_BASE_URL).protocol !== 'https:') throw new Error('Public Clerk key and deployed HTTPS API URL are required');
writeFileSync(new URL('../auth-config.js',import.meta.url),'window.LEARNER_CONFIG = '+JSON.stringify({CLERK_PUBLISHABLE_KEY,API_BASE_URL})+';\n');
