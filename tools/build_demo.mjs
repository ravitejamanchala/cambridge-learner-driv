// Demo build: one minified script with no comments, cleaned data headers. Source stays readable in the project.
import { execFileSync } from 'node:child_process';
import { LESSONS } from '../js/course.js';
import fs from 'fs'; import path from 'path'; import { build } from 'esbuild';
const SRC = process.argv[2], OUT = process.argv[3];
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'data/areas'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
await build({ entryPoints: [path.join(SRC, 'js/main.js')], bundle: true, minify: true, format: 'esm', legalComments: 'none', target: 'es2019', outfile: path.join(OUT, 'app.js') });
let sourceCommit = null, sourceDirty = null;
try {
  sourceCommit = execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sourceDirty = !!execFileSync('git', ['-C', SRC, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch (_) { /* A source archive may not contain Git metadata. */ }
const assetVersion = sourceCommit || String(Date.now());
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace('<script type="module" src="js/main.js"></script>', '<script type="module" src="app.js?v=' + assetVersion + '"></script>');
html = html.replace('<head>', '<head><meta name="app-release" content="' + assetVersion + '">');
html = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
for (const f of fs.readdirSync(path.join(SRC, 'data/areas'))) {
  const d = JSON.parse(fs.readFileSync(path.join(SRC, 'data/areas', f), 'utf8'));
  if (f === 'index.json') delete d.source; else d.source = d.source === 'Practice layout' ? 'Practice layout' : '© OpenStreetMap contributors (ODbL)';
  fs.writeFileSync(path.join(OUT, 'data/areas', f), JSON.stringify(d));
}
for (const f of fs.readdirSync(path.join(SRC, 'models'))) fs.copyFileSync(path.join(SRC, 'models', f), path.join(OUT, 'models', f));
console.log('built', fs.statSync(path.join(OUT, 'app.js')).size, 'bytes');

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'release.json'), JSON.stringify({ sourceCommit, sourceDirty, lessons: LESSONS.length }));
