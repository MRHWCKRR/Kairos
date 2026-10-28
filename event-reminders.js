import {eventOccurrencesForDate} from './event-occurrences.js?v=3';
import {zonedTaskStart} from './task-reminders.js?v=8';

export const validEventReminder=value=>value===undefined||value===null||value==='default'||[5,15,30,60].includes(value);
export const eventReminderNotice='Reminders are checked while Kairos is open. Browser popups need notification permission; saving does not grant permission.';
export function eventReminderText(event){
 if(event?.allDay)return 'Reminder: Off for all-day events.';
 if(event?.reminderMinutes===null)return 'Reminder: Off.';
 if([5,15,30,60].includes(event?.reminderMinutes))return 'Reminder: '+event.reminderMinutes+' minutes before.';
 return event?.category==='sleep'&&event.transparent!==true?'Reminder: Use default (15-minute bedtime reminder, subject to the bedtime setting).':'Reminder: Use default (no reminder).';
}

// A maximum one-hour lead only needs today and tomorrow, including moved
// occurrences whose logical identity lies outside this display-date window.
export function dueEventReminders(events,now=Date.now(),timeZone='UTC'){
 let today;
 try{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));today=p.year+'-'+p.month+'-'+p.day;}catch{return [];}
 const tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),out=[];
 for(const date of [today,tomorrow])for(const event of (events||[]).flatMap(source=>eventOccurrencesForDate(source,date))){
  if(typeof event?.id!=='string'||!event.id||event.archived||event.readOnly||event.calendarSourceId||event.allDay||![5,15,30,60].includes(event.reminderMinutes))continue;
  const startsAt=zonedTaskStart(date,event.start,timeZone);if(startsAt===null)continue;
  const dueAt=startsAt-event.reminderMinutes*60000,id='event-reminder:'+event.id+':'+(event.occurrenceDate?event.occurrenceDate+':':'')+startsAt+':'+event.reminderMinutes;
  if(dueAt<=now&&now<startsAt&&!out.some(c=>c.id===id))out.push({id,eventId:event.id,...(event.occurrenceDate?{occurrenceDate:event.occurrenceDate}:{}),title:String(event.title||'Event'),date,startTime:event.start,minutesBefore:event.reminderMinutes,dueAt,startsAt});
 }
 return out;
}
