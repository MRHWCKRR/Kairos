import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createMutationSession} from '../mutation-session.js';
import {buildCalendarSync,buildCalendarRemove,applyCalendarCommand} from '../calendar-commands.js';
const module=await import('../calendar-import.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error});
const tick=()=>new Promise(setImmediate),defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture({parse,fetchFeed,commit,confirmRemove=async()=>true,directCommit,ensurePlan}={}){
 assert.equal(typeof module.mountCalendarImport,'function');
 const {document,window}=parseHTML('<html><body><button id="opener">Calendars</button></body></html>');
 let actor={ownerId:'one',planId:'plan'},data={boards:[],calendarSources:[],scheduleEvents:[]},serial=0,writes=[],outcomes=[],timezone='Australia/Brisbane';
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const session=createMutationSession({getIdentity:()=>actor,storage,commit:async(c,e,i)=>{writes.push({c,e,i});if(commit)return commit(c,e,i);const out=applyCalendarCommand(data,c,e);data=out.next;return out.result;}});
 const view=module.mountCalendarImport({document,window,getIdentity:()=>actor,getState:()=>data,getTimezone:()=>timezone,getToday:()=> '2026-10-26',ensurePlan:ensurePlan|| (async()=> 'plan'),commit:(...args)=>directCommit?directCommit(session,...args):session.submit(...args),session,fetchFeed:fetchFeed||(async()=>({calendar:'ICS',url:'https://calendar.google.com/calendar/ical/test/public/basic.ics'})),confirmRemove,uuid:()=>String(++serial),now:()=>1000,
 parse:parse||(async()=>({name:'School',warnings:[],events:[{externalId:'a'.repeat(64),title:'<img src=x onerror=bad>',date:'2026-10-26',start:'09:00',end:'10:00',allDay:false,transparent:false}]})),
 buildSync:buildCalendarSync,buildRemove:buildCalendarRemove});
 const find=selector=>document.querySelector(selector),field=(name,value)=>{const input=find('[name="'+name+'"]');input.value=value;input.dispatchEvent(new window.Event('input',{bubbles:true}));};
 return {view,session,document,window,writes,map,find,field,setActor:id=>{actor=id;session.sync();view.sync()},setData:value=>data=value,data:()=>data,setTimezone:value=>{timezone=value;view.sync()}};
}
async function preview(f){await f.view.open();f.field('url','https://calendar.google.com/calendar/ical/test/public/basic.ics');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();}

test('calendar preview escapes imported titles and waits for explicit import',async()=>{
 const f=fixture();await preview(f);assert.equal(f.writes.length,0);assert.equal(f.find('.calendar-import-dialog img'),null);assert.match(f.find('[data-calendar-preview-list]').textContent,/<img/);assert.equal(f.find('[name="from"]').value,'2026-10-19');assert.equal(f.find('[name="to"]').value,'2027-01-24');f.find('[data-calendar-apply]').click();await tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0].c.source.kind,'feed');f.view.dispose();
});

test('account switch during feed fetch cannot show former account preview',async()=>{
 const gate=defer(),f=fixture({fetchFeed:()=>gate.promise});await f.view.open();f.field('url','https://calendar.google.com/calendar/ical/private/basic.ics');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));f.setActor({ownerId:'two',planId:'other'});gate.resolve({calendar:'PRIVATE',url:'https://calendar.google.com/calendar/ical/private/basic.ics'});await tick();assert.equal(f.find('[data-calendar-preview-list]').textContent,'');assert.equal(f.find('[name="url"]').value,'');assert.equal(f.find('dialog').hasAttribute('open'),false);assert.equal(f.writes.length,0);f.view.dispose();
});

test('account switch during parsing discards the stale result',async()=>{
 const gate=defer(),f=fixture({parse:()=>gate.promise});await f.view.open();f.field('url','https://calendar.google.com/calendar/ical/private/basic.ics');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();f.setActor({ownerId:'two',planId:'other'});gate.resolve({name:'Private',warnings:[],events:[]});await tick();assert.equal(f.find('[data-calendar-preview-list]').textContent,'');assert.equal(f.writes.length,0);f.view.dispose();
});

test('failed calendar save retries the retained command identity without rebuilding preview',async()=>{
 let fail=true;const f=fixture({commit:async()=>{if(fail){fail=false;throw Error('Offline')}return {type:'calendar_sync'}}});await preview(f);f.find('[data-calendar-apply]').click();await tick();assert.equal(f.session.state().pending,true);assert.match(f.find('[data-calendar-status]').textContent,/Retry|retry/);f.find('[data-calendar-retry]').click();await tick();assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],f.writes[0]);assert.equal(f.session.state().pending,false);assert.equal(f.find('[data-calendar-apply]').disabled,true);f.view.dispose();
});

test('source removal waits for confirmation and does not expose its private feed URL',async()=>{
 const f=fixture();f.setData({boards:[],scheduleEvents:[],calendarSources:[{id:'school',name:'School',kind:'feed',url:'https://calendar.google.com/calendar/ical/secret/basic.ics',from:'2026-10-01',to:'2026-12-31',timezone:'Australia/Brisbane',updatedAt:1000}]});await f.view.open();assert.doesNotMatch(f.find('[data-calendar-sources]').textContent,/secret/);f.find('[data-calendar-remove="school"]').click();await tick();assert.equal(f.writes.length,1);assert.equal(f.writes[0].c.type,'calendar_remove');assert.equal(f.writes[0].c.sourceId,'school');f.view.dispose();
});


