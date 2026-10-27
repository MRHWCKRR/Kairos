import {eventOccurrence} from '../event-occurrences.js';
import * as overdue from '../schedule-overdue.js';
import {planningClock} from '../planning-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {t} from '../i18n.js';
import * as utils from '../schedule-utils.js';
import * as recurrence from '../recurrence-utils.js';
const source=(await readFile(new URL('../schedule-workspace.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
let month={};try{month=await import('../schedule-month.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
function fixture({events=[],openEvent=()=>{}}={}){
 const {document,window}=parseHTML('<html><body><section id="schedule-page" class="active"><div id="schedule-toolbar"></div><div class="schedule-workspace-shell"><aside id="schedule-backlog"></aside><div id="schedule-calendar"></div><aside id="schedule-inspector" hidden></aside></div><div id="schedule-ai-review"></div></section><div id="calendar-page" class="page-view"><div id="calendar-grid"></div></div></body></html>');
 const task={id:'t',title:'Read',date:'2026-12-17',startTime:'10:00',endTime:'11:00'},boards=[{id:'b',sections:[{id:'s',tasks:[task]}]}];let owner='one',date;
 const context=vm.createContext({eventOccurrence,...overdue,planningClock,...utils,...recurrence,document,window,Date,CSS:{escape:String},requestAnimationFrame:()=>1,setInterval:()=>1,clearInterval(){}});vm.runInContext(source,context);
 const ws=context.initScheduleWorkspace({getBoards:()=>boards,getScheduleEvents:()=>events,openRecurringEventEditor:openEvent,getOwnerId:()=>owner,getPlanId:()=> 'plan',renderMonthCalendar:value=>date=value});return {ws,document,task,boards,monthDate:()=>date,setOwner:value=>owner=value};
}
test('Month and each timeline view retain the selected date across a year boundary',async()=>{
 const f=fixture();assert.equal(typeof f.ws.setDate,'function');await f.ws.setDate('2027-01-03');await f.ws.setView('month');assert.equal(f.monthDate(),'2027-01-03');for(const view of ['week','three-day','day']){await f.ws.setView(view);assert.ok(utils.getVisibleDates(f.ws.state.anchor,view).some(date=>utils.toDateKey(date)==='2027-01-03'));assert.equal(f.ws.state.focusDate,'2027-01-03');await f.ws.setView('month');assert.equal(f.monthDate(),'2027-01-03')}
});
test('Today resets the shared date without leaving Month',async()=>{
 const f=fixture();assert.equal(typeof f.ws.setDate,'function');await f.ws.setDate('2027-01-03');await f.ws.setView('month');assert.equal(typeof f.ws.goToday,'function');await f.ws.goToday();const today=utils.toDateKey(new Date());assert.equal(f.monthDate(),today);assert.equal(f.ws.state.monthView,true);await f.ws.setView('day');assert.equal(utils.toDateKey(f.ws.state.anchor),today);
});
test('selecting a task in the timeline makes its date the Month selection',async()=>{
 const f=fixture();await f.ws.selectItem('task','t');await f.ws.setView('month');assert.equal(f.monthDate(),'2026-12-17');const before=f.ws.state.focusDate;assert.equal(await f.ws.setDate('2026-02-30'),false);assert.equal(f.ws.state.focusDate,before);
});
test('date navigation protects drafts and ignores an account change during confirmation',async()=>{
 const f=fixture();assert.equal(typeof f.ws.setDate,'function');const old=utils.toDateKey(f.ws.state.anchor);f.ws.setInspectorSession({preserve:()=>false,requestLeave:async()=>false});assert.equal(await f.ws.setDate('2027-01-03'),false);assert.equal(utils.toDateKey(f.ws.state.anchor),old);f.ws.setInspectorSession({preserve:()=>false,requestLeave:async()=>{f.setOwner('two');return true}});assert.equal(await f.ws.setDate('2027-01-03'),false);assert.equal(utils.toDateKey(f.ws.state.anchor),old);
});
test('opening a Month task reveals its actual scheduled date and inspector',async()=>{
 const f=fixture();await f.ws.setView('month');assert.equal(typeof f.ws.openTaskAt,'function');assert.equal(await f.ws.openTaskAt({taskId:'t'}),true);assert.equal(f.ws.state.monthView,false);assert.equal(f.ws.state.view,'day');assert.equal(f.ws.state.focusDate,'2026-12-17');assert.equal(f.ws.state.selected.id,'t');assert.equal(f.document.querySelector('#schedule-inspector').hidden,false);assert.equal(await f.ws.openTaskAt({taskId:'missing'}),false);
});
test('opening a moved completed occurrence uses its display date and preserves logical identity',async()=>{
 const f=fixture();f.task.recurrence=recurrence.normalizeRecurrence({enabled:true,frequency:'daily',startDate:'2026-12-17',mode:'fixed',exceptions:{'2026-12-17':{status:'completed',override:{date:'2026-12-20',startTime:'14:00',endTime:'15:00'}}}});await f.ws.setView('month');assert.equal(typeof f.ws.openTaskAt,'function');await f.ws.openTaskAt({taskId:'t',occurrenceDate:'2026-12-17'});assert.equal(f.ws.state.focusDate,'2026-12-20');assert.equal(f.ws.state.selected.occurrenceDate,'2026-12-17');
});
test('month previews show two escaped task titles and a remaining count without nested buttons',()=>{
 assert.equal(typeof month.calendarMonthMarkup,'function');const entries=Array.from({length:5},(_,i)=>({id:'t'+i,title:i?'Task '+i:'<img src=x onerror=bad()>',date:'2026-12-17',startTime:'10:00',completed:false}));const {document}=parseHTML(month.calendarMonthMarkup('2026-12-17',entries,{today:'2026-12-18',locale:'en',hour12:false})),day=document.querySelector('[data-date="2026-12-17"]');assert.equal(day.querySelectorAll('[data-calendar-task]').length,2);assert.match(day.querySelector('[data-calendar-more]').textContent,/3 more/);assert.equal(day.querySelector('img'),null);assert.equal(day.querySelector('button button'),null);assert.equal(day.querySelector('[data-calendar-day]').getAttribute('aria-pressed'),'true');
});
test('month entries exclude archived work and show moved recurring occurrences once',()=>{
 assert.equal(typeof month.monthTaskEntries,'function');const task={id:'series',title:'Repeat',startTime:'10:00',endTime:'11:00',recurrence:recurrence.normalizeRecurrence({enabled:true,startDate:'2026-12-17',frequency:'daily',mode:'fixed',endType:'count',count:1,exceptions:{'2026-12-17':{status:'completed',completedAt:'keep',override:{date:'2026-12-20'}}}})},boards=[{id:'b',sections:[{id:'s',tasks:[task,{id:'archived',date:'2026-12-20',archived:true}]}]}];const entries=month.monthTaskEntries(boards,'2026-12-01','2026-12-31',{today:'2026-12-21'});assert.equal(entries.length,1);assert.equal(entries[0].date,'2026-12-20');assert.equal(entries[0].occurrenceDate,'2026-12-17');assert.equal(entries[0].completed,true);
});
test('month navigation clamps the day instead of skipping a short month',()=>{
 assert.equal(typeof month.shiftCalendarMonth,'function');assert.equal(month.shiftCalendarMonth('2027-01-31',1),'2027-02-28');assert.equal(month.shiftCalendarMonth('2028-01-31',1),'2028-02-29');assert.equal(month.shiftCalendarMonth('2026-12-31',1),'2027-01-31');
});

test('the real Month engine opens previews directly, expands crowded days and shares Today',async()=>{
 const f=fixture(),doc=f.document,container=doc.getElementById('calendar-page');container.innerHTML='<button id="calendar-prev-btn">Previous</button><h2 id="calendar-month-year"></h2><button id="calendar-next-btn">Next</button><button id="calendar-today-btn">Today</button><div id="calendar-grid"></div>';const overlay=doc.createElement('div');overlay.id='day-detail-overlay';doc.body.appendChild(overlay);
 f.boards[0].sections[0].tasks.push(...Array.from({length:4},(_,i)=>({id:'extra'+i,title:'Extra '+i,date:'2026-12-17'})));f.window=doc.defaultView;f.window.__kairosScheduleWorkspace=f.ws;
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8'),begin=app.indexOf("    const calendarGrid ="),end=app.indexOf('    function renderDayPanel()',begin);
 let panels=0;const context=vm.createContext({...month,document:doc,window:f.window,Date,Intl,calendarViewDate:new Date(2026,11,1),calendarFocusDate:'2026-12-17',selectedCalendarDate:null,boardsData:f.boards,scheduleData:[],renderDayPanel:()=>panels++,getLocale:()=> 'en',userSettings:{accessibility:{language:'en',timeFormat:'24'}},pageRenders:{defer:()=>false},auth:{currentUser:{uid:'one'}},currentPlanDocId:'plan'});vm.runInContext(app.slice(begin,end),context);context.renderCalendar();
 const preview=doc.querySelector('[data-calendar-task="t"]');assert.ok(preview,'Month must render task previews');preview.click();await new Promise(r=>setTimeout(r,0));assert.equal(f.ws.state.selected.id,'t');assert.equal(panels,0);
 context.renderCalendar();doc.querySelector('[data-date="2026-12-17"] [data-calendar-more]').click();await new Promise(r=>setTimeout(r,0));assert.equal(panels,1);assert.equal(context.selectedCalendarDate,'2026-12-17');assert.equal(f.ws.state.focusDate,'2026-12-17');doc.getElementById('calendar-today-btn').click();await new Promise(r=>setTimeout(r,0));assert.equal(f.ws.state.focusDate,utils.toDateKey(new Date()));
});

test('the crowded-day panel counts ordinary and recurring work and retains its saved insight',async()=>{
 const {document,window}=parseHTML('<html><body><div id="calendar-grid"></div><h2 id="calendar-month-year"></h2><div id="day-detail-overlay"><h2 id="day-detail-date-title"></h2><span id="day-detail-total"></span><span id="day-detail-completed"></span><div id="day-detail-task-list"></div><div id="day-detail-ai-content"></div></div></body></html>'),date='2026-12-17',boardsData=[{id:'b',sections:[{id:'s',tasks:[{id:'t',title:'Done',date,completed:true},{id:'u',title:'Pending',date},{id:'series',title:'Completed occurrence',recurrence:recurrence.normalizeRecurrence({enabled:true,startDate:date,endType:'count',count:1,exceptions:{[date]:{status:'completed'}}})}]}]}],app=await readFile(new URL('../app.js',import.meta.url),'utf8'),begin=app.indexOf('    const calendarGrid ='),end=app.indexOf('    if (dayDetailCloseBtn)',begin);
 const context=vm.createContext({...month,document,window,Date,Intl,calendarViewDate:new Date(2026,11,1),calendarFocusDate:date,selectedCalendarDate:date,boardsData,scheduleData:[],dayInsights:{[date]:'Keep this insight'},getLocale:()=> 'en',userSettings:{accessibility:{language:'en',timeFormat:'24'}},pageRenders:{defer:()=>false},tr:key=>t(key,'en'),createTaskHTML:task=>'<div>'+task.title+'</div>'});vm.runInContext(app.slice(app.indexOf('    function trFmt('),app.indexOf('    function refreshDynamicUI('))+app.slice(begin,end),context);context.renderDayPanel();assert.match(document.getElementById('day-detail-total').textContent,/3/);assert.match(document.getElementById('day-detail-completed').textContent,/2/);assert.equal(document.querySelectorAll('[data-calendar-occurrence]').length,1);assert.equal(document.getElementById('day-detail-ai-content').textContent,'Keep this insight');
});

test('two event occurrences on one visible day open distinct original dates including moved overnight tail',async()=>{const opened=[],events=[{id:'e',title:'Class',category:'class',day:5,start:'09:00',end:'10:00',exceptions:{'2026-10-30':{override:{id:'e',title:'Moved class',category:'class',date:'2026-11-05',start:'23:00',end:'01:00',allDay:false,transparent:false}}}}],f=fixture({events,openEvent:(...args)=>opened.push(args)});await f.ws.setDate('2026-11-06');await f.ws.setView('day');const buttons=[...f.document.querySelectorAll('[data-event-id]')];assert.equal(buttons.length,2);for(const original of ['2026-10-30','2026-11-06']){f.document.querySelector('[data-event-occurrence="'+original+'"]').click();f.document.querySelector('[data-edit-event]').click();assert.deepEqual(opened.at(-1),['e',original]);assert.equal(f.ws.state.selected.occurrenceDate,original);}f.ws.destroy();});
