import {billingPreviewConfig} from './preview-config.mjs';
// Demo build: one minified script with no comments, cleaned data headers. Source stays readable in the project.
import { execFileSync } from 'node:child_process';
import { VISIBLE_LESSONS as LESSONS } from '../js/course-menu.js';
import {PUZZLES} from '../js/puzzles.js';
import fs from 'fs'; import path from 'path'; import { build } from 'esbuild';
const SRC = process.argv[2], OUT = process.argv[3];
const billingPreview=process.argv.includes('--billing-preview');
if(['--preview','--billing-preview','--pages-preview'].filter(f=>process.argv.includes(f)).length>1)throw Error('Choose one preview mode');
const billingConfig=billingPreview?billingPreviewConfig(process.env):null;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'data/areas'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
await build({ entryPoints: {app:path.join(SRC, 'js/main.js')}, bundle: true, minify: true, format: 'esm', legalComments: 'none', target: 'es2019', splitting:true, entryNames:'[name]', chunkNames:'chunks/[name]-[hash]', outdir:OUT });
await build({entryPoints:[path.join(SRC,'js/personal/generator-worker.js')],bundle:true,minify:true,format:'esm',target:'es2022',outfile:path.join(OUT,'personal-worker.js')});
await build({entryPoints:[path.join(SRC,'server/map/pages-worker.js')],bundle:true,minify:true,format:'esm',target:'es2022',outfile:path.join(OUT,'_worker.js')});
fs.writeFileSync(path.join(OUT,'_routes.json'),JSON.stringify({version:1,include:['/map-api/*'],exclude:[]}));
for(const file of ['js/vendor/leaflet.css','js/personal/routes.css','js/responsive-panels.css']){fs.mkdirSync(path.dirname(path.join(OUT,file)),{recursive:true});fs.copyFileSync(path.join(SRC,file),path.join(OUT,file));}
let sourceCommit = null, sourceDirty = null;
try {
  sourceCommit = execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sourceDirty = !!execFileSync('git', ['-C', SRC, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch (_) { /* A source archive may not contain Git metadata. */ }
const assetVersion = sourceCommit || String(Date.now());
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace('<script type="module" src="js/main.js"></script>', '<script type="module" src="app.js?v=' + assetVersion + '"></script>');
html = html.replace('<head>', '<head><meta name="app-release" content="' + assetVersion + '">');
html = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
html=html.replace('src="auth-config.js"','src="auth-config.js?v='+assetVersion+'"');
// A preview build is for reviewing a pull request on its own Cloudflare branch URL. It must never be
// mistaken for production, so the lobby carries a small label saying what it is and which commit.
const preview = process.argv.includes('--preview') || billingPreview;
if (preview) html = html.replace('</body>', '<div class="preview-tag">Preview build · ' + (sourceCommit || 'local').slice(0, 7) + '</div><style>.preview-tag{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:50;padding:4px 10px;border-radius:999px;background:#1d2b3a;color:#ffd166;font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none}body:not([data-mode=lobby]) .preview-tag{display:none}</style></body>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
for (const f of fs.readdirSync(path.join(SRC, 'data/areas'))) {
  const d = JSON.parse(fs.readFileSync(path.join(SRC, 'data/areas', f), 'utf8'));
  if (f === 'index.json') delete d.source; else d.source = d.source === 'Practice layout' ? 'Practice layout' : '© OpenStreetMap contributors (ODbL)';
  fs.writeFileSync(path.join(OUT, 'data/areas', f), JSON.stringify(d));
}
for (const f of fs.readdirSync(path.join(SRC, 'models'))) if(fs.statSync(path.join(SRC,'models',f)).isFile()) fs.copyFileSync(path.join(SRC, 'models', f), path.join(OUT, 'models', f));
console.log('built', fs.statSync(path.join(OUT, 'app.js')).size, 'bytes');

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'release.json'), JSON.stringify({ sourceCommit, sourceDirty, lessons: LESSONS.length+PUZZLES.length }));

// The Pages JSON sandbox (--pages-preview) authors routes in the browser with no account service; a
// pull-request preview (--preview) runs as a guest with the whole course open; production copies the
// committed account configuration. The production sign-in key is bound to the production domain and
// would leave either of the others stuck at the sign-in gate, and nothing they do reaches an account.
if (process.argv.includes('--pages-preview')) {
  fs.cpSync(path.join(SRC, 'examples/cambridge-pilot'), path.join(OUT, 'examples/cambridge-pilot'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'auth-config.js'),'window.LEARNER_CONFIG={BROWSER_AUTHORING:true};');
} else if(billingPreview)fs.writeFileSync(path.join(OUT,'auth-config.js'),'window.LEARNER_CONFIG='+JSON.stringify(billingConfig)+';\n');
else if(preview)fs.writeFileSync(path.join(OUT,'auth-config.js'),'window.LEARNER_CONFIG={"PREVIEW":true};\n');
else fs.copyFileSync(path.join(SRC, 'auth-config.js'), path.join(OUT, 'auth-config.js'));

fs.copyFileSync(path.join(SRC,'js/vendor/THIRD-PARTY-LICENSES.txt'),path.join(OUT,'THIRD-PARTY-LICENSES.txt'));

// Isolated worker for the one kilometre mode inside My routes.
await build({entryPoints:[path.join(SRC,'js/tile-builder/worker.js')],bundle:true,minify:true,format:'esm',target:'es2022',outfile:path.join(OUT,'tile-worker.js')});
