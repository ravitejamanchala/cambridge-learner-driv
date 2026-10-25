// Export a map's road markings to a file a person can adjust, and import them back (issue #4).
//   node tools/markings.mjs export data/cambridge.json > markings.json
//   node tools/markings.mjs import data/cambridge.json markings.json [--merge] [--write]
// Import prints what it would change; --write saves the map file (then run node tools/split_areas.mjs).
// --merge adds to the markings already there instead of replacing them: a road-inspector correction set
// (data/corrections) merges this way, skipping markings the map already has within 12 m.
import fs from 'node:fs';
import { exportMarkings, importMarkings } from '../js/marking-io.js';

const [cmd, mapFile, setFile] = process.argv.slice(2), flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
if (cmd === 'export' && mapFile) process.stdout.write(JSON.stringify(exportMarkings(JSON.parse(fs.readFileSync(mapFile))), null, 1) + '\n');
else if (cmd === 'import' && mapFile && setFile) {
  const d = JSON.parse(fs.readFileSync(mapFile)), { data, report } = importMarkings(d, JSON.parse(fs.readFileSync(setFile)), { merge: flags.has('--merge') });
  console.log(`${report.applied} applied, ${report.duplicates} skipped as already there, ${report.unmatched.length} not matched to a road`);
  for (const m of report.unmatched.slice(0, 20)) console.log(`  ${m.type} on ${m.edgeKey}: ${m.why}`);
  if (flags.has('--write')) { fs.writeFileSync(mapFile, JSON.stringify(data)); console.log(`wrote ${mapFile}`); }
} else { console.error('usage: node tools/markings.mjs export <map.json> | import <map.json> <markings.json> [--merge] [--write]'); process.exit(2); }
