import test from 'node:test';import assert from 'node:assert/strict';
let createCalendarFeedRequester;try{({createCalendarFeedRequester}=await import('../calendar-feed-client.js'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const user={uid:'one',emailVerified:true,getIdToken:async()=> 'id-token'};
test('calendar feed requester authenticates and does not cache private feeds',async()=>{
 assert.equal(typeof createCalendarFeedRequester,'function');let received;
 const request=createCalendarFeedRequester({getUser:()=>user,getAppToken:async()=> 'app-token',fetchImpl:async(...args)=>{received=args;return Response.json({calendar:'BEGIN:VCALENDAR',url:'https://calendar.google.com/calendar/ical/test/public/basic.ics'})}});
 const result=await request('https://calendar.google.com/calendar/ical/test/public/basic.ics');assert.equal(result.calendar,'BEGIN:VCALENDAR');assert.equal(received[0],'/api/calendar-feed');assert.equal(received[1].cache,'no-store');assert.equal(received[1].headers.Authorization,'Bearer id-token');assert.equal(received[1].headers['X-Firebase-AppCheck'],'app-token');
});
test('calendar feed requester refuses a switched account after token or response delay',async()=>{
 assert.equal(typeof createCalendarFeedRequester,'function');let actor=user,resolve,called=false;
 const request=createCalendarFeedRequester({getUser:()=>actor,getAppToken:()=>new Promise(r=>resolve=r),fetchImpl:async()=>{called=true;return Response.json({calendar:'private'})}});
 const pending=request('https://example.com');await new Promise(setImmediate);actor={...user,uid:'two'};resolve('token');await assert.rejects(pending,/account|sign-in/i);assert.equal(called,false);
});
test('calendar feed requester times out even if the transport ignores AbortSignal',async()=>{
 assert.equal(typeof createCalendarFeedRequester,'function');const request=createCalendarFeedRequester({getUser:()=>user,getAppToken:async()=> 'token',fetchImpl:()=>new Promise(()=>{}),timeoutMs:10});await assert.rejects(request('https://example.com'),/too long|timed out/i);
});
