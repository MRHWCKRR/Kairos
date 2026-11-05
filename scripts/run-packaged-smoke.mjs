import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildCloudflare} from '../cloudflare/build.js';
import {startPackagedServer} from './packaged-smoke-server.mjs';
import {readChromePageResult} from './chrome-page-result.mjs';
import {createNetworkJourneyDriver} from './chrome-network-journey.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await buildCloudflare();
for(const scenario of ['planner','missing-module','single-tab','missing-tab-guard','offline','durable-recovery']) {
 const broken=scenario==='missing-module';
 const server=await startPackagedServer({directory:path.join(root,'dist'),blockedAsset:broken?'schedule-inspector.js':scenario==='missing-tab-guard'?'app-single-tab.js':null});
 const profile=await mkdtemp(path.join(os.tmpdir(),'kairos-packaged-chrome-'));
 try {
  const durable=scenario==='durable-recovery',target=durable?'/__recovery.html':scenario==='offline'?'/__offline.html':scenario==='single-tab'?'/__single-tab.html':scenario==='missing-tab-guard'?'/__single-tab.html?guard-missing=1':'/__smoke.html'+(broken?'?fail=1':'');
  if(scenario==='single-tab'||scenario==='missing-tab-guard'||scenario==='offline'||durable){
   const network=(scenario==='offline'||durable)?createNetworkJourneyDriver(server):null;
   const {markup,stderr,reopened}=await readChromePageResult({executable:process.env.CHROME_BIN||'google-chrome',profile,url:server.url+target,onPoll:network?async args=>{await network(args);if(durable){const value=await args.send('Runtime.evaluate',{expression:'document.documentElement.dataset.reopen',returnByValue:true},args.sessionId);if(value.result?.value==='true')return {reopen:true};}}:undefined});
   if(!markup.includes('data-result="passed"'))throw Error(markup+'\n'+stderr.slice(-2000));
   if(durable&&reopened<3)throw Error('Durable recovery must close and reopen the real document three times.');
   if(scenario==='offline'&&server.requests.filter(name=>name==='/__offline.html').length<3)throw Error('Offline journey must reload the real document twice.');
   console.log(markup.replace(/<[^>]+>/g,''));continue;
  }
  const browser=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+profile,'--virtual-time-budget=20000','--dump-dom',server.url+target],{windowsHide:true});
  let stdout='',stderr='';browser.stdout.on('data',chunk=>{stdout+=chunk;});browser.stderr.on('data',chunk=>{stderr+=chunk;});
  const timer=setTimeout(()=>browser.kill(),45000);
  const status=await new Promise((resolve,reject)=>{browser.once('error',reject);browser.once('close',resolve);}).finally(()=>clearTimeout(timer));
  const result=stdout.match(/<p[^>]*id="packaged-smoke-result"[^>]*>[\s\S]*?<\/p>/)?.[0];
  if(status!==0||!result?.includes('data-result="passed"'))throw Error((result||'Packaged browser smoke did not complete')+'\n'+stderr.slice(-2000));
  if(scenario==='planner'&&server.requests.filter(name=>name==='/__smoke.html').length<3)throw Error('Packaged persistence journey did not reload the real document twice.');
  console.log(result.replace(/<[^>]+>/g,''));
 } finally {
  await server.close();
  // profile is a freshly created task-owned directory, never a user browser profile.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'kairos-packaged-chrome-'))await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}
