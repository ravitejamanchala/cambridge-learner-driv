import {execFileSync} from 'node:child_process';import {readFileSync,existsSync,writeFileSync} from 'node:fs';
const env=process.env,repo=env.GITHUB_REPOSITORY,pr=env.PR_NUMBER;if(!/^\d+$/.test(pr)||!/^[-\w]+\/[-\w]+$/.test(repo))throw Error('Invalid PR context');
const billing=existsSync('test-results/billing-preview.json')?JSON.parse(readFileSync('test-results/billing-preview.json','utf8')):{};
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const body=`<!-- learner-drive-preview -->
**Driving preview:** ${env.PREVIEW_URL}

Commit \`${sha}\`. Guest preview: lessons and browser-local JSON imports are available; no production account or payment access.

${billing.status==='ready'?`**Stripe sandbox:** ${billing.frontend} — test accounts and test cards only.`:`**Stripe sandbox:** ${billing.status||'not run'}. ${billing.missing?'Missing configuration: '+billing.missing.join(', '):'See workflow evidence.'}`}

The visual preview does not verify live billing. Production changes wait for review and merge.
`;
writeFileSync('test-results/preview-comment.md',body);
const rows=JSON.parse(execFileSync('gh',['api',`repos/${repo}/issues/${pr}/comments`],{encoding:'utf8'})),existing=rows.find(r=>r.user?.login==='github-actions[bot]'&&r.body?.startsWith('<!-- learner-drive-preview -->'));
// Use a structured JSON payload to preserve newlines and avoid shell interpolation.
const args=['api',...(existing?['--method','PATCH']:['--method','POST']),`repos/${repo}/issues/${existing?'comments/'+existing.id:pr+'/comments'}`,'--input','-'];
execFileSync('gh',args,{input:JSON.stringify({body}),stdio:['pipe','ignore','inherit']});
