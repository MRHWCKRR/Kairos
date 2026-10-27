import {stableStringify} from './plan-merge.js?v=1';
import {normaliseCalendarFeedUrl} from './calendar-feed-url.js?v=1';

const sourceFields=['id','name','kind','url','timezone','from','to','updatedAt'];
const eventFields=['externalId','title','date','start','end','allDay','transparent'];
const same=(left,right)=>stableStringify(left)===stableStringify(right);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>object(value)&&Object.keys(value).every(key=>keys.includes(key));
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const time=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const sources=state=>Array.isArray(state.calendarSources)?state.calendarSources:[];
const events=state=>Array.isArray(state.scheduleEvents)?state.scheduleEvents:[];

function validateSource(value){
 if(!only(value,sourceFields)||typeof value.id!=='string'||!(/^[a-zA-Z0-9_-]{1,64}$/).test(value.id)||!text(value.name,120)||!['file','feed'].includes(value.kind)||!date(value.from)||!date(value.to)||value.to<value.from||(Date.parse(value.to)-Date.parse(value.from))/86400000>365||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<=0)throw Error('Invalid calendar source, dates or import range. Choose up to 366 days.');
 if(typeof value.timezone!=='string'||value.timezone.length>100)throw Error('Choose a valid calendar timezone.');
 try{new Intl.DateTimeFormat('en',{timeZone:value.timezone});}catch{throw Error('Choose a valid calendar timezone.');}
 if(value.kind==='feed'){
  if(typeof value.url!=='string'||value.url.length>2048||normaliseCalendarFeedUrl(value.url)!==value.url)throw Error('Choose a supported published calendar feed.');
 }else if(Object.hasOwn(value,'url'))throw Error('A file calendar cannot contain a feed URL.');
 return {...value,name:value.name.trim()};
}
function importedEvents(source,input){
 if(!Array.isArray(input)||input.length>1000)throw Error('A calendar import supports at most 1000 event segments.');
 const identities=new Set();
 return input.map(item=>{
  if(!only(item,eventFields)||typeof item.externalId!=='string'||!(/^[a-f0-9]{64}$/).test(item.externalId)||!text(item.title,180)||!date(item.date)||item.date<source.from||item.date>source.to||!time(item.start)||!time(item.end)||typeof item.allDay!=='boolean'||typeof item.transparent!=='boolean'||item.end!=='00:00'&&item.end<=item.start||item.start===item.end&&item.start!=='00:00'||item.allDay&&(item.start!=='00:00'||item.end!=='00:00'))throw Error('Invalid imported calendar event or date range.');
  if(identities.has(item.externalId))throw Error('Duplicate calendar event identity.');identities.add(item.externalId);
  return {id:source.id+'-'+item.externalId,title:item.title.trim(),date:item.date,start:item.start,end:item.end,allDay:item.allDay,transparent:item.transparent,readOnly:true,calendarSourceId:source.id,externalId:item.externalId,category:'other'};
 });
}
function baseline(state,id){
 const matches=sources(state).filter(source=>source.id===id);
 if(matches.length>1)throw Error('Duplicate calendar sources. Review this planner.');
 return {source:structuredClone(matches[0]||null),events:structuredClone(events(state).filter(event=>event.calendarSourceId===id))};
}
function summary(before,after){
 const old=new Map(before.map(event=>[event.id,event])),next=new Map(after.map(event=>[event.id,event]));
 return {added:after.filter(event=>!old.has(event.id)).length,updated:after.filter(event=>old.has(event.id)&&!same(old.get(event.id),event)).length,removed:before.filter(event=>!next.has(event.id)).length,unchanged:after.filter(event=>old.has(event.id)&&same(old.get(event.id),event)).length};
}
function validateLimits(next){
 if(sources(next).length>10)throw Error('A planner supports at most 10 imported calendar sources.');
 if(events(next).filter(event=>event.calendarSourceId).length>1000)throw Error('A planner supports at most 1000 imported event segments. Use a shorter date range.');
 if(new TextEncoder().encode(JSON.stringify(next)).byteLength>700*1024)throw Error('This planner is too large to import safely. Use a shorter date range or remove unused calendars.');
}

export function buildCalendarSync(state,source,input){
 const command={type:'calendar_sync',source:validateSource(source),events:structuredClone(input)},expected=baseline(state,source.id);
 const out=applyCalendarCommand(state,command,expected);
 return {command,expected,summary:summary(expected.events,out.next.scheduleEvents.filter(event=>event.calendarSourceId===source.id))};
}
export function buildCalendarRemove(state,sourceId){
 const expected=baseline(state,sourceId);if(!expected.source)throw Error('This calendar source is missing or unavailable.');
 const command={type:'calendar_remove',sourceId};applyCalendarCommand(state,command,expected);
 return {command,expected,summary:{added:0,updated:0,removed:expected.events.length,unchanged:0}};
}
export function applyCalendarCommand(state,command,expected){
 if(!['calendar_sync','calendar_remove'].includes(command?.type)||!only(command,command.type==='calendar_sync'?['type','source','events']:['type','sourceId'])||!only(expected,['source','events'])||!Array.isArray(expected.events))throw Error('Invalid calendar command.');
 const source=command.type==='calendar_sync'?validateSource(command.source):null,id=source?.id||command.sourceId;
 if(typeof id!=='string'||!(/^[a-zA-Z0-9_-]{1,64}$/).test(id))throw Error('Invalid calendar source ID.');
 const current=baseline(state,id);
 if(!same(current,expected))throw Error('This calendar source changed. Review a fresh calendar preview.');
 if(!source&&!current.source)throw Error('This calendar source is missing or unavailable.');
 const next=structuredClone(state),remainingSources=sources(next).filter(item=>item.id!==id),remainingEvents=events(next).filter(item=>item.calendarSourceId!==id);
 const imported=source?importedEvents(source,command.events):[];
 if(source?.kind==='feed'&&remainingSources.some(item=>item.kind==='feed'&&item.url===source.url))throw Error('This calendar feed is already imported. Refresh its existing source.');
 const ids=new Set(remainingEvents.map(item=>item.id));
 for(const event of imported){if(ids.has(event.id))throw Error('This calendar event ID already exists. Review the planner.');ids.add(event.id);}
 next.calendarSources=source?[...remainingSources,source]:remainingSources;
 next.scheduleEvents=[...remainingEvents,...imported];if(source)validateLimits(next);
 const changes=summary(current.events,imported);
 return {next,result:{type:command.type,affectedCount:changes.added+changes.updated+changes.removed,sourceId:id}};
}
