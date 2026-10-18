#!/usr/bin/env node
// Draws an area file as an SVG map: roads coloured by whether their speed limit is
// known or assumed, with any snapped Mapillary signs plotted on top. Open it locally.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildNet } from '../src/net.mjs';

const [areaPath, outPath = 'render.html', featPath] = process.argv.slice(2);
if (!areaPath) { console.error('usage: render.mjs <area.json> [out.html] [snapped.json]'); process.exit(1); }

const net = buildNet(JSON.parse(readFileSync(areaPath, 'utf8')));
const signs = featPath ? JSON.parse(readFileSync(featPath, 'utf8')).snapped || [] : [];

let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
for (const e of net.edges) for (let i = 0; i < e.n; i++) {
  if (e.px[i] < x0) x0 = e.px[i]; if (e.px[i] > x1) x1 = e.px[i];
  if (e.pz[i] < z0) z0 = e.pz[i]; if (e.pz[i] > z1) z1 = e.pz[i];
}
const W = 1400, pad = 20, sc = (W - 2 * pad) / (x1 - x0), H = Math.round((z1 - z0) * sc + 2 * pad);
const X = v => (pad + (v - x0) * sc).toFixed(1), Y = v => (pad + (v - z0) * sc).toFixed(1);

const paths = { assumed: [], known: [] };
for (const e of net.edges) {
  let d = `M${X(e.px[0])} ${Y(e.pz[0])}`;
  for (let i = 1; i < e.n; i++) d += `L${X(e.px[i])} ${Y(e.pz[i])}`;
  paths[e.way.assumed ? 'assumed' : 'known'].push(d);
}
const nAssumed = net.ways.filter(w => w.assumed).length;
const pct = Math.round(nAssumed * 100 / net.ways.length);

writeFileSync(outPath, `<!doctype html><meta charset="utf-8">
<title>${net.area?.id || 'area'} — limit coverage</title>
<style>
 :root{--bg:#11140f;--known:#38cbb9;--assumed:#e5484d;--ink:#e8e6e1;--muted:#8a8f87}
 body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
 header{padding:14px 20px;display:flex;gap:22px;align-items:baseline;flex-wrap:wrap;border-bottom:1px solid #262a22}
 h1{margin:0;font-size:16px;font-weight:650}
 .k{display:flex;align-items:center;gap:7px;color:var(--muted)}
 .sw{width:16px;height:3px;border-radius:2px;display:inline-block}
 b{color:var(--ink)}
 svg{display:block;width:100%;height:auto}
</style>
<header>
 <h1>${net.area?.id || 'area'} &middot; speed limit provenance</h1>
 <span class="k"><i class="sw" style="background:var(--known)"></i> tagged in OSM &nbsp;<b>${net.ways.length - nAssumed}</b></span>
 <span class="k"><i class="sw" style="background:var(--assumed)"></i> assumed from road class &nbsp;<b>${nAssumed} (${pct}%)</b></span>
 ${signs.length ? `<span class="k"><i class="sw" style="background:#ffc23d;height:9px;width:9px;border-radius:50%"></i> Mapillary sign &nbsp;<b>${signs.length}</b></span>` : ''}
</header>
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g stroke="var(--known)" stroke-width="1.15" fill="none" stroke-linecap="round" opacity=".85">
  ${paths.known.map(d => `<path d="${d}"/>`).join('')}
 </g>
 <g stroke="var(--assumed)" stroke-width="1.15" fill="none" stroke-linecap="round" opacity=".9">
  ${paths.assumed.map(d => `<path d="${d}"/>`).join('')}
 </g>
 ${signs.map(s => `<circle cx="${X(s.x)}" cy="${Y(s.z)}" r="3" fill="#ffc23d"><title>${s.sign?.mph ?? ''} mph — ${String(s.wayName || '').replace(/[<>&]/g, '')}</title></circle>`).join('')}
</svg>`);
console.log(`${outPath}  ${net.edges.length} edges, ${net.ways.length} ways, ${nAssumed} assumed (${pct}%), ${signs.length} signs`);
