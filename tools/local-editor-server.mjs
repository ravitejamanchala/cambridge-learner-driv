// Explicit opt-in loopback server. No production APIs, credentials or learner data writes.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { inspectTrack } from '../js/editor-track.js';
export async function startLocalServer({port=8000,root=process.cwd(),store=path.join(root,'.local-tracks')}={}){
 await fs.mkdir(store,{recursive:true});
 const server=http.createServer(async(req,res)=>{
  const send=(status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
  try {
   const expected=`127.0.0.1:${server.address().port}`;
   if(![expected,`localhost:${server.address().port}`].includes(req.headers.host))return send(403,{error:'Loopback host required'});
   if(req.headers.origin && ![`http://${expected}`,`http://localhost:${server.address().port}`].includes(req.headers.origin))return send(403,{error:'Same-origin request required'});
   const pathname=new URL(req.url,`http://${expected}`).pathname;
   if(pathname==='/__local/tracks'){
    if(req.method==='GET'){
     const entries=[];for(const name of (await fs.readdir(store)).sort()){if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;entries.push(JSON.parse(await fs.readFile(path.join(store,name),'utf8')));}
     return send(200,entries);
    }
    if(req.method!=='POST')return send(405,{error:'Method not allowed'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)return send(413,{error:'JSON exceeds 8 MB'});chunks.push(chunk);}
    const track=JSON.parse(Buffer.concat(chunks).toString()),meta=inspectTrack(track),id=randomUUID();
    const entry={id,savedAt:new Date().toISOString(),track,meta};
    const tmp=path.join(store,id+'.tmp');await fs.writeFile(tmp,JSON.stringify(entry,null,2),{flag:'wx'});await fs.rename(tmp,path.join(store,id+'.json'));
    return send(201,{id,meta});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Method not allowed'});
   if(pathname==='/auth-config.js')return send(200,'window.LEARNER_CONFIG={LOCAL_AUTHORING:true};','application/javascript');
   const relative=decodeURIComponent(pathname).replace(/^\/+/, '')||'index.html';
   if(relative.split('/').some(p=>p.startsWith('.'))||relative==='tools'||relative.startsWith('tools/')||relative.startsWith('server/'))return send(404,{error:'Not found'});
   const file=path.resolve(root,relative),real=await fs.realpath(file);
   if(!real.startsWith(path.resolve(root)+path.sep))return send(403,{error:'Forbidden'});
   const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
   return send(200,await fs.readFile(real),types[path.extname(real)]||'application/octet-stream');
  }catch(error){return send(error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'Not found':error.message});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const server=await startLocalServer({port:Number(process.env.PORT||8000)});console.log(`Local mock editor: http://127.0.0.1:${server.address().port}`);}
