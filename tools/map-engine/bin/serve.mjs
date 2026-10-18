#!/usr/bin/env node
// Static server for the rendered maps. node bin/serve.mjs [dir] [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
const dir = resolve(process.argv[2] || '.'), port = Number(process.argv[3] || 8077);
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  try {
    let p = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(dir)) { res.writeHead(403).end('no'); return; }
    if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`http://127.0.0.1:${port}/`));
