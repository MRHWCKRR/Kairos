import {normaliseCalendarFeedUrl} from '../calendar-feed-url.js';
import {readBoundedText} from './http-body.js';

const REQUEST_BYTES=4096,FEED_BYTES=1024*1024;
const safeErrors=new WeakSet();
const failure=(message,status)=>{const error=Object.assign(Error(message),{status});safeErrors.add(error);return error;};
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...(status===405?{Allow:'POST'}:{}),...(status===429?{'Retry-After':'60'}:{})}});

export function createCalendarFeedHandler({adminAuth,appCheck,rateLimiter,fetchImpl=fetch,timeoutMs=10000}={}){
 return async request=>{
  if(request.method!=='POST')return reply({error:'Method Not Allowed'},405);
  try{
   const token=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')||'')?.[1];
   if(!token)throw failure('Sign in to import a calendar.',401);
   let user;try{user=await adminAuth.verifyIdToken(token);}catch{throw failure('Please sign in again.',401);}
   if(!user?.uid||user.email_verified!==true)throw failure('Verify your email before importing a calendar.',403);
   const appToken=request.headers.get('X-Firebase-AppCheck');
   if(!appToken)throw failure('Refresh Kairos and try again.',403);
   try{await appCheck.verifyToken(appToken);}catch{throw failure('Refresh Kairos and try again.',403);}
   if(!rateLimiter?.limit)throw failure('Calendar import is temporarily unavailable.',503);
   let allowed;try{allowed=(await rateLimiter.limit({key:'calendar-feed:'+user.uid})).success===true;}catch{throw failure('Calendar import is temporarily unavailable.',503);}
   if(!allowed)throw failure('Please try importing again shortly.',429);
   let body;
   try{body=JSON.parse(await readBoundedText(request,REQUEST_BYTES));}catch(error){throw failure(error.status===413?'The calendar request is too large.':'Invalid calendar request.',error.status===413?413:400);}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='url'))throw failure('Invalid calendar request.',400);
   let url;try{url=normaliseCalendarFeedUrl(body.url);}catch{throw failure('Use a published Google, Outlook or iCloud calendar link, or upload an .ics file.',400);}
   return reply({calendar:await fetchCalendar(url),url});
  }catch(error){return reply({error:safeErrors.has(error)?error.message:'Calendar import is temporarily unavailable.'},safeErrors.has(error)?error.status:503);}
 };

 async function fetchCalendar(url){
  const controller=new AbortController();let reader,timer,expired=false,complete=false;
  const timeoutError=()=>failure('The calendar server took too long. Try again.',504);
  const cancel=()=>{try{const stopped=reader?.cancel();stopped?.catch(()=>{});}catch{}};
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();cancel();reject(timeoutError());},timeoutMs);});
  const work=(async()=>{
   let response;try{response=await fetchImpl(url,{method:'GET',headers:{Accept:'text/calendar, text/plain;q=0.8'},redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal});}catch{throw expired?timeoutError():failure('Could not read the calendar feed. Check that it is published and try again.',502);}
   if(expired){try{response.body?.cancel()?.catch(()=>{});}catch{}throw timeoutError();}
   if(!response.ok||response.redirected||response.status>=300&&response.status<400){try{response.body?.cancel()?.catch(()=>{});}catch{}throw failure('Could not read the calendar feed. Check that it is published and try again.',502);}
   if(!response.body)throw failure('The calendar feed is empty or invalid.',502);
   reader=response.body.getReader();const chunks=[];let length=0;
   try{
    while(true){const {done,value}=await reader.read();if(expired)throw timeoutError();if(done)break;length+=value.byteLength;if(length>FEED_BYTES)throw failure('This calendar feed is larger than 1 MiB. Export a smaller .ics file instead.',413);chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw failure('The calendar feed must be valid UTF-8 text.',502);}
    if(!/^\s*BEGIN:VCALENDAR(?:\r?\n)/i.test(text)||!/(?:^|\r?\n)END:VCALENDAR\s*$/i.test(text))throw failure('The link did not return an iCalendar file. Check that it is a published .ics feed.',502);
    complete=true;return text;
   }catch(error){if(safeErrors.has(error))throw error;throw failure('Could not finish reading the calendar feed. Try again.',502);}
  })();
  try{return await Promise.race([work,deadline]);}
  finally{clearTimeout(timer);if(!complete){controller.abort();cancel();}if(complete)reader?.releaseLock();}
 }
}
