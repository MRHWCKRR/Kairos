import {spawn} from 'node:child_process';

// Native Web Locks use browser IPC. Virtual-time dump-dom may finish before IPC
// settles, so these journeys wait on their actual result using an isolated pipe.
export async function readChromePageResult({executable,profile,url,timeoutMs=45000,pollMs=100,spawnImpl=spawn}){
 const browser=spawnImpl(executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--user-data-dir='+profile,'--remote-debugging-pipe'],{stdio:['ignore','pipe','pipe','pipe','pipe'],windowsHide:true});
 let serial=0,buffer='',stderr='',closed=false;const pending=new Map(),deadline=Date.now()+timeoutMs;
 const rejectAll=error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();};
 browser.stdout?.resume();browser.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
 browser.once('error',rejectAll);browser.once('close',()=>{closed=true;rejectAll(Error('Chrome exited before the journey completed.'));});
 browser.stdio[3].on('error',rejectAll);browser.stdio[4].setEncoding('utf8');
 browser.stdio[4].on('error',rejectAll);
 browser.stdio[4].on('data',chunk=>{
  buffer+=chunk.toString();let index;
  while((index=buffer.indexOf('\0'))>=0){
   const raw=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!raw)continue;
   let message;try{message=JSON.parse(raw);}catch{rejectAll(Error('Invalid Chrome protocol response.'));continue;}
   const entry=pending.get(message.id);if(!entry)continue;clearTimeout(entry.timer);pending.delete(message.id);
   if(message.error)entry.reject(Error(message.error.message));else entry.resolve(message.result);
  }
 });
 function send(method,params={},sessionId,limit=Math.min(5000,Math.max(1,deadline-Date.now()))){
  if(closed)return Promise.reject(Error('Chrome exited before the journey completed.'));
  return new Promise((resolve,reject)=>{
   const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Chrome command timed out: '+method));},limit);pending.set(id,{resolve,reject,timer});
   browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0',error=>{if(error){clearTimeout(timer);pending.delete(id);reject(error);}});
  });
 }
 try{
  await send('Browser.getVersion');const {targetId}=await send('Target.createTarget',{url});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  while(Date.now()<deadline){
   try{
    const value=await send('Runtime.evaluate',{expression:'document.querySelector("#packaged-smoke-result")?.outerHTML',returnByValue:true},sessionId),markup=value.result?.value;
    if(typeof markup==='string'&&/data-result="(?:passed|failed)"/.test(markup))return {markup,stderr};
   }catch(error){if(!/execution context|cannot find context/i.test(error.message))throw error;}
   await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw Error('Chrome journey deadline exceeded. '+stderr.slice(-1000));
 }finally{
  if(!closed)try{await send('Browser.close',{},undefined,1000);}catch{}
  if(!closed)await new Promise(resolve=>{const timer=setTimeout(resolve,1000);browser.once('close',()=>{clearTimeout(timer);resolve();});});
  if(!closed){browser.kill();await new Promise(resolve=>{const timer=setTimeout(resolve,1000);browser.once('close',()=>{clearTimeout(timer);resolve();});});}
  rejectAll(Error('Chrome journey closed.'));
 }
}
