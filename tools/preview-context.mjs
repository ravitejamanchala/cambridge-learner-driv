import {appendFileSync} from 'node:fs';
import {previewAlias} from './preview-alias.mjs';
const alias=previewAlias(process.env.PR_NUMBER,process.env.GITHUB_REF_NAME);
appendFileSync(process.env.GITHUB_ENV,'PREVIEW_ALIAS='+alias+'\nPREVIEW_URL=https://'+alias+'.learner-drive-app.pages.dev/\n');
