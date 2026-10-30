import fs from 'node:fs/promises';
import path from 'node:path';
import {Dataset} from '../../js/world-data/dataset.js';
import {auditCity} from '../../js/world-data/accuracy-audit.js';

if(process.argv[1]?.endsWith('/accuracy-audit.mjs')&&process.argv[2]){
 const dir=path.resolve(process.argv[2]),reader=new Dataset('http://dataset/index.json',{fetcher:async url=>new Response(await fs.readFile(path.join(dir,new URL(url).pathname.slice(1))))});
 const report=await auditCity(reader);const out=process.argv[3]||'test-results/world/accuracy-audit.json';await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({coverage:report.coverage.checkedTiles,stats:report.stats,mappedDetails:report.mappedDetails,accepted:report.accepted}));
}
