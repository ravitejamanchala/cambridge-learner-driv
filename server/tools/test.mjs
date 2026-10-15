import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['src/app.ts','src/store.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outdir:'.test-build',outExtension:{'.js':'.mjs'}});
const r=spawnSync(process.execPath,['--test',...readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)],{stdio:'inherit'});process.exitCode=r.status ?? 1;
