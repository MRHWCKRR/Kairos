import {monthTaskEntries} from './schedule-month.js?v=6';
import {eventSegmentsForDate} from './schedule-events.js?v=4';
import {taskDurationMinutes} from './schedule-utils.js?v=6';
import {zonedTaskStart} from './task-reminders.js?v=8';
import {validEventDate} from './event-occurrences.js?v=3';
const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const clock=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const minutes=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
const utc=epoch=>new Date(epoch).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const day=date=>date.replaceAll('-','');
const text=value=>String(value??'').replace(/\r\n|\r/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line){const out=[];let current='',size=0;for(const ch of line){const bytes=new TextEncoder().encode(ch).length;if(size+bytes>75){out.push(current);current=' ';size=1;}current+=ch;size+=bytes;}out.push(current);return out.join('\r\n');}
async function uid(identity){const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')+'@kairos.invalid';}
export async function buildCalendarExport(state,{ownerId,planId,from,to,timezone,includeTasks=true,includeEvents=true,includeImported=false,includeCompleted=false,now=Date.now()}={}){
 if(!ownerId||!planId||!state||!Array.isArray(state.boards)||!validEventDate(from)||!validEventDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>365)throw Error('Choose a loaded planner and a valid range of at most 366 days.');
 if(typeof timezone!=='string'||!timezone)throw Error('Choose a valid profile timezone.');new Intl.DateTimeFormat('en',{timeZone:timezone});
 for(const value of [includeTasks,includeEvents,includeImported,includeCompleted])if(typeof value!=='boolean')throw Error('Invalid calendar export filters.');
 if(!includeTasks&&!includeEvents)throw Error('Choose tasks, events, or both.');
 const canonical=zone=>new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone,profileZone=canonical(timezone);
 let rows=[];const omitted={untimed:0,invalidTime:0},seen=new Set();
 function add({kind,id,logicalDate,title,date,start,end,endDate,allDay=false,transparent=false,duration}){
  if(!validEventDate(date))return;
  const a=minutes(start),b=minutes(end);if(!allDay&&a===null){if(date>=from&&date<=to)omitted.untimed++;return;}
  let finishDate=endDate,finish=end;
  if(allDay){finishDate=shift(date,1);finish='00:00';}
  else if(duration!==undefined){if(!Number.isFinite(duration)||duration<=0||duration>525600){omitted.invalidTime++;return;}const total=a+duration;finishDate=shift(date,Math.floor(total/1440));finish=clock(total%1440);}
  else{if(b===null){if(date>=from&&date<=to)omitted.invalidTime++;return;}finishDate=finishDate||shift(date,b<=a?1:0);}
  if(date>to||finishDate<from||finishDate===from&&finish==='00:00')return;
  const key=JSON.stringify([kind,id,logicalDate||null]);if(seen.has(key))throw Error('Duplicate calendar identities. Review the planner before exporting.');seen.add(key);
  let startsAt,endsAt;
  rows.push({kind,id,logicalDate:logicalDate||null,title:String(title||'Untitled'),date,start:allDay?null:start,endDate:finishDate,end:finish,allDay,transparent,startsAt,endsAt});
  if(rows.length>5000)throw Error('Export supports at most 5,000 items. Choose a shorter range.');
 }
 if(includeTasks){
  // Ordinary tasks can span several days when only an estimate supplies their end.
  const ordinary=[];for(const board of state.boards){if(board.archived)continue;for(const section of board.sections||[]){if(section.archived)continue;for(const task of section.tasks||[])if(!task.archived&&!task.recurrence?.enabled)ordinary.push(task);}}
  const recurringBoards=state.boards.map(b=>({...b,sections:(b.sections||[]).map(s=>({...s,tasks:(s.tasks||[]).filter(t=>t.recurrence?.enabled)}))}));
  const recurring=monthTaskEntries(recurringBoards,shift(from,-1),to,{today:from});
  for(const task of [...ordinary,...recurring]){if(task.completed&&!includeCompleted)continue;const start=minutes(task.startTime);add({kind:'task',id:task.id,logicalDate:task.occurrenceDate,title:task.title,date:task.date,start:task.startTime,duration:start===null?undefined:taskDurationMinutes(task)});}
 }
 if(includeEvents){
  const sources=(state.scheduleEvents||[]).filter(e=>includeImported||!e.readOnly&&!e.calendarSourceId),occurrences=new Map();
  for(let date=from;date<=to;date=shift(date,1))for(const {event,continued}of eventSegmentsForDate(sources,date)){
   const original=event.occurrenceDate||event.date||(continued?shift(date,-1):date),key=JSON.stringify([event.id,event.occurrenceDate||event.date||original]);
   if(!occurrences.has(key))occurrences.set(key,{event,date:event.date||(continued?shift(date,-1):date),original});
  }
  for(const {event,date,original}of occurrences.values()){if(event.calendarSourceId){const source=(state.calendarSources||[]).find(s=>s.id===event.calendarSourceId);let matches=false;try{matches=!!source?.timezone&&canonical(source.timezone)===profileZone;}catch{}if(!matches)throw Error('An imported calendar timezone is stale or unavailable. Refresh or replace that calendar before including it in an export.');}add({kind:'event',id:event.id,logicalDate:event.occurrenceDate||(!event.date?original:null),title:event.title,date,start:event.start,end:event.end,allDay:event.allDay===true,transparent:event.transparent===true});}
 }
 const instants=new Map(),wall=(date,time)=>{const key=date+' '+time;if(!instants.has(key))instants.set(key,zonedTaskStart(date,time,timezone));return instants.get(key);};rows=rows.filter(row=>{if(row.allDay)return true;row.startsAt=wall(row.date,row.start);row.endsAt=wall(row.endDate,row.end);if(row.startsAt===null||row.endsAt===null||row.endsAt<=row.startsAt){omitted.invalidTime++;return false;}return true;});
 rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||'')||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)||String(a.logicalDate).localeCompare(String(b.logicalDate)));
 const stamp=utc(now),parts=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kairos//Schedule Export//EN','CALSCALE:GREGORIAN'];
 const ids=await Promise.all(rows.map(row=>uid([ownerId,planId,row.kind,row.id,row.logicalDate])));
 rows.forEach((r,i)=>parts.push('BEGIN:VEVENT','UID:'+ids[i],'DTSTAMP:'+stamp,r.allDay?'DTSTART;VALUE=DATE:'+day(r.date):'DTSTART:'+utc(r.startsAt),r.allDay?'DTEND;VALUE=DATE:'+day(r.endDate):'DTEND:'+utc(r.endsAt),'SUMMARY:'+text(r.title),'CLASS:PRIVATE','TRANSP:'+(r.transparent?'TRANSPARENT':'OPAQUE'),'END:VEVENT'));
 parts.push('END:VCALENDAR');const content=parts.map(fold).join('\r\n')+'\r\n';if(new TextEncoder().encode(content).length>5*1024*1024)throw Error('Export exceeds 5 MiB. Choose a shorter range.');
 return {content,filename:'kairos-schedule-'+from+'-to-'+to+'.ics',counts:{tasks:rows.filter(r=>r.kind==='task').length,events:rows.filter(r=>r.kind==='event').length,total:rows.length},omitted,rows:rows.map(({title,date,start,endDate,end,allDay,kind})=>({title,date,start,endDate,end,allDay,kind}))};
}
export function downloadCalendarExport(result,{document=globalThis.document,URL=globalThis.URL,Blob=globalThis.Blob}={}){
 const url=URL.createObjectURL(new Blob([result.content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.filename;document.body.appendChild(a);try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
