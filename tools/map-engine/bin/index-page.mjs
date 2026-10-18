#!/usr/bin/env node
// Builds out/index.html: one row per area, showing how much of its speed data is guessed.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildNet } from '../src/net.mjs';
const [dir, out = 'out/index.html'] = process.argv.slice(2);
const rows = readdirSync(dir).filter(n => /^a\d+\.json$/.test(n))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
  .map(f => {
    const n = buildNet(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
    const as = n.ways.filter(w => w.assumed).length;
    return { id: f.replace('.json', ''), ways: n.ways.length, assumed: as, pct: Math.round(as * 100 / n.ways.length) };
  });
const tot = rows.reduce((a, r) => a + r.ways, 0), ta = rows.reduce((a, r) => a + r.assumed, 0);
const tr = r => `<tr><td><a href="${r.id}.html">${r.id}</a></td><td>${r.ways}</td><td>${r.assumed} (${r.pct}%)</td><td><i class="bar" style="width:${r.pct * 2.4}px"></i></td></tr>`;
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Cambridge — limit provenance</title>
<style>
 :root{--bg:#11140f;--ink:#e8e6e1;--muted:#8a8f87;--known:#38cbb9;--assumed:#e5484d}
 body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 ui-sans-serif,system-ui,sans-serif;padding:28px 32px}
 h1{font-size:19px;margin:0 0 4px} p{color:var(--muted);margin:0 0 22px;max-width:60ch}
 table{border-collapse:collapse;min-width:520px}
 td,th{padding:7px 16px 7px 0;text-align:left;border-bottom:1px solid #222620}
 th{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600}
 a{color:var(--known);text-decoration:none} a:hover{text-decoration:underline}
 .bar{display:inline-block;height:7px;border-radius:4px;background:var(--assumed);vertical-align:middle}
 .tot td{border-top:2px solid #333;border-bottom:none;font-weight:650}
</style>
<h1>Cambridge &middot; speed limit provenance</h1>
<p>Red is a limit the map guessed from road class rather than read from OpenStreetMap. The examiner currently marks speed faults on these the same as on known limits.</p>
<table><tr><th>Area</th><th>Ways</th><th>Assumed</th><th></th></tr>
${rows.map(tr).join('\n')}
<tr class="tot"><td>all</td><td>${tot}</td><td>${ta} (${Math.round(ta * 100 / tot)}%)</td><td></td></tr></table>`);
console.log(`${out}  ${rows.length} areas, ${ta}/${tot} assumed (${Math.round(ta * 100 / tot)}%)`);
