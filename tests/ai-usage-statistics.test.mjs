import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {usageDay,savedMessageCount,addSentMessage,readMessageUsage,activityDays,createMessageRecorder} from '../ai-usage.js';
import {mountAiActivity} from '../statistics-ai-view.js';
import {createPageLoader} from '../page-loader.js';
import vm from 'node:vm';
import {createUsageOutbox} from '../ai-usage-outbox.js';
const time=Date.parse('2026-10-12T13:30:00Z');
test('message counts use Brisbane midnight and do not invent dates for old chats',()=>{
  assert.equal(usageDay(Date.parse('2026-10-12T13:59:59Z')),'2026-10-12');
  assert.equal(usageDay(Date.parse('2026-10-12T14:00:00Z')),'2026-10-13');
  const old={aiWorkspace:{chats:[{messages:[{role:'user',content:'Hello'},{role:'assistant',content:'Hi'},{role:'assistant',content:'Rate limited',notice:true}]}]}};
  assert.equal(savedMessageCount(old),1);
  assert.deepEqual(readMessageUsage(old,time).daily,{});
  const next=addSentMessage(old,time);
  assert.equal(next.totalSent,2);assert.equal(next.daily['2026-10-12'],1);
  assert.equal(next.startedDay,'2026-10-12');
});
test('totals survive deleted chats and daily history stays bounded to one year',()=>{
  const old={aiMessageStats:{version:1,totalSent:150,daily:{'2020-01-01':2,'2026-10-11':3},startedDay:'2020-01-01'}};
  const next=addSentMessage(old,time);
  assert.equal(next.totalSent,151);assert.equal(next.daily['2026-10-12'],1);assert.equal(next.daily['2020-01-01'],undefined);
  assert.equal(readMessageUsage({aiMessageStats:next,aiWorkspace:{chats:[]}},time).totalSent,151);
  const days=activityDays(next.daily,time);assert.equal(days.filter(d=>!d.padding).length,365);assert.equal(days.at(-1).day,'2026-10-12');
});
test('atomic recorder preserves profile data and counts concurrent messages once each',async()=>{
  let data={profile:{displayName:'User'}},chain=Promise.resolve();const writes=[];
  const record=createMessageRecorder({getUser:()=>({uid:'a',emailVerified:true}),document:uid=>uid,clock:()=>time,
    transact:callback=>{chain=chain.then(()=>callback({get:async()=>({exists:()=>true,data:()=>data}),set:(ref,value,options)=>{writes.push({ref,options});data={...data,...value};}}));return chain;}});
  await Promise.all([record('a',4),record('a',4)]);
  assert.equal(data.aiMessageStats.totalSent,6);assert.equal(data.aiMessageStats.daily['2026-10-12'],2);
  assert.equal(data.profile.displayName,'User');assert.deepEqual(writes[0].options,{mergeFields:['aiMessageStats']});
});
test('account switching during a read cannot record against a different user',async()=>{
  let user={uid:'a',emailVerified:true},writes=0;
  const record=createMessageRecorder({getUser:()=>user,document:uid=>uid,clock:()=>time,transact:callback=>callback({get:async()=>{user={uid:'b',emailVerified:true};return {exists:()=>false};},set:()=>writes++})});
  await record('a',0);assert.equal(writes,0);
});

test('pending activity cannot recreate a missing or deleted profile',async()=>{
  let writes=0;
  const record=createMessageRecorder({getUser:()=>({uid:'a',emailVerified:true}),document:uid=>uid,clock:()=>time,transact:callback=>callback({get:async()=>({exists:()=>false}),set:()=>writes++})});
  await assert.rejects(record('a',0),/Account data/);assert.equal(writes,0);
});
test('activity viewer shows zero days, accessible dates, errors and only one grid tab stop',async()=>{
  const html=await readFile(new URL('../app.html',import.meta.url),'utf8'),{document}=parseHTML(html),root=document.getElementById('ai-activity');
  const view=mountAiActivity(root);view.render({totalSent:5,daily:{'2026-10-12':2},startedDay:'2026-10-12'},'2026-10-12');
  assert.equal(root.querySelector('[data-activity-total]').textContent,'5');assert.equal(root.querySelector('[data-activity-today]').textContent,'2');
  assert.equal(root.querySelectorAll('[data-activity-grid] button').length,365);
  assert.equal(root.querySelectorAll('[data-activity-grid] [tabindex="0"]').length,1);
  assert.match(root.querySelector('[tabindex="0"]').getAttribute('aria-label'),/12 Oct 2026 · 2 messages/);
  assert.match(root.querySelector('[data-activity-grid] button').getAttribute('aria-label'),/No recorded data/);
  view.error();assert.equal(root.querySelector('[data-activity-total]').textContent,'—');assert.equal(root.querySelector('[data-activity-calendar]').hidden,true);
});
test('Statistics loads activity once without loading the chat workspace',async()=>{
  const modules=[],styles=[];const loader=createPageLoader({loadStyle:async url=>styles.push(url),importModule:async url=>modules.push(url)});
  await loader.prepare('statistics-page');await loader.prepare('statistics-page');
  assert.deepEqual(modules,['./statistics-ai.js?v=1']);assert.deepEqual(styles,['statistics-ai.css?v=2']);
});

