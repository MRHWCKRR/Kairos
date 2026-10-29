import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

export async function startPackagedServer({directory,blockedAsset=null}) {
 directory=path.resolve(directory);
 const original=await readFile(path.join(directory,'app.html'),'utf8');
 const version=original.match(/app-bootstrap\.js\?v=([a-f0-9]{16})/)?.[1];
 if(!version)throw Error('Build the app before running packaged smoke checks.');
 const entry=(await readFile(new URL('../tests/browser/packaged-smoke-entry.mjs',import.meta.url),'utf8')).replaceAll('@@VERSION@@',version);
 const shell=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*href=["']https?:[^>]*>/gi,'')
  .replace('</body>','<p id="packaged-smoke-result" data-result="pending">Starting packaged smoke.</p><script type="module" src="/__smoke.js"></script></body>');
 const requests=[];
 const handleRequest=async(request,response)=>{
  try {
   const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);requests.push(name);
   response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
   if(name==='/__smoke.html'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end(shell);return;}
   if(name==='/__smoke.js'){response.setHeader('Content-Type','application/javascript; charset=utf-8');response.end(entry);return;}
   const target=path.resolve(directory,'.'+name);
   if(!target.startsWith(directory+path.sep)||name.slice(1)===blockedAsset||!(await stat(target)).isFile())throw Error('Missing asset');
   const type=target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':target.endsWith('.html')?'text/html':'application/octet-stream';
   response.setHeader('Content-Type',type);response.end(await readFile(target));
  }catch{response.statusCode=404;response.setHeader('Content-Type','text/plain');response.end('Asset unavailable');}
 };
 const server=http.createServer(handleRequest);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const address=server.address();
 return {url:'http://127.0.0.1:'+address.port,requests,handleRequest,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
