import {eventSegmentsForDate} from './schedule-events.js?v=3';
import {generateTaskOccurrencesThrough} from './recurrence-utils.js?v=14';
import {toDateKey,parseTime,formatTime} from './schedule-utils.js?v=5';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function calendarDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return null;
 const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);
 return toDateKey(date)===value?date:null;
}
export function shiftCalendarMonth(value,delta){
 const date=calendarDate(value);if(!date)return null;const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+delta);date.setDate(Math.min(day,new Date(date.getFullYear(),date.getMonth()+1,0).getDate()));return toDateKey(date);
}
export function monthTaskEntries(boards,start,end,{today=toDateKey(new Date())}={}){
 const entries=[];
 for(const board of boards||[]){if(board.archived)continue;for(const section of board.sections||[]){if(section.archived)continue;for(const task of section.tasks||[]){
  if(task.archived)continue;const location={boardId:board.id,sectionId:section.id};
  if(task.recurrence?.enabled){
   for(const occurrence of generateTaskOccurrencesThrough(task,end,{today,includeCompleted:true}))if(occurrence.displayDate>=start&&occurrence.displayDate<=end)entries.push({...occurrence.task,...location,occurrenceDate:occurrence.occurrenceDate,completed:occurrence.status==='completed'});
  }else if(task.date>=start&&task.date<=end)entries.push({...task,...location});
 }}}
 return entries.sort((a,b)=>(a.startTime||'99:99').localeCompare(b.startTime||'99:99')||String(a.title||'').localeCompare(String(b.title||'')));
}
export function monthEventEntries(events,start,end){
 if(!calendarDate(start)||!calendarDate(end)||end<start||(Date.parse(end)-Date.parse(start))/86400000>365)return [];
 const entries=[],clock=value=>String(Math.floor(value/60)%24).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 for(let date=start;date<=end;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)){
  for(const {event,startMin,endMin,continued} of eventSegmentsForDate(events,date))entries.push({kind:'event',id:event.id,eventId:event.id,occurrenceDate:event.occurrenceDate,title:String(event.title||'Event'),date,startTime:clock(startMin),endTime:clock(endMin),allDay:event.allDay===true,readOnly:event.readOnly===true||!!event.calendarSourceId,transparent:event.transparent===true,continued});
 }
 return entries.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.title.localeCompare(b.title));
}
export function calendarEventMarkup(event,{hour12=true,detail=false}={}){
 const minutes=parseTime(event.startTime),time=event.allDay?'All day':minutes===null?'':formatTime(minutes,hour12),label=[time,event.title,event.readOnly?'Read-only calendar':null,event.transparent?'Free time':null].filter(Boolean).join(' · ');
 return `<button type="button" class="calendar-task-preview calendar-event-preview${detail?' calendar-detail-occurrence':''}" data-calendar-event="${esc(event.eventId||event.id)}" data-calendar-date="${esc(event.date)}" data-event-occurrence="${esc(event.occurrenceDate||'')}" title="${esc(label)}" aria-label="${esc(label)}">${time?`<span class="calendar-task-time">${esc(time)}</span>`:''}<span class="calendar-task-title">${esc(event.title)}</span>${detail?'<span class="calendar-task-status">'+(event.readOnly?'Read-only calendar':'Open event')+'</span>':''}</button>`;
}
export function calendarTaskMarkup(task,{hour12=true,detail=false}={}){
 if(task.kind==='event')return calendarEventMarkup(task,{hour12,detail});
 const minutes=parseTime(task.startTime),time=minutes===null?'':formatTime(minutes,hour12),label=[time,task.title,task.completed?'Completed':null].filter(Boolean).join(' · ');
 return `<button type="button" class="calendar-task-preview${task.completed?' is-completed':''}${detail?' calendar-detail-occurrence':''}" data-calendar-task="${esc(task.id)}" data-calendar-date="${esc(task.date)}" ${task.occurrenceDate?`data-calendar-occurrence="${esc(task.occurrenceDate)}"`:''} title="${esc(label)}" aria-label="${esc(label)}">${time?`<span class="calendar-task-time">${esc(time)}</span>`:''}<span class="calendar-task-title">${esc(task.title)}</span>${detail?'<span class="calendar-task-status">'+(task.completed?'Completed · ':'')+'Open details</span>':''}</button>`;
}
export function calendarMonthMarkup(selectedDate,entries,{today=toDateKey(new Date()),locale='en',hour12=true}={}){
 const date=calendarDate(selectedDate);if(!date)return '';const year=date.getFullYear(),month=date.getMonth(),first=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate(),previous=new Date(year,month,0).getDate(),weekdays=new Intl.DateTimeFormat(locale,{weekday:'short'}),labels=new Intl.DateTimeFormat(locale,{weekday:'long',year:'numeric',month:'long',day:'numeric'}),byDate=new Map();
 for(const task of entries){if(!byDate.has(task.date))byDate.set(task.date,[]);byDate.get(task.date).push(task)}
 let html=Array.from({length:7},(_,i)=>`<div class="calendar-weekday">${esc(weekdays.format(new Date(2023,0,1+i)))}</div>`).join('');
 for(let i=first-1;i>=0;i--)html+=`<div class="calendar-day outside-month"><span class="day-number">${previous-i}</span></div>`;
 for(let day=1;day<=days;day++){
  const key=toDateKey(new Date(year,month,day,12)),tasks=byDate.get(key)||[],label=labels.format(new Date(year,month,day,12));
  html+=`<div class="calendar-day${key===today?' is-today':''}${key===selectedDate?' is-selected':''}" data-date="${key}"><button type="button" class="calendar-day-open day-number" data-calendar-day aria-label="${esc(label)}, ${tasks.length} ${tasks.length===1?'item':'items'}" aria-pressed="${key===selectedDate}">${day}</button>${tasks.length?`<span class="day-task-badge" aria-hidden="true">${tasks.length}</span><div class="calendar-task-previews">${tasks.slice(0,2).map(task=>calendarTaskMarkup(task,{hour12})).join('')}${tasks.length>2?`<button type="button" class="calendar-day-more" data-calendar-more aria-label="${tasks.length-2} more items on ${esc(label)}">+${tasks.length-2} more</button>`:''}</div>`:''}</div>`;
 }
 for(let day=1;day<=(7-((first+days)%7))%7;day++)html+=`<div class="calendar-day outside-month"><span class="day-number">${day}</span></div>`;
 return html;
}
