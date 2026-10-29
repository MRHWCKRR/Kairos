import {eventReminderText,eventReminderNotice} from './event-reminders.js?v=1';
import {eventOccurrence} from './event-occurrences.js?v=3';
import {validateActionShape} from './ai-action-schema.js?v=16';
import {buildNativeEventChange,applyNativeEventChange} from './native-event-commands.js?v=6';
import {stableStringify} from './plan-merge.js?v=1';
import {plannerChangeRows} from './planner-changes.js?v=2';
const types=['create_schedule_event','update_schedule_event','delete_schedule_event'];
export const isAiEventAction=type=>types.includes(type);
const same=(a,b)=>stableStringify(a)===stableStringify(b);
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3)),clock=value=>String(Math.floor(value/60)%24).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function findEvent(state,args){
 const title=args.title?.trim().toLowerCase(),matches=(state.scheduleEvents||[]).filter(e=>args.eventId?e.id===args.eventId:title&&String(e.title||'').trim().toLowerCase()===title);
 if(matches.length!==1)throw Error(matches.length?'Multiple schedule events match. Choose an exact event ID.':'Schedule event not found.');const event=matches[0];
 if(event.readOnly||event.calendarSourceId)throw Error('Imported calendar events are read-only. Use Calendars to refresh or remove the source.');if(event.archived)throw Error('This event is archived. Review it in Schedule.');return event;
}
function proposal(state,action,{eventIdFactory}){
 const {type,args}=action,creating=type==='create_schedule_event',series=creating?null:findEvent(state,args),before=args.occurrenceDate?eventOccurrence(series,args.occurrenceDate,{includeSkipped:true,includeInactive:args.restoreOccurrence===true}):series,id=series?.id||eventIdFactory();
 if(args.occurrenceDate&&!before)throw Error('Choose a valid original weekly occurrence date.');
 if(['intervalWeeks','anchorDate'].some(k=>args[k]!==undefined)&&before?.date&&args.day===undefined)throw Error('Repeat interval and reference date apply to a series only.');
 if(args.intervalWeeks===2&&before?.intervalWeeks!==2&&!args.anchorDate)throw Error('Every 2 weeks requires a reference occurrence date.');
 if(['startDate','endDate'].some(k=>args[k]!==undefined)&&before?.date&&args.day===undefined)throw Error('First and last dates apply to a weekly series, not a one-off event.');
 const occurrence=args.occurrenceDate?{occurrenceDate:args.occurrenceDate,occurrenceOperation:args.restoreOccurrence?'restore':type==='delete_schedule_event'?'skip':'update'}:{};
 if(creating&&(state.scheduleEvents||[]).some(e=>e.id===id))throw Error('This new event identity is already in use. Review again.');
 const pinned={type,args:{...args,...(!creating?{eventId:id}:{})}};
 if(type==='delete_schedule_event'||args.restoreOccurrence)return {action:pinned,before,event:null,eventId:id,...occurrence};
 const allDay=args.allDay??before?.allDay??false,transparent=args.transparent??before?.transparent??false;
 const reminderMinutes=args.reminderMinutes!==undefined?args.reminderMinutes:allDay&&typeof before?.reminderMinutes==='number'?null:before?.reminderMinutes;
 const reminder=reminderMinutes!==undefined?{reminderMinutes}:{};
 let start=args.start??before?.start,end=args.end??before?.end;
 if(allDay&&['start','end'].some(key=>args[key]!==undefined&&args[key]!=='00:00'))throw Error('An all-day event needs both times and allDay:false for a timed move.');
 if(allDay){start='00:00';end='00:00';}
 else if(before?.allDay===true&&args.allDay===false&&(args.start===undefined||args.end===undefined))throw Error('Choose both times when changing an all-day event to a timed event.');
 else if(before&&!before.allDay&&args.start!==undefined&&args.end===undefined){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(before.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(before.end))throw Error('Review this event duration in Schedule.');
  const duration=(minutes(before.end)-minutes(before.start)+1440)%1440;if(!duration)throw Error('Choose both time boundaries for this event.');end=clock(minutes(start)+duration);
 }
 const bounds=!args.occurrenceDate&&args.date===undefined&&(args.day!==undefined||before?.day!==undefined)?Object.fromEntries(['startDate','endDate'].filter(k=>args[k]!==undefined||before?.[k]!==undefined).map(k=>[k,args[k]!==undefined?args[k]:before[k]])):{};
 const cadence=args.date!==undefined?{date:args.date}:args.day!==undefined?{day:args.day}:before?.date?{date:before.date}:{day:before?.day};
 const repeat=cadence.day!==undefined?Object.fromEntries(['intervalWeeks','anchorDate'].filter(k=>args[k]!==undefined||before?.[k]!==undefined).map(k=>[k,args[k]!==undefined?args[k]:before[k]])):{};
 // Clear the obsolete phase explicitly so the merged weekly event can change
 // weekday, just as a conversion in the native editor can.
 if((repeat.intervalWeeks??1)===1&&Object.hasOwn(repeat,'anchorDate'))repeat.anchorDate=null;
 return {action:pinned,before,eventId:id,...occurrence,event:{id,title:args.newTitle??(creating?args.title:before.title),category:args.category??before?.category??'other',...cadence,...bounds,...repeat,...reminder,start,end,allDay,transparent}};
}
export function aiEventConflictSummary(conflicts){return {conflictCount:conflicts.length,omittedConflicts:Math.max(0,conflicts.length-50),conflicts:conflicts.slice(0,50).map(row=>({key:row.key,title:row.title,date:row.date,startTime:row.startTime,endTime:row.endTime}))};}
export function previewAiEventChange(state,action,timezone,{now=Date.now(),eventIdFactory=()=> 'event-'+crypto.randomUUID()}={}){
 if(!isAiEventAction(action?.type))throw Error('Unsupported AI event action.');validateActionShape(action);const p=proposal(state,action,{eventIdFactory}),built=buildNativeEventChange(state,p,timezone,now),applied=applyNativeEventChange(state,built.command,built.expected,{now});
 return {action:p.action,approval:{request:stableStringify(p.action),command:built.command,expected:built.expected},summary:{kind:'native-event',title:String((p.event||p.before).title),timezone,range:built.range,before:built.beforeEvent,event:built.afterEvent,...(p.occurrenceDate?{occurrenceDate:p.occurrenceDate,occurrenceOperation:p.occurrenceOperation}:{}),inactiveExceptions:built.inactiveExceptions,reactivatedExceptions:built.reactivatedExceptions,...aiEventConflictSummary(built.conflicts),rows:plannerChangeRows(state,applied.next)}};
}
export function applyAiEventChange(state,action,approval,{now=Date.now()}={}){
 if(isAiEventAction(action?.type)&&action.type!=='create_schedule_event')findEvent(state,action.args);
 if(!approval?.command||approval.command.type!=='native_event_change'||approval.request!==stableStringify(action))throw Error('A matching reviewed event preview is required.');
 const fresh=previewAiEventChange(state,action,approval.command.timezone,{now,eventIdFactory:()=>approval.command.eventId});
 if(!same(fresh.action,action)||!same(fresh.approval,approval))throw Error('The event or schedule changed. Review a new preview.');
 const out=applyNativeEventChange(state,approval.command,approval.expected,{now}),event=action.type==='delete_schedule_event'?fresh.summary.before||findEvent(state,action.args):approval.command.occurrenceDate?eventOccurrence(out.next.scheduleEvents.find(e=>e.id===approval.command.eventId),approval.command.occurrenceDate)||fresh.summary.before:out.next.scheduleEvents.find(e=>e.id===approval.command.eventId);
 return {next:out.next,result:{...out.result,type:action.type,event,...(approval.command.occurrenceDate?{occurrenceDate:approval.command.occurrenceDate,occurrenceOperation:approval.command.occurrenceOperation}:{})}};
}
function describe(event){if(!event)return 'Removed';const date=event.date||(event.intervalWeeks===2?'Every 2 weeks on ':'Every ')+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][event.day];return date+(event.day!==undefined?(event.intervalWeeks===2?' (reference '+event.anchorDate+')':'')+' (first '+(event.startDate||'unlimited')+', last '+(event.endDate||'unlimited')+')':'')+' · '+(event.allDay?'All day':event.start+'–'+event.end+(event.end<event.start?' (next day)':''))+' · '+(event.category||'other')+' · '+(event.transparent?'Free':'Busy')+' '+eventReminderText(event);}
export function aiEventPreviewMarkup(summary){
 return (summary.inactiveExceptions||[]).map(r=>'<p>'+esc(r.occurrenceDate+' (destination '+r.date+')')+' becomes inactive; saved exception retained.</p>').join('')+(summary.reactivatedExceptions||[]).map(r=>'<p>'+esc(r.occurrenceDate+' (destination '+r.date+')')+' becomes active again with its saved exception.</p>').join('')+(summary.occurrenceDate?'<p><strong>'+esc(summary.occurrenceOperation==='restore'?'Restore occurrence':summary.occurrenceOperation==='skip'?'Skip occurrence':'This occurrence')+'</strong> · Original date '+esc(summary.occurrenceDate)+'. Other weeks stay unchanged.</p>':'')+'<p>'+esc(eventReminderNotice)+'</p><p>Times use '+esc(summary.timezone)+'. Review '+esc(summary.range.from)+' through '+esc(summary.range.to)+'.'+(!(summary.event||summary.before)?.date?' Later weekly conflicts are not checked.':'')+'</p><div class="ai-planning-preview ai-event-preview" tabindex="0" role="region" aria-label="Event changes"><table><caption>'+esc(summary.title)+'</caption><thead><tr><th>Before</th><th>After</th></tr></thead><tbody><tr><td>'+esc(summary.before?summary.before.title+' · '+describe(summary.before):summary.occurrenceDate?'Inactive or skipped occurrence':'New event')+'</td><td>'+esc(summary.event?summary.event.title+' · '+describe(summary.event):summary.occurrenceOperation==='restore'?'Restore weekly settings; date remains inactive':summary.occurrenceOperation==='undo'?'Restore saved inactive or skipped state':summary.occurrenceDate?'Skip occurrence':'Delete event')+'</td></tr></tbody></table></div><p>Tasks are not moved automatically. '+(summary.conflictCount??summary.conflicts.length)+' unfinished task overlap'+((summary.conflictCount??summary.conflicts.length)===1?'':'s')+' in this range.</p>'+(summary.conflicts.length?'<ul class="ai-action-preview-list">'+summary.conflicts.map(row=>'<li><strong>'+esc(row.title)+'</strong> · '+esc(row.date+' '+row.startTime+'–'+row.endTime)+'</li>').join('')+'</ul>':'')+(summary.omittedConflicts?'<p>'+summary.omittedConflicts+' additional overlaps are not shown; showing the first 50. Review the full schedule for this range.</p>':'');
}
