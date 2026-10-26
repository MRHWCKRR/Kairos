import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../calendar-feed-url.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error});

test('published calendar feed links normalise webcal and accept only supported provider paths',()=>{
 assert.equal(typeof module.normaliseCalendarFeedUrl,'function');
 for(const url of ['https://calendar.google.com/calendar/ical/student%40gmail.com/private-abc123/basic.ics','https://calendar.google.com/calendar/ical/student%40gmail.com/public/basic.ics','https://outlook.live.com/owa/calendar/user/token/calendar.ics','https://outlook.office365.com/owa/calendar/token/calendar.ics','https://p123-caldav.icloud.com/published/2/ABC_123-def'])assert.equal(module.normaliseCalendarFeedUrl(url),url);
 assert.equal(module.normaliseCalendarFeedUrl('webcal://p01-caldav.icloud.com/published/2/token'),'https://p01-caldav.icloud.com/published/2/token');
});

test('calendar feed links reject arbitrary destinations, credentials, redirects and URL parser tricks',()=>{
 assert.equal(typeof module.normaliseCalendarFeedUrl,'function');
 for(const url of ['http://calendar.google.com/calendar/ical/user/public/basic.ics','https://127.0.0.1/calendar.ics','https://calendar.google.com.evil.test/calendar/ical/user/public/basic.ics','https://calendar.google.com/calendar/ical/user/public/basic.ics#secret','https://calendar.google.com:443/calendar/ical/user/public/basic.ics','https://user:pass@calendar.google.com/calendar/ical/user/public/basic.ics','https://calendar.google.com/calendar/ical/user/public/basic.ics?redirect=https://localhost','https://calendar.google.com/url?url=https://localhost','https://calendar.google.com/calendar/ical/a%2fb/public/basic.ics','https://outlook.live.com/owa/calendar/a/../token/calendar.ics','https://p01-caldav.icloud.com/published/2/abc%0aheader','https://p01-caldav.icloud.com/published/2/abc\\def','https://evil.test/feed.ics',null,42])assert.throws(()=>module.normaliseCalendarFeedUrl(url),undefined,String(url));
});

const endpoint=await import('../server/calendar-feed.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error});
const feed='https://calendar.google.com/calendar/ical/student%40gmail.com/private-abc123/basic.ics';
const calendar='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
function setup(overrides={}){
 assert.equal(typeof endpoint.createCalendarFeedHandler,'function');
 const calls=[],keys=[];
 const handler=endpoint.createCalendarFeedHandler({adminAuth:{verifyIdToken:async token=>{if(token==='bad')throw Error('private identity detail');return {uid:'one',email_verified:token!=='unverified'}}},appCheck:{verifyToken:async token=>{if(token==='bad')throw Error('private attestation detail')}},rateLimiter:{limit:async value=>{keys.push(value.key);return {success:true}}},fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(calendar);},...overrides});
 const request=(body={url:feed},headers={},method='POST')=>new Request('https://kairos.example/api/calendar-feed',{method,headers:{Authorization:'Bearer good','X-Firebase-AppCheck':'good','Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 return {handler,calls,keys,request};
}

test('calendar feed endpoint authenticates and fetches without forwarding browser credentials',async()=>{
 const f=setup(),response=await f.handler(f.request());
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{calendar,url:feed});assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 assert.deepEqual(f.keys,['calendar-feed:one']);assert.equal(f.calls.length,1);const sent=f.calls[0];assert.equal(sent.url,feed);assert.equal(sent.options.redirect,'manual');assert.equal(sent.options.cache,'no-store');assert.equal(sent.options.credentials,'omit');
 assert.equal(new Headers(sent.options.headers).get('Authorization'),null);assert.equal(new Headers(sent.options.headers).get('X-Firebase-AppCheck'),null);assert.equal(new Headers(sent.options.headers).get('Cookie'),null);
});

test('calendar feed endpoint rejects methods and missing identity before privileged services',async()=>{
 const f=setup({adminAuth:{verifyIdToken:()=>assert.fail('Must not verify without a token')}});
 assert.equal((await f.handler(f.request({}, {},'GET'))).status,405);
 assert.equal((await f.handler(f.request({url:feed},{Authorization:''}))).status,401);assert.equal(f.calls.length,0);
});

test('calendar feed endpoint requires verified email and App Check and fails rate limiting closed',async()=>{
 for(const [headers,status]of [[{Authorization:'Bearer bad'},401],[{Authorization:'Bearer unverified'},403],[{'X-Firebase-AppCheck':''},403],[{'X-Firebase-AppCheck':'bad'},403]]){const f=setup(),response=await f.handler(f.request({url:feed},headers));assert.equal(response.status,status);assert.equal(f.calls.length,0);assert.doesNotMatch(await response.text(),/private/);}
 for(const rateLimiter of [undefined,{limit:async()=>({success:false})},{limit:async()=>{throw Error('secret provider')}}]){const f=setup({rateLimiter}),response=await f.handler(f.request());assert.ok([429,503].includes(response.status));assert.equal(f.calls.length,0);assert.doesNotMatch(await response.text(),/secret provider/);}
});

test('calendar feed endpoint bounds actual input bytes and rejects extra fields and arbitrary destinations',async()=>{
 const f=setup();for(const body of [{url:'https://localhost/private'},{url:feed,other:'ignored'},[],null,{url:'x'.repeat(5000)}]){const response=await f.handler(f.request(body));assert.ok([400,413].includes(response.status));}assert.equal(f.calls.length,0);
 const request=new Request('https://kairos.example/api/calendar-feed',{method:'POST',headers:{Authorization:'Bearer good','X-Firebase-AppCheck':'good'},body:'{'});assert.equal((await f.handler(request)).status,400);
 const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(' '.repeat(4097)));c.close();}});
 const chunked=new Request('https://kairos.example/api/calendar-feed',{method:'POST',headers:{Authorization:'Bearer good','X-Firebase-AppCheck':'good'},body:stream,duplex:'half'});assert.equal((await f.handler(chunked)).status,413);
});

