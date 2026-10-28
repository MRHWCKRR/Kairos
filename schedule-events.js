import {eventOccurrencesForDate} from './event-occurrences.js?v=2';
// Project fixed commitments onto one calendar date. A dated event never falls
// back to its weekday, even if legacy metadata still includes a day field.
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const minutes=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
const priorDate=value=>new Date(Date.parse(value+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function eventSegmentsForDate(events,date,{busyOnly=false}={}){
 if(!validDate(date))return [];
 const day=new Date(date+'T12:00:00Z').getUTCDay(),previous=(day+6)%7,previousDate=priorDate(date),out=[];
 for(const event of events||[]){
  if(!event||event.archived)continue;
  for(const effective of eventOccurrencesForDate(event,date)){
   if(busyOnly&&effective.transparent===true)continue;const start=minutes(effective.start),end=minutes(effective.end);if(start===null||end===null)continue;
   out.push({event:effective,startMin:start,endMin:end>start?end:1440,continued:false});
  }
  for(const effective of eventOccurrencesForDate(event,previousDate)){
   if(busyOnly&&effective.transparent===true)continue;const start=minutes(effective.start),end=minutes(effective.end);if(start!==null&&end!==null&&end<=start&&end>0)out.push({event:effective,startMin:0,endMin:end,continued:true});
  }
 }
 return out;
}

// The AI receives the same occupied segments as the schedule validators.
export function eventCommitmentsForRange(events,from,to){
 if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>366)return [];
 const rows=[],clock=n=>String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 for(let date=from;date<=to;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)){
  for(const {event,startMin,endMin,continued}of eventSegmentsForDate(events,date,{busyOnly:true}))rows.push({id:JSON.stringify([String(event.id),event.occurrenceDate||event.date||date,date,continued]),eventId:String(event.id),title:String(event.title||''),date,...(event.occurrenceDate?{occurrenceDate:event.occurrenceDate}:{}),start:clock(startMin),end:clock(endMin),allDay:startMin===0&&endMin===1440,continued,category:event.category||'other',readOnly:event.readOnly===true||!!event.calendarSourceId});
 }return rows;
}