test('live activity subscribes only while Statistics is visible and clears on account change',async()=>{
  const html=await readFile(new URL('../app.html',import.meta.url),'utf8'),{document,window}=parseHTML(html);
  const source=(await readFile(new URL('../statistics-ai.js',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
  const auth={currentUser:null},snapshots=[];let authChange,reads=0,closed=0;
  vm.runInNewContext(source,{document,window,auth,db:{},mountAiActivity,readMessageUsage,usageDay,
    initializeMessageUsage:async()=>{},flushMessageUsage:async()=>{},doc:(_,collection,uid)=>uid,onAuthStateChanged:(_,callback)=>{authChange=callback;callback(null);return()=>{};},
    onSnapshot:(ref,callback)=>{reads++;snapshots.push(callback);return()=>closed++;},setInterval:()=>1,clearInterval:()=>{}});
  assert.equal(reads,0);
  auth.currentUser={uid:'a',emailVerified:true};authChange();assert.equal(reads,0);
  document.getElementById('statistics-page').classList.add('active');window.dispatchEvent(new window.Event('kairos-page-ready'));
  assert.equal(reads,1);window.dispatchEvent(new window.Event('kairos-page-ready'));assert.equal(reads,1);
  snapshots[0]({exists:()=>true,data:()=>({aiMessageStats:{version:1,totalSent:9,daily:{}}})});
  assert.equal(document.querySelector('[data-activity-total]').textContent,'9');
  auth.currentUser={uid:'b',emailVerified:true};authChange();assert.equal(closed,1);
  assert.equal(document.querySelector('[data-activity-total]').textContent,'—');
  snapshots[0]({exists:()=>true,data:()=>({aiMessageStats:{version:1,totalSent:99,daily:{}}})});
  assert.equal(document.querySelector('[data-activity-total]').textContent,'—');
  document.getElementById('statistics-page').classList.remove('active');window.dispatchEvent(new window.Event('kairos-page-ready'));
  assert.equal(closed,2);
});

test('failed usage events survive reload, retry on their original date and deduplicate uncertain commits',async()=>{
  const values=new Map(),storage={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let data={},first=true;
  const options={storage,getUser:()=>({uid:'a',emailVerified:true}),makeId:()=> 'event-1',clock:()=>time,schedule:()=>1,
    write:async(_,baseline,event)=>{data={aiMessageStats:addSentMessage(data,time,baseline,event)};if(first){first=false;throw Error('Response lost after commit');}}};
  await createUsageOutbox(options).record('a',3);assert.equal(values.size,1);
  const restored=createUsageOutbox({...options,clock:()=>time+86400000,write:async(_,baseline,event)=>{data={aiMessageStats:addSentMessage(data,time+86400000,baseline,event)};}});
  await restored.flush('a');assert.equal(values.size,0);
  assert.equal(data.aiMessageStats.totalSent,4);assert.equal(data.aiMessageStats.daily['2026-10-12'],1);
  assert.equal(data.aiMessageStats.daily['2026-10-13'],undefined);
});

test('a message arriving during an active drain is not lost',async()=>{
  const values=new Map(),storage={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let release,id=0,data={},writes=0;const pending=new Promise(resolve=>release=resolve);
  const outbox=createUsageOutbox({storage,getUser:()=>({uid:'a',emailVerified:true}),makeId:()=> 'event-'+(++id),clock:()=>time,schedule:()=>1,
    write:async(_,baseline,event)=>{if(writes++===0)await pending;data={aiMessageStats:addSentMessage(data,time,baseline,event)};}});
  const first=outbox.record('a',0),second=outbox.record('a',0);release();await Promise.all([first,second]);
  assert.equal(values.size,0);assert.equal(data.aiMessageStats.totalSent,2);assert.equal(data.aiMessageStats.daily['2026-10-12'],2);
});

test('another device cannot include pending dated messages in the legacy baseline',()=>{
  const saved={aiWorkspace:{chats:[{messages:[{role:'user',content:'Legacy'},{role:'user',content:'Pending E',usageId:'E'}]}]}};
  const baseline=savedMessageCount(saved);assert.equal(baseline,1);
  const initialized=addSentMessage(saved,time,baseline,{id:'F',time});
  const retried=addSentMessage({aiMessageStats:initialized},time,1,{id:'E',time});
  assert.equal(retried.totalSent,3);assert.equal(retried.daily['2026-10-12'],2);
});

test('initializing historical totals does not invent a sent message or activity date',()=>{
  const data={aiWorkspace:{chats:[{messages:[{role:'user',content:'Existing'}]}]}};
  const initial=addSentMessage(data,time,1,{initialize:true});
  assert.equal(initial.totalSent,1);assert.equal(initial.startedDay,null);assert.deepEqual(initial.daily,{});
  assert.equal(readMessageUsage({aiMessageStats:initial,aiWorkspace:{chats:[]}},time).totalSent,1);
});
