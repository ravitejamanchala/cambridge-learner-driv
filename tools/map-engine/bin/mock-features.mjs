#!/usr/bin/env node
// Makes a plausible Mapillary-shaped feature file from an area, for testing the pipeline
// before you have a token. Signs are placed beside real roads at real-ish offsets.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildNet } from '../src/net.mjs';
import { projector } from '../src/project.mjs';
const [areaPath, outPath = 'mock-features.json', frac = '0.5'] = process.argv.slice(2);
const net = buildNet(JSON.parse(readFileSync(areaPath, 'utf8')));
const P = projector(net);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const feats = [];
for (const e of net.edges) {
  if (rnd() > Number(frac)) continue;
  const i = Math.floor((e.n - 1) / 2);
  const ax = e.px[i], az = e.pz[i], bx = e.px[i+1], bz = e.pz[i+1];
  const L = Math.hypot(bx-ax, bz-az) || 1, tx = (bx-ax)/L, tz = (bz-az)/L;
  const off = 2.5 + rnd() * 2, side = rnd() < .5 ? 1 : -1;
  const x = (ax+bx)/2 + side*-tz*off, z = (az+bz)/2 + side*tx*off;
  const [lon, lat] = P.toWgs(x, z);
  // Mostly the true limit; a few deliberate disagreements so conflict handling is exercised.
  const mph = rnd() < 0.06 ? (e.way.mph === 30 ? 20 : 30) : e.way.mph;
  feats.push({ id: `m${e.id}`, lon, lat, value: `regulatory--maximum-speed-limit-${mph}--g1`, seenCount: 1 + Math.floor(rnd()*5) });
}
writeFileSync(outPath, JSON.stringify({ features: feats }, null, 1));
console.log(`${outPath}  ${feats.length} mock features`);