test('calendar feed endpoint rejects redirects and upstream errors without exposing capability URLs',async()=>{
 for(const fetchImpl of [async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}}),async()=>new Response('secret server',{status:403}),async()=>{throw Error(feed)}]){const f=setup({fetchImpl}),response=await f.handler(f.request());assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/abc123|127\.0\.0\.1|secret server/);}
});

test('calendar feed endpoint bounds streamed bytes and refuses malformed text',async()=>{
 for(const body of [' '.repeat(1024*1024+1),'<html>Login required</html>',new Uint8Array([0xff,0xff])]){let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(typeof body==='string'?new TextEncoder().encode(body):body);c.close();},cancel(){cancelled=true;}});const f=setup({fetchImpl:async()=>new Response(stream)}),response=await f.handler(f.request());assert.ok([413,502].includes(response.status));assert.doesNotMatch(await response.text(),/Login required/);}
});

test('calendar feed timeout covers both response headers and stalled body streams',async()=>{
 const never=setup({timeoutMs:10,fetchImpl:()=>new Promise(()=>{})});assert.equal((await never.handler(never.request())).status,504);
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR\r\n'));},cancel(){cancelled=true;}}),slow=setup({timeoutMs:10,fetchImpl:async()=>new Response(stream)});
 assert.equal((await slow.handler(slow.request())).status,504);assert.equal(cancelled,true);
});

import {createWorker} from '../cloudflare/worker.js';
test('Cloudflare routes calendar feed requests through identity, attestation and the existing limiter without AI usage',async()=>{
 let authCalls=0,appCalls=0;const keys=[];
 const worker=createWorker({createServices:()=>({adminAuth:{verifyIdToken:async()=>{authCalls++;return {uid:'calendar-user',email_verified:true};}},appCheck:{verifyToken:async()=>{appCalls++;}},db:{reserveAiUsage:()=>assert.fail('Calendar import must not spend AI credits')}}),fetchImpl:async()=>new Response(calendar)});
 const response=await worker.fetch(new Request('https://kairos.example/api/calendar-feed',{method:'POST',headers:{Authorization:'Bearer verified','X-Firebase-AppCheck':'attested'},body:JSON.stringify({url:feed})}),{AI_RATE_LIMITER:{limit:async({key})=>{keys.push(key);return {success:true};}}});
 assert.equal(response.status,200);assert.equal((await response.json()).calendar,calendar);assert.equal(authCalls,1);assert.equal(appCalls,1);assert.deepEqual(keys,['calendar-feed:calendar-user']);
 const lazy=createWorker({createServices:()=>assert.fail('Unauthenticated calendar route must stay lazy')});
 assert.equal((await lazy.fetch(new Request('https://kairos.example/api/calendar-feed',{method:'POST',body:'{}'}),{})).status,401);
 assert.equal((await lazy.fetch(new Request('https://kairos.example/api/calendar-feed'),{})).status,405);
});

test('calendar feed stream failures cannot smuggle provider messages through status-shaped exceptions',async()=>{
 const stream=new ReadableStream({start(c){c.error(Object.assign(Error(feed),{status:418}));}}),f=setup({fetchImpl:async()=>new Response(stream)}),response=await f.handler(f.request());
 assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/abc123|student|calendar\.google/);
});
