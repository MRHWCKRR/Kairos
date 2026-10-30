import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildCloudflare} from '../cloudflare/build.js';
import {startPackagedServer} from './packaged-smoke-server.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await buildCloudflare();
for(const broken of [false,true]) {
 const server=await startPackagedServer({directory:path.join(root,'dist'),blockedAsset:broken?'schedule-inspector.js':null});
 const profile=await mkdtemp(path.join(os.tmpdir(),'kairos-packaged-chrome-'));
 try {
  const browser=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+profile,'--virtual-time-budget=20000','--dump-dom',server.url+'/__smoke.html'+(broken?'?fail=1':'')],{windowsHide:true});
  let stdout='',stderr='';browser.stdout.on('data',chunk=>{stdout+=chunk;});browser.stderr.on('data',chunk=>{stderr+=chunk;});
  const timer=setTimeout(()=>browser.kill(),45000);
  const status=await new Promise((resolve,reject)=>{browser.once('error',reject);browser.once('close',resolve);}).finally(()=>clearTimeout(timer));
  const result=stdout.match(/<p[^>]*id="packaged-smoke-result"[^>]*>[\s\S]*?<\/p>/)?.[0];
  if(status!==0||!result?.includes('data-result="passed"'))throw Error((result||'Packaged browser smoke did not complete')+'\n'+stderr.slice(-2000));
  if(!broken&&server.requests.filter(name=>name==='/__smoke.html').length<3)throw Error('Packaged persistence journey did not reload the real document twice.');
  console.log(result.replace(/<[^>]+>/g,''));
 } finally {
  await server.close();
  // profile is a freshly created task-owned directory, never a user browser profile.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'kairos-packaged-chrome-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
