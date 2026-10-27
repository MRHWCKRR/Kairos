import {zonedTaskStart} from './task-reminders.js?v=4';
import {stableStringify} from './plan-merge.js?v=1';
import {planningSignature} from './planning-commands.js?v=11';
import {planningClock,validPlanningDate,shiftPlanningDate} from './planning-model.js?v=1';
import {eventSegmentsForDate} from './schedule-events.js?v=1';
import {calendarConflicts} from './calendar-conflicts.js?v=1';
const fields=['id','title','category','date','day','start','end','allDay','transparent'];
const same=(a,b)=>stableStringify(a)===stableStringify(b),object=v=>v&&typeof v==='object'&&!Array.isArray(v),validTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const editable=event=>{if(event&&(event.readOnly||event.calendarSourceId))throw Error('Imported calendar events are read-only. Use Calendars to refresh or remove their source.');};
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=160&&!/[\u0000-\u001f]/.test(id);
function target(state,id){if(!validId(id))throw Error('Invalid event identity.');const found=(state.scheduleEvents||[]).filter(e=>e.id===id);if(found.length>1)throw Error('Duplicate event identity. Review this planner.');editable(found[0]);return structuredClone(found[0]||null);}
function timezoneValid(timezone){if(typeof timezone!=='string'||!timezone||timezone.length>100)throw Error('Choose a valid timezone.');new Intl.DateTimeFormat('en',{timeZone:timezone});}
function inputEvent(value,id){
 if(!object(value)||Object.keys(value).some(k=>!fields.includes(k))||value.id!==id||typeof value.title!=='string'||!value.title.trim()||value.title.length>180||/[\u0000-\u001f]/.test(value.title)||typeof value.category!=='string'||!value.category.trim()||value.category.length>30||typeof value.allDay!=='boolean'||typeof value.transparent!=='boolean')throw Error('Invalid event fields, title or category.');
 const dated=Object.hasOwn(value,'date');if(dated?Object.hasOwn(value,'day')||!validPlanningDate(value.date)||value.date<'1900-01-01'||value.date>'2200-12-30':!Number.isInteger(value.day)||value.day<0||value.day>6)throw Error('Choose a valid event date or weekday.');
 if(!validTime(value.start)||!validTime(value.end)||(value.allDay?(value.start!=='00:00'||value.end!=='00:00'):value.start===value.end))throw Error('Choose valid event times; equal times need All day.');
 return {...value,title:value.title.trim(),category:value.category.trim()};
}
function wallTimes(event,timezone){if(!event?.date||event.allDay)return;const endDate=event.end<=event.start?shiftPlanningDate(event.date,1):event.date;if(zonedTaskStart(event.date,event.start,timezone)===null||zonedTaskStart(endDate,event.end,timezone)===null)throw Error('This event time does not exist in your timezone during a daylight-saving change.');}
function restoredValid(event){editable(event);if(!validId(event.id))throw Error('Invalid saved event identity.');const value=Object.fromEntries(fields.filter(k=>Object.hasOwn(event,k)).map(k=>[k,event[k]]));value.allDay=event.allDay===true;value.transparent=event.transparent===true;value.category=event.category||'other';if(value.date!=null)delete value.day;else{delete value.date;value.day=Number(event.day);}inputEvent(value,event.id);}
function limits(state){if((state.scheduleEvents||[]).filter(e=>!e.calendarSourceId&&!e.readOnly).length>500)throw Error('A planner supports at most 500 native events.');if(new TextEncoder().encode(JSON.stringify(state)).length>700*1024)throw Error('This planner exceeds the 700 KiB event budget. Remove unused content before adding or restoring events.');}
const reviewSignature=state=>planningSignature(state);
const rangeFor=(event,timezone,now)=>event?.date?{from:event.date,to:shiftPlanningDate(event.date,event.allDay||event.end>event.start||event.end==='00:00'?0:1)}:{from:planningClock(now,timezone).date,to:shiftPlanningDate(planningClock(now,timezone).date,30)};
export function nativeEventConflicts(state,event,range,timezone){
 if(!event||event.transparent||event.archived)return [];
 const segments=[],clock=value=>String(Math.floor(value/60)%24).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 // Include a weekly overnight tail just beyond the labelled review window.
 const end=event.date?range.to:shiftPlanningDate(range.to,1);
 for(let date=range.from;date<=end;date=shiftPlanningDate(date,1))for(const {startMin,endMin,continued}of eventSegmentsForDate([event],date)){if(date>range.to&&!continued)continue;segments.push({id:'preview-'+date+'-'+segments.length,title:event.title,date,start:clock(startMin),end:clock(endMin),allDay:startMin===0&&endMin===1440,calendarSourceId:'preview'});}
 return calendarConflicts({...state,calendarSources:[{id:'preview',timezone}],scheduleEvents:segments},'preview',{...planningClock(Date.now(),timezone),timezone});
}
function replace(state,id,event){const next=structuredClone(state),events=next.scheduleEvents||[];next.scheduleEvents=event?events.some(e=>e.id===id)?events.map(e=>e.id===id?structuredClone(event):e):[...events,structuredClone(event)]:events.filter(e=>e.id!==id);return next;}
function undoRecord(before,after,timezone){const record={version:1,eventId:(after||before).id,before,after,timezone};return JSON.stringify(record).length<=24000?record:null;}
export function buildNativeEventChange(state,{eventId,event},timezone,now=Date.now()){
 timezoneValid(timezone);const before=target(state,eventId);if(event===null&&!before)throw Error('This event is no longer available.');
 const normalized=event===null?null:inputEvent(event,eventId);let after=normalized?{...(before||{}),...normalized}:null;if(after){if(normalized.date)delete after.day;else delete after.date;wallTimes(after,timezone);limits(replace(state,eventId,after));}
 const range=rangeFor(after||before,timezone,now),record=undoRecord(before,after,timezone),command={type:'native_event_change',eventId,event:normalized,timezone,range};
 return {command,expected:{before,signature:reviewSignature(state)},range,conflicts:nativeEventConflicts(state,after,range,timezone),undoRecord:record};
}
export function applyNativeEventChange(state,command,expected,{now=Date.now()}={}){
 if(command?.type!=='native_event_change'||Object.keys(command).some(k=>!['type','eventId','event','timezone','range'].includes(k)))throw Error('Invalid native event command.');
 const fresh=buildNativeEventChange(state,command,command.timezone,now);if(!same(fresh.command,command)||!same(fresh.expected,expected))throw Error('The schedule or event changed. Review a new preview.');
 const after=fresh.undoRecord?.after??(command.event?{...(fresh.expected.before||{}),...command.event}:null),next=replace(state,command.eventId,after);
 // Opposite date/day metadata is removed even if Undo was too large to retain.
 if(command.event){const event=next.scheduleEvents.find(e=>e.id===command.eventId);if(command.event.date)delete event.day;else delete event.date;}
 return {next,result:{type:'native_event_change',eventId:command.eventId,...(fresh.undoRecord?{nativeEventUndo:fresh.undoRecord}:{nativeEventUndoUnavailable:true})}};
}
function checkRecord(state,record){if(record?.version!==1||!validId(record.eventId)||!object(record.before)&&record.before!==null||!object(record.after)&&record.after!==null||!record.before&&!record.after)throw Error('This event Undo is unavailable.');if(record.before&&record.before.id!==record.eventId||record.after&&record.after.id!==record.eventId)throw Error('Invalid event Undo identity.');editable(record.before);editable(record.after);if(!same(target(state,record.eventId),record.after))throw Error('This event changed after saving. Review its latest state.');if(record.before){restoredValid(record.before);limits(replace(state,record.eventId,record.before));}}
export function buildNativeEventUndo(state,sourceOperationId,record,timezone,now=Date.now()){
 timezoneValid(timezone);if(typeof sourceOperationId!=='string'||!sourceOperationId||sourceOperationId.length>160)throw Error('Invalid event Undo receipt.');checkRecord(state,record);if(record.timezone!==timezone)throw Error('Your timezone changed. Review the event manually.');
 wallTimes(record.before,timezone);const range=rangeFor(record.before||record.after,timezone,now);return {command:{type:'native_event_undo',sourceOperationId,timezone,range},expected:{sourceOperationId,before:record.before,after:record.after,signature:reviewSignature(state)},range,conflicts:nativeEventConflicts(state,record.before,range,timezone),undoRecord:record};
}
export function applyNativeEventUndo(state,record,command,expected,{now=Date.now()}={}){
 if(command?.type!=='native_event_undo'||Object.keys(command).some(k=>!['type','sourceOperationId','timezone','range'].includes(k)))throw Error('Invalid reviewed event Undo.');const fresh=buildNativeEventUndo(state,command.sourceOperationId,record,command.timezone,now);if(!same(fresh.command,command)||!same(fresh.expected,expected))throw Error('The schedule changed. Preview Undo again.');return {next:replace(state,record.eventId,record.before),result:{type:'native_event_undo',eventId:record.eventId}};
}
