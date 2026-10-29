import {appendFileSync} from 'node:fs';
const n=process.env.PR_NUMBER;if(n&&!/^\d+$/.test(n))throw Error('Invalid PR number');
const alias=n?'pr-'+n:'cockpit-review';
appendFileSync(process.env.GITHUB_ENV,'PREVIEW_ALIAS='+alias+'\nPREVIEW_URL=https://'+alias+'.learner-drive-app.pages.dev/\n');
