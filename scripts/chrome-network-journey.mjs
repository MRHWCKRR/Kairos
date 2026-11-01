// Test driver only. Transport emulation is paired with Chrome's native online
// state; dispatching DOM events alone would not exercise failed HTTP requests.
export function createNetworkJourneyDriver(server){
 let applied=null;
 return async({send,sessionId})=>{
  const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true},sessionId)).result?.value;
  const requested=await evaluate('document.documentElement.dataset.networkRequest');
  if(!requested)return;
  if(requested===applied){
   // Chrome may retry a connection reset before surfacing the fetch failure.
   // Every transport attempt must lose its acknowledgement during this cut.
   if(requested==='cut'&&server.hasHeldWrite())server.releaseHeldWrite();
   return;
  }
  if(requested==='cut'&&!server.hasHeldWrite())return;
  const offline=requested!=='online';
  await send('Network.enable',{},sessionId);
  // Kept for compatibility with the Chrome version installed by CI. This CDP
  // command changes both transport and navigator.onLine.
  await send('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1},sessionId);
  if(requested==='cut')server.releaseHeldWrite();
  applied=requested;
  await evaluate('document.documentElement.dataset.networkApplied='+JSON.stringify(requested));
 };
}
