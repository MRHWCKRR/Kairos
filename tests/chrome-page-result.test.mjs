import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
let run;try{({readChromePageResult:run}=await import('../scripts/chrome-page-result.mjs'));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
function fixture({pending=false,closeDelay=0}={}){
 let polls=0,killed=false,args;const browser=new EventEmitter();browser.stderr=new PassThrough();browser.stdio=[null,null,browser.stderr,null,new PassThrough()];browser.kill=()=>{killed=true;queueMicrotask(()=>browser.emit('close',0));};
 browser.stdio[3]=new Writable({write(data,_encoding,done){for(const raw of String(data).split('\0').filter(Boolean)){const message=JSON.parse(raw);let result={};if(message.method==='Target.createTarget')result={targetId:'target'};if(message.method==='Target.attachToTarget')result={sessionId:'session'};if(message.method==='Runtime.evaluate'){polls++;result={result:{value:'<p id="packaged-smoke-result" data-result="'+(pending||polls<2?'pending':'passed')+'">Result</p>'}};}queueMicrotask(()=>browser.stdio[4].write(JSON.stringify({id:message.id,result})+'\0'));if(message.method==='Browser.close'){if(closeDelay)setTimeout(()=>browser.emit('close',0),closeDelay);else queueMicrotask(()=>browser.emit('close',0));}}done();}});
 return {spawnImpl:(_exe,flags)=>{args=flags;return browser},get polls(){return polls},get killed(){return killed},get args(){return args}};
}
test('Chrome result waits for actual completion without an accelerated clock',async()=>{
 assert.equal(typeof run,'function','real-time Chrome completion reader must exist');const f=fixture();const result=await run({executable:'chrome',profile:'fixture-profile',url:'http://localhost/fixture',timeoutMs:1000,pollMs:1,spawnImpl:f.spawnImpl});assert.match(result.markup,/data-result="passed"/);assert.equal(f.polls,2);assert.ok(f.args.includes('--remote-debugging-pipe'));assert.ok(!f.args.some(arg=>arg.startsWith('--virtual-time-budget')));
});
test('an unfinished native browser journey fails its deadline instead of passing',async()=>{
 assert.equal(typeof run,'function');const f=fixture({pending:true});await assert.rejects(run({executable:'chrome',profile:'fixture-profile',url:'http://localhost/fixture',timeoutMs:100,pollMs:1,spawnImpl:f.spawnImpl}),/deadline|timed out/i);
});
test('Chrome is allowed to finish graceful shutdown before profile cleanup',async()=>{
 const f=fixture({closeDelay:10});await run({executable:'chrome',profile:'fixture-profile',url:'http://localhost/fixture',timeoutMs:1000,pollMs:1,spawnImpl:f.spawnImpl});assert.equal(f.killed,false,'do not interrupt Chrome while its profile is closing');
});
