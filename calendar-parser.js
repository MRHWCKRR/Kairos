import ICAL from './calendar-ical.js?v=1';

const DAY=86400000,MAX_BYTES=1024*1024,MAX_EVENTS=1000,MAX_STEPS=20000;
const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);
const pad=value=>String(value).padStart(2,'0');
const dateKey=t=>String(t.year).padStart(4,'0')+'-'+pad(t.month)+'-'+pad(t.day);
const clock=t=>pad(t.hour)+':'+pad(t.minute);
const logicalKey=time=>time.isDate?'date:'+dateKey(time):'instant:'+time.toUnixTime();
const scheduledProperties=new Set(['dtstart','dtend','recurrence-id','rdate','exdate']);
function validateRawDates(component){
 for(const property of component[1]||[])if(scheduledProperties.has(property[0])&&['date','date-time'].includes(property[2]))for(const value of property.slice(3)){if(typeof value!=='string'||!dateValid(value.slice(0,10))||property[2]==='date-time'&&!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ?$/.test(value))error('Invalid calendar date or time.');}
 for(const child of component[2]||[])validateRawDates(child);
}
const cancelled=component=>String(component.getFirstPropertyValue('status')||'').toUpperCase()==='CANCELLED';
const error=message=>{throw Error(message)};
// ICAL constructs recurrence iterators while resolving timezone observances and
// inside iterator.init(), before the outer occurrence loop can install guards.
// Scope the guard to this synchronous expansion and restore exact descriptors
// before hashing yields, so concurrent imports never inherit another budget.
function withRecurrenceBudget(work){
 const prototype=ICAL.RecurIterator.prototype,originals=[],started=Date.now();let operations=0;
 try{
  for(const name of Object.getOwnPropertyNames(prototype)){
   if(name==='constructor')continue;const descriptor=Object.getOwnPropertyDescriptor(prototype,name);
   if(typeof descriptor.value!=='function')continue;originals.push([name,descriptor]);
   Object.defineProperty(prototype,name,{...descriptor,value:function(...args){if(++operations>200000||Date.now()-started>500)error('Calendar recurrence search exceeded its safe limit. Export a smaller or more recent calendar.');return descriptor.value.apply(this,args);}});
  }
  return work();
 }finally{for(const [name,descriptor] of originals)Object.defineProperty(prototype,name,descriptor);}
}
function validateObservances(calendar,to){
 const zones=calendar.getAllSubcomponents('vtimezone');if(zones.length>100)error('This calendar contains too many timezone definitions.');
 for(const zone of zones){
  const observances=zone.getAllSubcomponents();if(observances.length>100)error('This calendar contains too many timezone transitions.');
  for(const observance of observances){
   if(!['standard','daylight'].includes(observance.name))error('This calendar timezone definition is not supported.');
   for(const property of observance.getAllProperties('rrule'))if(property.getFirstValue().freq!=='YEARLY')error('This timezone recurrence frequency is not supported.');
   validateRules(observance,to);
  }
 }
}
function formatter(timezone){try{return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})}catch{error('This calendar uses an unsupported timezone.')}}
function parts(format,epoch){return Object.fromEntries(format.formatToParts(new Date(epoch)).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));}
const wallStamp=t=>Date.UTC(t.year,t.month-1,t.day,t.hour||0,t.minute||0,t.second||0);
function wallEpoch(t,format){
 const wanted=wallStamp(t),offsets=new Set([-2,-1,0,1,2].map(day=>{const epoch=wanted+day*DAY;return wallStamp(parts(format,epoch))-epoch;})),matches=[];
 for(const offset of offsets){const epoch=wanted-offset;if(wallStamp(parts(format,epoch))===wanted)matches.push(epoch);}
 if(!matches.length)error('A calendar time does not exist in its timezone during a daylight-saving change.');
 return Math.min(...matches);
}
function prepareTimezones(calendar,timezone){
 const zoneCache=new Map(),original=calendar.getTimeZoneByID.bind(calendar);
 function zone(id){const supplied=original(id);if(supplied)return supplied;if(zoneCache.has(id))return zoneCache.get(id);const format=formatter(id),value=new ICAL.Timezone({tzid:id});value.utcOffset=time=>(wallStamp(time)-wallEpoch(time,format))/1000;zoneCache.set(id,value);return value;}
 calendar.getTimeZoneByID=id=>zone(id);
 const floating=zone(timezone);
 function walk(component){
  for(const property of component.getAllProperties()){
   if(!scheduledProperties.has(property.name))continue;
   if(property.type==='date-time')for(const time of property.getValues()){if(!time.isDate&&time.zone===ICAL.Timezone.localTimezone&&!property.getParameter('tzid'))time.zone=floating;if(time.second!==0)error('Calendar times with seconds are not supported. Export events on whole-minute boundaries.');if(time.year<1900||time.year>2200)error('Calendar dates must be between 1900 and 2200.');}
   if(property.type==='period')error('RDATE periods are not supported. Use explicit calendar events instead.');
  }
  for(const child of component.getAllSubcomponents())if(child.name!=='vtimezone')walk(child);
 }
 walk(calendar);
 return floating;
}
function validateRules(component,to){
 const rules=component.getAllProperties('rrule');if(rules.length>1||component.hasProperty('exrule'))error('This calendar uses an unsupported recurrence combination.');
 for(const property of rules){
  const rule=property.getFirstValue();if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(rule.freq))error('This recurrence frequency is not supported. Use daily, weekly, monthly or yearly events.');
  if(!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>10000||rule.count!==null&&rule.count!==undefined&&(!Number.isSafeInteger(rule.count)||rule.count<1))error('Invalid calendar recurrence interval or count.');
  const allowed=new Set(['BYDAY','BYMONTH','BYMONTHDAY','BYSETPOS']);
  for(const [key,values] of Object.entries(rule.parts)){
   if(!allowed.has(key)||!Array.isArray(values)||values.length>31||!values.length)error('This calendar recurrence rule is not supported.');
   if(key==='BYDAY'&&values.some(value=>!/^([+-]?[1-5])?(SU|MO|TU|WE|TH|FR|SA)$/.test(String(value))))error('Invalid calendar recurrence weekday.');
   if(key==='BYMONTH'&&values.some(value=>!Number.isInteger(value)||value<1||value>12))error('Invalid calendar recurrence month.');
   if(['BYMONTHDAY','BYSETPOS'].includes(key)&&values.some(value=>!Number.isInteger(value)||value===0||Math.abs(value)>31))error('Invalid calendar recurrence day.');
  }
  if(rule.parts.BYMONTH&&rule.parts.BYMONTHDAY&&!rule.parts.BYMONTH.some(month=>rule.parts.BYMONTHDAY.some(day=>Math.abs(day)<=new Date(Date.UTC(2000,month,0)).getUTCDate())))error('This recurrence describes an impossible calendar date.');
  if(rule.parts.BYSETPOS&&(rule.parts.BYSETPOS.length>1||!rule.parts.BYDAY))error('This calendar recurrence position is not supported.');
  if(['DAILY','WEEKLY'].includes(rule.freq)&&rule.parts.BYDAY?.some(value=>/^[-+\d]/.test(String(value))))error('Ordinal weekdays need monthly or yearly recurrence.');
  // Bound even the library's internal search, rather than only emitted dates.
  const cap=ICAL.Time.fromDateString(shift(to,2));cap.isDate=false;cap.hour=23;cap.minute=59;cap.second=59;
  if(!rule.until||rule.until.compare(cap)>0)rule.until=cap;
 }
}
function plainTitle(component){const title=String(component.getFirstPropertyValue('summary')||'Calendar event').replace(/[\u0000-\u001f\u007f]/g,' ').trim();if(title.length>180)error('A calendar event title exceeds 180 characters. Shorten it before importing.');return title||'Calendar event';}
function validateRawRules(text){
 const allowed=new Set(['FREQ','UNTIL','COUNT','INTERVAL','BYDAY','BYMONTH','BYMONTHDAY','BYSETPOS','WKST']);
 for(const line of text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/)){
  if(!/^RRULE[:;]/i.test(line))continue;
  if(!/^RRULE:/i.test(line))error('This calendar recurrence syntax is not supported.');
  const fields=new Map();
  for(const part of line.slice(6).split(';')){
   const match=/^([A-Z]+)=(.+)$/i.exec(part);if(!match)error('Invalid calendar recurrence syntax.');
   const key=match[1].toUpperCase(),value=match[2];if(!allowed.has(key)||fields.has(key))error('This calendar recurrence field is invalid or unsupported.');fields.set(key,value);
   if(['COUNT','INTERVAL'].includes(key)&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<1))error('Invalid calendar recurrence interval or count.');
   if(['BYMONTH','BYMONTHDAY','BYSETPOS'].includes(key)&&!value.split(',').every(part=>/^[+-]?\d+$/.test(part)))error('Invalid calendar recurrence number.');
   if(key==='WKST'&&!/^(SU|MO|TU|WE|TH|FR|SA)$/.test(value))error('Invalid calendar recurrence week start.');
   if(key==='UNTIL'){
    const date=/^(\d{4})(\d{2})(\d{2})(?:T([01]\d|2[0-3])([0-5]\d)([0-5]\d)Z?)?$/.exec(value);
    if(!date||!dateValid(date[1]+'-'+date[2]+'-'+date[3]))error('Invalid calendar recurrence end date.');
   }
  }
  if(!fields.has('FREQ')||fields.has('COUNT')&&fields.has('UNTIL'))error('Invalid calendar recurrence combination.');
 }
}
function expand(text,{timezone,from,to}){
 validateRawRules(text);
 let parsed;try{parsed=ICAL.parse(text)}catch{error('This file is not a valid iCalendar calendar.');}
 if(!Array.isArray(parsed)||parsed[0]!=='vcalendar')error('Choose an iCalendar (.ics) calendar file.');
 validateRawDates(parsed);
 const calendar=new ICAL.Component(parsed);validateObservances(calendar,to);prepareTimezones(calendar,timezone);
 const components=calendar.getAllSubcomponents('vevent');if(components.length>2000)error('This calendar contains too many event definitions.');
 const groups=new Map(),rows=[],seen=new Set(),format=formatter(timezone);let steps=0;
 for(const component of components){const uid=component.getFirstPropertyValue('uid');if(typeof uid!=='string'||!uid||uid.length>2048)error('Every calendar event needs a valid UID.');const group=groups.get(uid)||{master:null,exceptions:new Map()};const recurrence=component.getFirstPropertyValue('recurrence-id');if(recurrence){if(component.getFirstProperty('recurrence-id').getParameter('range'))error('RANGE recurrence changes are not supported. Export individual changed occurrences.');const key=logicalKey(recurrence);if(group.exceptions.has(key))error('Duplicate calendar occurrence identity.');group.exceptions.set(key,component);}else{if(group.master)error('Duplicate calendar event UID.');group.master=component;}groups.set(uid,group);}
 function add(uid,logical,start,end,component,recurring){
  if(cancelled(component))return;
  if(!start||!end||start.isDate!==end.isDate)error('A calendar event needs compatible start and end dates.');
  const allDay=start.isDate,transparent=String(component.getFirstPropertyValue('transp')||'').toUpperCase()==='TRANSPARENT',title=plainTitle(component);
  let first,last,startLocal,endLocal;
  if(allDay){first=dateKey(start);last=dateKey(end);if(last<=first)error('An all-day calendar end must be after its start.');}
  else{const a=start.toUnixTime()*1000,b=end.toUnixTime()*1000;if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)error('A calendar event end must be after its start.');startLocal=parts(format,a);endLocal=parts(format,b);first=dateKey(startLocal);last=dateKey(endLocal);if(startLocal.second||endLocal.second)error('Calendar times with seconds are not supported.');}
  if(first>to||last<from)return;
  let date=first<from?from:first;
  for(;date<=to&&date<=last;date=shift(date,1)){
   if(++steps>MAX_STEPS)error('Calendar recurrence expansion exceeded its safe limit. Use a smaller date range.');
   if(date===last&&(allDay||clock(endLocal)==='00:00'))break;
   const startTime=allDay||date!==first?'00:00':clock(startLocal),endTime=allDay||date!==last?'00:00':clock(endLocal),position=Math.round((Date.parse(date)-Date.parse(first))/DAY),identity=uid+'\u0000'+logical+'\u0000'+(recurring?date:position);
   if(seen.has(identity))continue;seen.add(identity);rows.push({identity,title,date,start:startTime,end:endTime,allDay,transparent});if(rows.length>MAX_EVENTS)error('This import exceeds 1000 calendar event segments. Choose a smaller date range.');
  }
 }
 for(const [uid,group] of groups){
  const master=group.master;if(master&&cancelled(master))continue;
  for(const [logical,component] of group.exceptions){if(cancelled(component))continue;const exception=new ICAL.Event(component,{exceptions:[]});add(uid,logical,exception.startDate,exception.endDate,component,true);}
  if(!master)continue;
  if(!master.hasProperty('dtstart'))error('A calendar event is missing its start date.');validateRules(master,to);
  const event=new ICAL.Event(master,{exceptions:[],strictExceptions:true});
  if(!event.isRecurring()){add(uid,'single',event.startDate,event.endDate,master,false);continue;}
  const iterator=event.iterator();
  for(const ruleIterator of iterator.ruleIterators){const check=ruleIterator.check_contracting_rules.bind(ruleIterator);ruleIterator.check_contracting_rules=function(){if(++steps>MAX_STEPS)error('Calendar recurrence expansion exceeded its safe limit. Use a smaller date range.');return check();};}
  let occurrence;while((occurrence=iterator.next())){
   if(++steps>MAX_STEPS)error('Calendar recurrence expansion exceeded its safe limit. Use a smaller date range.');if(dateKey(occurrence)>shift(to,2))break;
   const logical=logicalKey(occurrence);if(group.exceptions.has(logical))continue;const details=event.getOccurrenceDetails(occurrence);add(uid,logical,details.startDate,details.endDate,master,true);
  }
 }
 return {rows,name:String(calendar.getFirstPropertyValue('x-wr-calname')||'').trim().slice(0,120)};
}
export async function parseCalendar(text,options={}){
 const {sourceId,timezone,from,to}=options;
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)error('Calendar files must be no larger than 1 MiB.');
 if(typeof sourceId!=='string'||!sourceId||!dateValid(from)||!dateValid(to)||to<from||(Date.parse(to)-Date.parse(from))/DAY>365||from<'1900-01-01'||to>'2200-12-31')error('Choose a valid calendar range of up to 366 days.');formatter(timezone);
 const {rows,name}=withRecurrenceBudget(()=>expand(text,{timezone,from,to})),events=[];
 for(const row of rows){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.identity)),externalId=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');const {identity,...event}=row;events.push({externalId,...event});}
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.externalId.localeCompare(b.externalId));return {events,warnings:[],name};
}
