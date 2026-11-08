import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readChromePageResult} from './chrome-page-result.mjs';

// Load the real renderer and its exact CDN imports; never connect to Firebase.
const renderer=await readFile(new URL('../ai-markdown.js',import.meta.url),'utf8');
const purifyUrl=renderer.match(/import DOMPurify from '([^']+)'/)?.[1];
if(!purifyUrl)throw Error('The renderer sanitizer import could not be identified.');
const entry=(await readFile(new URL('../tests/browser/markdown-security-entry.mjs',import.meta.url),'utf8')).replace("'@@PURIFY_URL@@'",JSON.stringify(purifyUrl));
const server=http.createServer((request,response)=>{
 const name=new URL(request.url,'http://localhost').pathname;
 response.setHeader('Cache-Control','no-store');
 if(name==='/'){response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><html><head><meta charset="utf-8"><title>Markdown security regression</title></head><body><div id="ai-chat-messages"></div><p id="packaged-smoke-result" data-result="pending">Checking Markdown…</p><script type="module" src="/test.js"></script></body></html>');}
 else if(name==='/test.js'||name==='/ai-markdown.js'){response.setHeader('Content-Type','application/javascript; charset=utf-8');response.end(name==='/test.js'?entry:renderer);}
 else{response.statusCode=404;response.end();}
});
const profile=await mkdtemp(path.join(os.tmpdir(),'kairos-markdown-chrome-'));
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const {markup,stderr}=await readChromePageResult({executable:process.env.CHROME_BIN||'google-chrome',profile,url:'http://127.0.0.1:'+server.address().port});
 if(!markup.includes('data-result="passed"'))throw Error(markup+'\n'+stderr);
 console.log(markup.replace(/<[^>]+>/g,''));
}finally{
 await new Promise(resolve=>server.close(resolve));
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
