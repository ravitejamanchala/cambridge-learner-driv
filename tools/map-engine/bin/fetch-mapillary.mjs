#!/usr/bin/env node
// Pulls Mapillary map features for an area's bounding box. Run this on your own machine:
// the Graph API returns GeoJSON directly, so there is no vector-tile decoding to do.
//   MAPILLARY_TOKEN=MLY|... node bin/fetch-mapillary.mjs <area.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { buildNet } from '../src/net.mjs';
import { projector } from '../src/project.mjs';

const TOKEN = process.env.MAPILLARY_TOKEN;
const [areaPath, outPath = 'features.json'] = process.argv.slice(2);
if (!TOKEN || !areaPath) { console.error('usage: MAPILLARY_TOKEN=... fetch-mapillary.mjs <area.json> [out.json]'); process.exit(1); }

const net = buildNet(JSON.parse(readFileSync(areaPath, 'utf8')));
const P = projector(net);

// Area extent in local metres -> lon/lat, padded so signs just outside still snap in.
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const e of net.edges) for (let i = 0; i < e.n; i++) {
  x0 = Math.min(x0, e.px[i]); x1 = Math.max(x1, e.px[i]);
  z0 = Math.min(z0, e.pz[i]); z1 = Math.max(z1, e.pz[i]);
}
const pad = 50;
const [wLon, sLat] = P.toWgs(x0 - pad, z1 + pad);
const [eLon, nLat] = P.toWgs(x1 + pad, z0 - pad);
const bbox = [wLon, sLat, eLon, nLat].map(v => v.toFixed(6)).join(',');

// Mapillary caps features per request, so walk the bbox in a grid of smaller boxes.
const STEPS = Number(process.env.GRID || 6);
const out = new Map();
for (let i = 0; i < STEPS; i++) for (let j = 0; j < STEPS; j++) {
  const lo = wLon + (eLon - wLon) * i / STEPS, hi = wLon + (eLon - wLon) * (i + 1) / STEPS;
  const bo = sLat + (nLat - sLat) * j / STEPS, to = sLat + (nLat - sLat) * (j + 1) / STEPS;
  const url = `https://graph.mapillary.com/map_features?fields=id,object_value,geometry&bbox=${lo},${bo},${hi},${to}&limit=2000`;
  const r = await fetch(url, { headers: { Authorization: `OAuth ${TOKEN}` } });
  if (!r.ok) { console.error(`  tile ${i},${j}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`); continue; }
  const j2 = await r.json();
  for (const f of j2.data || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    if (lon == null) continue;
    out.set(f.id, { id: f.id, lon, lat, value: f.object_value, seenCount: 1 });
  }
  process.stderr.write(`\r  fetched ${out.size} features (${i * STEPS + j + 1}/${STEPS * STEPS} boxes)`);
}
process.stderr.write('\n');
writeFileSync(outPath, JSON.stringify({ bbox, features: [...out.values()] }, null, 1));
console.log(`${outPath}  ${out.size} features  bbox ${bbox}`);
