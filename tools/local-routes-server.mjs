// node --use-env-proxy tools/local-routes-server.mjs [static-directory] [port]
import {createServer} from 'node:http';import {resolve,extname,sep} from 'node:path';import {readFile} from 'node:fs/promises';
import {handleMapRequest} from '../server/map/handler.js';
const root=resolve(process.argv[2]||'.'),port=Number(process.argv[3]||8000);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(url.pathname.startsWith('/map-api/')){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2048){res.writeHead(413);res.end();return;}chunks.push(chunk);}const response=await handleMapRequest(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),process.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
 const path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}const file=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(file);
 }catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Route preview: http://127.0.0.1:${port}`));
