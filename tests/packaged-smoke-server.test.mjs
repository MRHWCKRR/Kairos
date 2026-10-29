import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startPackagedServer} from '../scripts/packaged-smoke-server.mjs';
test('packaged smoke serves real asset bytes, blocks missing modules and never falls back to HTML for JS',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'kairos-packaged-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(path.join(directory,'app.html'),'<html><head></head><body><script src="app-bootstrap.js?v=0123456789abcdef"></script></body></html>');
 await writeFile(path.join(directory,'leaf.js'),'export const value=1;');
 const server=await startPackagedServer({directory,blockedAsset:'blocked.js'});t.after(()=>server.close());
 const request=url=>new Promise(resolve=>{const headers=new Map(),response={statusCode:200,setHeader:(key,value)=>headers.set(key.toLowerCase(),value),end:body=>resolve({status:response.statusCode,headers,text:()=>String(body)})};void server.handleRequest({url},response);});
 const asset=await request('/leaf.js?v=0123456789abcdef');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);assert.equal(asset.text(),'export const value=1;');
 for(const file of ['blocked.js','missing.js']){const response=await request('/'+file);assert.equal(response.status,404);assert.doesNotMatch(response.text(),/<html/);}
 const shell=(await request('/__smoke.html')).text();assert.match(shell,/packaged-smoke-result/);assert.doesNotMatch(shell,/<script src="app-bootstrap/);
});