test('global retry reconciles the same imported source and clears only its confirmed preview',async()=>{
 const operations=new Map();let uncertain=true,data;const f=fixture({commit:async(c,e,i)=>{if(!operations.has(i.operationId)){const out=applyCalendarCommand(f.data(),c,e);f.setData(out.next);operations.set(i.operationId,out.result);}if(uncertain){uncertain=false;throw Error('Response lost')}return operations.get(i.operationId);}});
 await preview(f);f.find('[data-calendar-apply]').click();await tick();assert.equal(f.session.state().pending,true);assert.equal(f.data().calendarSources.length,1);assert.equal(f.data().scheduleEvents[0].readOnly,true);
 const original=structuredClone(f.writes[0]);await f.session.retry();f.view.sync();assert.equal(f.data().calendarSources.length,1);assert.equal(f.data().scheduleEvents.length,1);assert.equal(f.find('[data-calendar-preview-section]').hidden,true);assert.deepEqual(f.writes[1],original);f.view.dispose();
});

test('clearing global recovery retains preview and input draft for review',async()=>{
 const f=fixture({commit:async()=>{throw Error('Offline')}});await preview(f);f.field('name','Custom name');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();f.find('[data-calendar-apply]').click();await tick();
 assert.equal(f.session.state().pending,true);f.session.discard(f.session.state().pendingIdentity);f.view.sync();assert.equal(f.find('[name="name"]').value,'Custom name');assert.equal(f.find('[data-calendar-preview-section]').hidden,false);assert.equal(f.find('[data-calendar-apply]').disabled,false);f.view.dispose();
});

test('an unrelated saved operation cannot erase a calendar preview whose submission never reached recovery',async()=>{
 let reject=true;const f=fixture({directCommit:async(session,...args)=>{if(reject){reject=false;throw Error('Planner gateway unavailable')}return session.submit(...args)}});await preview(f);f.find('[data-calendar-apply]').click();await tick();assert.equal(f.session.state().pending,false);assert.equal(f.find('[data-calendar-preview-section]').hidden,false);
 await f.session.submit({type:'calendar_remove',sourceId:'unused'},{},{ownerId:'one',planId:'plan',operationId:'unrelated',createdAt:1000}).catch(()=>{});
 // Resolve a real, independent command through the shared session.
 if(f.session.state().pending)f.session.discard(f.session.state().pendingIdentity);
 const p=buildCalendarSync(f.data(),{id:'other',name:'Other',kind:'file',timezone:'Australia/Brisbane',from:'2026-10-26',to:'2026-10-26',updatedAt:1000},[]);await f.session.submit(p.command,p.expected,{ownerId:'one',planId:'plan',operationId:'other-save',createdAt:1000});f.view.sync();
 assert.equal(f.find('[data-calendar-preview-section]').hidden,false);assert.doesNotMatch(f.find('[data-calendar-status]').textContent,/Calendar saved/);f.view.dispose();
});

test('switching planners during removal confirmation cannot delete the new planner source',async()=>{
 const confirmation=defer(),f=fixture({confirmRemove:()=>confirmation.promise});const source={id:'school',name:'School',kind:'file',timezone:'Australia/Brisbane',from:'2026-10-01',to:'2026-12-31',updatedAt:1000};f.setData({boards:[],scheduleEvents:[],calendarSources:[source]});await f.view.open();f.find('[data-calendar-remove="school"]').click();await tick();f.setActor({ownerId:'one',planId:'other'});confirmation.resolve(true);await tick();assert.equal(f.writes.length,0);assert.equal(f.data().calendarSources.length,1);f.view.dispose();
});

test('timezone changes during parsing invalidate the pending preview',async()=>{
 const parsing=defer(),f=fixture({parse:()=>parsing.promise});await f.view.open();f.field('url','https://calendar.google.com/calendar/ical/test/public/basic.ics');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));await tick();f.setTimezone('UTC');parsing.resolve({name:'School',events:[],warnings:[]});await tick();assert.equal(f.find('[data-calendar-preview-section]').hidden,true);assert.equal(f.find('[data-calendar-apply]').disabled,true);assert.match(f.find('[data-calendar-status]').textContent,/timezone/);f.view.dispose();
});

test('disposal ignores pending fetch and detaches the dialog',async()=>{
 const fetching=defer(),f=fixture({fetchFeed:()=>fetching.promise});await f.view.open();f.field('url','https://calendar.google.com/calendar/ical/test/public/basic.ics');f.find('[data-calendar-form]').dispatchEvent(new f.window.Event('submit',{bubbles:true,cancelable:true}));f.view.dispose();fetching.resolve({calendar:'ICS',url:'https://calendar.google.com/calendar/ical/test/public/basic.ics'});await tick();assert.equal(f.find('dialog'),null);assert.equal(f.writes.length,0);assert.equal(await f.view.open(),false);
});


test('opening a newly initialized planner succeeds after its normal scope synchronization',async()=>{
 let f;f=fixture({ensurePlan:async()=>{f.setActor({ownerId:'one',planId:'new-plan'});return 'new-plan'}});f.setActor({ownerId:'one',planId:null});assert.equal(await f.view.open(),true);assert.equal(f.find('dialog').hasAttribute('open'),true);f.view.dispose();
});
