#!/usr/bin/env node
// Snaps fetched Mapillary features onto an area's roads and reports what it would change.
//   node bin/snap-report.mjs <area.json> <features.json> [snapped-out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { buildNet } from '../src/net.mjs';
import { snapFeatures, speedFixes } from '../src/snap.mjs';

const [areaPath, featPath, outPath] = process.argv.slice(2);
if (!areaPath || !featPath) { console.error('usage: snap-report.mjs <area.json> <features.json> [out.json]'); process.exit(1); }

const net = buildNet(JSON.parse(readFileSync(areaPath, 'utf8')));
const raw = JSON.parse(readFileSync(featPath, 'utf8'));
const feats = raw.features || raw;
const { snapped, skipped } = snapFeatures(net, feats);
const fixes = speedFixes(net, snapped);

const assumed = net.ways.filter(w => w.assumed).length;
const fixedAssumed = fixes.filter(f => f.wasAssumed).length;
const conflicts = fixes.filter(f => f.conflict);

console.log(`area            ${net.area?.id ?? '?'}   ${net.ways.length} ways, ${assumed} assumed (${Math.round(assumed*100/net.ways.length)}%)`);
console.log(`features in     ${feats.length}`);
console.log(`snapped         ${snapped.length}`);
console.log(`  skipped       unparsed ${skipped.unparsed}, too far ${skipped.far}, ambiguous ${skipped.ambiguous}`);
console.log(`speed signs     ${snapped.filter(s => s.sign.kind === 'speed').length} on ${fixes.length} ways`);
console.log(`ASSUMED FIXED   ${fixedAssumed} of ${assumed}  (${assumed ? Math.round(fixedAssumed*100/assumed) : 0}% of the guesswork removed)`);
console.log(`conflicts       ${conflicts.length}  (OSM says one limit, the sign says another — needs a human)`);
for (const c of conflicts.slice(0, 10)) console.log(`   ${String(c.name||'(unnamed)').slice(0,34).padEnd(34)} OSM ${c.oldMph} vs sign ${c.newMph} (${c.votes}/${c.total})`);
if (outPath) { writeFileSync(outPath, JSON.stringify({ snapped, fixes }, null, 1)); console.log(`\nwrote ${outPath}`); }
