const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const FREQUENCIES=new Set(['daily','weekly','monthly','yearly']);
const MODES=new Set(['fixed','flexible']);
const END_TYPES=new Set(['never','date','count']);
const MONTHLY_MODES=new Set(['date','weekdayPosition']);
const POSITIONS=new Set(['first','second','third','fourth','last']);

function validDateKey(value){
  if(!DATE_RE.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number),dt=new Date(y,m-1,d,12);
  return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d;
}
function clampInt(value,min,max,fallback){const n=Math.trunc(Number(value));return Number.isFinite(n)&&n>=min&&n<=max?n:fallback}
function normalizedWeekdays(values=[]){return [...new Set((Array.isArray(values)?values:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort((a,b)=>a-b)}
function defaultStart(input,fallbackDate){if(validDateKey(input?.startDate))return input.startDate;if(validDateKey(fallbackDate))return fallbackDate;return null}
function dateFromKey(key){const [y,m,d]=String(key).split('-').map(Number);return new Date(y,m-1,d,12)}
function dateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function addDays(key,days){const d=dateFromKey(key);d.setDate(d.getDate()+days);return dateKey(d)}
function dayDiff(a,b){return Math.round((dateFromKey(b)-dateFromKey(a))/86400000)}
function validCandidate(y,m,d){const dt=new Date(y,m-1,d,12);return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d?dateKey(dt):null}
function weekdayPositionDate(year,month,weekday,position){
  if(position==='last'){const last=new Date(year,month,0,12),delta=(last.getDay()-weekday+7)%7;last.setDate(last.getDate()-delta);return dateKey(last)}
  const order={first:1,second:2,third:3,fourth:4}[position]||1,first=new Date(year,month-1,1,12),offset=(weekday-first.getDay()+7)%7,day=1+offset+(order-1)*7;
  return validCandidate(year,month,day);
}
function parseMinutes(value){const match=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));if(!match)return null;const h=Number(match[1]),m=Number(match[2]);return h>=0&&h<24&&m>=0&&m<60?h*60+m:null}
function formatMinutes(value){const n=Math.max(0,Math.min(1440,Math.round(value)));return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
function taskDuration(task){const start=parseMinutes(task?.startTime),end=parseMinutes(task?.endTime);if(start!==null&&end!==null&&end>start)return end-start;const estimate=Math.round(Number(task?.estimatedMinutes));return Number.isFinite(estimate)&&estimate>0?estimate:60}

export function normalizeRecurrence(input={},fallbackDate=null){
  const source=input?.recurrence&&typeof input.recurrence==='object'?input.recurrence:input||{},preset=String(source.preset||'').toLowerCase();
  let frequency=FREQUENCIES.has(source.frequency)?source.frequency:'daily',weekdays=normalizedWeekdays(source.weekdays);
  if(preset==='weekdays'){frequency='weekly';weekdays=[1,2,3,4,5]}
  const startDate=defaultStart(source,fallbackDate),interval=Math.max(1,Math.trunc(Number(source.interval)||1));
  const monthlyMode=frequency==='monthly'&&MONTHLY_MODES.has(source.monthlyMode)?source.monthlyMode:(frequency==='monthly'?'date':null),inferredMonthDay=startDate?Number(startDate.slice(8,10)):1,inferredMonth=startDate?Number(startDate.slice(5,7)):1,endType=END_TYPES.has(source.endType)?source.endType:'never',mode=MODES.has(source.mode)?source.mode:'flexible';
  const rule={enabled:source.enabled===true,frequency,interval,weekdays:frequency==='weekly'?weekdays:[],monthlyMode,monthDay:frequency==='monthly'||frequency==='yearly'?clampInt(source.monthDay,1,31,inferredMonthDay):null,weekdayPosition:frequency==='monthly'&&monthlyMode==='weekdayPosition'&&POSITIONS.has(source.weekdayPosition)?source.weekdayPosition:null,weekday:frequency==='monthly'&&monthlyMode==='weekdayPosition'?clampInt(source.weekday,0,6,startDate?dateFromKey(startDate).getDay():0):null,month:frequency==='yearly'?clampInt(source.month,1,12,inferredMonth):null,startDate,endType,endDate:endType==='date'&&validDateKey(source.endDate)?source.endDate:null,count:endType==='count'?Math.max(1,Math.trunc(Number(source.count)||1)):null,mode,exceptions:source.exceptions&&typeof source.exceptions==='object'&&!Array.isArray(source.exceptions)?structuredClone(source.exceptions):{}};
  if(frequency==='weekly'&&!rule.weekdays.length&&startDate)rule.weekdays=[dateFromKey(startDate).getDay()];
  return rule;
}

export function validateRecurrence(rule){
  if(!rule||typeof rule!=='object')return false;if(rule.enabled!==true)return true;if(!FREQUENCIES.has(rule.frequency))return false;if(!Number.isInteger(rule.interval)||rule.interval<1)return false;if(!validDateKey(rule.startDate))return false;if(!MODES.has(rule.mode))return false;if(!END_TYPES.has(rule.endType))return false;
  if(rule.endType==='date'&&(!validDateKey(rule.endDate)||rule.endDate<rule.startDate))return false;if(rule.endType==='count'&&(!Number.isInteger(rule.count)||rule.count<1))return false;
  if(rule.frequency==='weekly'&&(!Array.isArray(rule.weekdays)||!rule.weekdays.length||rule.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)))return false;
  if(rule.frequency==='monthly'){if(!MONTHLY_MODES.has(rule.monthlyMode))return false;if(rule.monthlyMode==='date'&&(!Number.isInteger(rule.monthDay)||rule.monthDay<1||rule.monthDay>31))return false;if(rule.monthlyMode==='weekdayPosition'&&(!POSITIONS.has(rule.weekdayPosition)||!Number.isInteger(rule.weekday)||rule.weekday<0||rule.weekday>6))return false}
  if(rule.frequency==='yearly'&&(!Number.isInteger(rule.month)||rule.month<1||rule.month>12||!Number.isInteger(rule.monthDay)||rule.monthDay<1||rule.monthDay>31))return false;return true;
}

export function occurrenceId(seriesId,occurrenceDate){return `${String(seriesId)}::${String(occurrenceDate)}`}

function candidateStream(rule,hardEnd){
  const out=[];if(!validateRecurrence(rule)||!rule.enabled)return out;const limit=rule.endType==='date'&&rule.endDate<hardEnd?rule.endDate:hardEnd;
  if(rule.frequency==='daily'){for(let key=rule.startDate;key<=limit;key=addDays(key,rule.interval))out.push(key);return out}
  if(rule.frequency==='weekly'){for(let key=rule.startDate;key<=limit;key=addDays(key,1)){const weeks=Math.floor(dayDiff(rule.startDate,key)/7);if(weeks%rule.interval===0&&rule.weekdays.includes(dateFromKey(key).getDay()))out.push(key)}return out}
  if(rule.frequency==='monthly'){
    const start=dateFromKey(rule.startDate);for(let offset=0;;offset+=rule.interval){const absolute=start.getMonth()+offset,year=start.getFullYear()+Math.floor(absolute/12),month=((absolute%12)+12)%12+1,key=rule.monthlyMode==='weekdayPosition'?weekdayPositionDate(year,month,rule.weekday,rule.weekdayPosition):validCandidate(year,month,rule.monthDay),monthFirst=`${year}-${String(month).padStart(2,'0')}-01`;if(monthFirst>limit)break;if(key&&key>=rule.startDate&&key<=limit)out.push(key)}return out;
  }
  if(rule.frequency==='yearly'){const startYear=dateFromKey(rule.startDate).getFullYear();for(let year=startYear;;year+=rule.interval){const key=validCandidate(year,rule.month,rule.monthDay),yearFirst=`${year}-01-01`;if(yearFirst>limit)break;if(key&&key>=rule.startDate&&key<=limit)out.push(key)}}return out;
}

export function generateOccurrenceDates(input,rangeStart,rangeEnd){const rule=normalizeRecurrence(input);if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(rangeStart)||!validDateKey(rangeEnd)||rangeEnd<rangeStart)return [];let dates=candidateStream(rule,rangeEnd);if(rule.endType==='count')dates=dates.slice(0,rule.count);return dates.filter(key=>key>=rangeStart&&key<=rangeEnd&&(rule.endType!=='date'||key<=rule.endDate))}
export function nextOccurrenceDate(input,afterDate){const rule=normalizeRecurrence(input);if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(afterDate))return null;const maxEnd=rule.endType==='date'?rule.endDate:`${dateFromKey(afterDate).getFullYear()+400}-12-31`,dates=candidateStream(rule,maxEnd),limited=rule.endType==='count'?dates.slice(0,rule.count):dates;return limited.find(key=>key>afterDate)||null}

export function generateTaskOccurrences(task,rangeStart,rangeEnd,options={}){
  const rule=normalizeRecurrence(task,task?.date||rangeStart),today=validDateKey(options.today)?options.today:dateKey(new Date());if(!rule.enabled)return [];
  const logicalDates=generateOccurrenceDates(rule,rangeStart,rangeEnd),seriesId=String(task?.id??'');
  return logicalDates.map(occurrenceDate=>{
    const exception=rule.exceptions?.[occurrenceDate]&&typeof rule.exceptions[occurrenceDate]==='object'?rule.exceptions[occurrenceDate]:null,override=exception?.override&&typeof exception.override==='object'?exception.override:{},effectiveTask={...task,...override,recurrence:task.recurrence},displayDate=validDateKey(override.date)?override.date:occurrenceDate,status=['completed','skipped','deleted'].includes(exception?.status)?exception.status:'pending',duration=override.durationMinutes?Math.max(1,Math.round(Number(override.durationMinutes))):taskDuration(effectiveTask);
    let startTime=null,endTime=null;
    if(rule.mode==='fixed'){startTime=effectiveTask.startTime||null;endTime=effectiveTask.endTime||null;const start=parseMinutes(startTime);if(start!==null&&(!endTime||parseMinutes(endTime)===null))endTime=formatMinutes(start+duration)}
    else if(Object.prototype.hasOwnProperty.call(override,'startTime')){startTime=override.startTime||null;endTime=override.endTime||null;const start=parseMinutes(startTime);if(start!==null&&(!endTime||parseMinutes(endTime)===null))endTime=formatMinutes(start+duration)}
    return {occurrenceId:occurrenceId(seriesId,occurrenceDate),seriesId,occurrenceDate,displayDate,startTime,endTime,durationMinutes:duration,status,isOverdue:status==='pending'&&displayDate<today,isException:!!exception,mode:rule.mode,task:{...effectiveTask,date:displayDate,startTime,endTime}};
  });
}

export function generateTaskOccurrencesThrough(task,rangeEnd,options={}){
  const rule=normalizeRecurrence(task,task?.date||rangeEnd),today=validDateKey(options.today)?options.today:dateKey(new Date());
  if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(rangeEnd)||rangeEnd<rule.startDate)return [];
  const byId=new Map();
  for(const item of generateTaskOccurrences(task,rule.startDate,rangeEnd,{today})){
    if(item.status==='pending'&&item.displayDate<=rangeEnd)byId.set(item.occurrenceId,item);
  }
  for(const [logicalDate,exception] of Object.entries(rule.exceptions||{})){
    const movedDate=exception?.override?.date;
    if(!validDateKey(logicalDate)||logicalDate<=rangeEnd||!validDateKey(movedDate)||movedDate>rangeEnd)continue;
    const item=generateTaskOccurrences(task,logicalDate,logicalDate,{today})[0];
    if(item?.status==='pending'&&item.displayDate<=rangeEnd)byId.set(item.occurrenceId,item);
  }
  return [...byId.values()].sort((a,b)=>a.displayDate.localeCompare(b.displayDate)||a.occurrenceDate.localeCompare(b.occurrenceDate));
}

const DAY_LONG=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],DAY_SHORT=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MONTH_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ordinal(value){const n=Number(value),mod100=n%100;if(mod100>=11&&mod100<=13)return `${n}th`;return `${n}${n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th'}`}
function capital(value){const s=String(value||'');return s?s[0].toUpperCase()+s.slice(1):s}
export function formatRecurrenceSummary(input,options={}){
  const rule=normalizeRecurrence(input,options.fallbackDate||input?.date||null);if(!rule.enabled)return 'Does not repeat';let text='';
  if(rule.frequency==='daily')text=rule.interval===1?'Daily':`Every ${rule.interval} days`;
  else if(rule.frequency==='weekly'){if(rule.interval===1&&rule.weekdays.length===1)text=`Every ${DAY_LONG[rule.weekdays[0]]}`;else text=`Every ${rule.interval===1?'week':`${rule.interval} weeks`} on ${rule.weekdays.map(day=>DAY_SHORT[day]).join('/')}`}
  else if(rule.frequency==='monthly'){if(rule.monthlyMode==='weekdayPosition')text=`${capital(rule.weekdayPosition)} ${DAY_LONG[rule.weekday]} monthly`;else text=rule.interval===1?`Monthly on the ${ordinal(rule.monthDay)}`:`Every ${rule.interval} months on the ${ordinal(rule.monthDay)}`}
  else if(rule.frequency==='yearly')text=`${rule.interval===1?'Yearly':`Every ${rule.interval} years`} on ${MONTH_SHORT[(rule.month||1)-1]} ${rule.monthDay}`;
  text+=rule.mode==='fixed'?' · Fixed time':' · Flexible';if(rule.endType==='date')text+=` · Ends ${rule.endDate}`;if(rule.endType==='count')text+=` · ${rule.count} occurrence${rule.count===1?'':'s'}`;return text;
}

export function setOccurrenceStatus(task,occurrenceDate,status,timestamp=new Date().toISOString()){
  const next=structuredClone(task),rule=normalizeRecurrence(next,next?.date||occurrenceDate),existing=rule.exceptions?.[occurrenceDate]&&typeof rule.exceptions[occurrenceDate]==='object'?structuredClone(rule.exceptions[occurrenceDate]):{};
  existing.status=status;delete existing.completedAt;delete existing.skippedAt;if(status==='completed')existing.completedAt=timestamp;if(status==='skipped')existing.skippedAt=timestamp;
  rule.exceptions={...rule.exceptions,[occurrenceDate]:existing};next.recurrence=rule;return next;
}

export function applyOccurrenceOverride(task,occurrenceDate,changes={}){
  const next=structuredClone(task),rule=normalizeRecurrence(next,next?.date||occurrenceDate),existing=rule.exceptions?.[occurrenceDate]&&typeof rule.exceptions[occurrenceDate]==='object'?structuredClone(rule.exceptions[occurrenceDate]):{},override={};
  for(const [key,value] of Object.entries(changes||{})){
    if(value===undefined||key==='recurrence')continue;
    const baseline=key==='date'?occurrenceDate:key==='durationMinutes'?taskDuration(task):task?.[key];
    if(JSON.stringify(value)!==JSON.stringify(baseline))override[key]=structuredClone(value);
  }
  if(Object.keys(override).length)existing.override=override;else delete existing.override;
  rule.exceptions={...rule.exceptions,[occurrenceDate]:existing};next.recurrence=rule;return next;
}

export function splitRecurringSeries(task,occurrenceDate,edits={},newTaskId){
  const originalTask=structuredClone(task),baseRule=normalizeRecurrence(originalTask,originalTask?.date||occurrenceDate),historical={};
  for(const [key,value] of Object.entries(baseRule.exceptions||{}))if(key<occurrenceDate)historical[key]=structuredClone(value);
  originalTask.recurrence={...baseRule,endType:'date',endDate:addDays(occurrenceDate,-1),count:null,exceptions:historical};
  const recurrenceEdits=edits?.recurrence&&typeof edits.recurrence==='object'?edits.recurrence:{},taskEdits={...edits};delete taskEdits.recurrence;
  const newTask={...structuredClone(task),...structuredClone(taskEdits),id:newTaskId,completed:false};
  newTask.recurrence=normalizeRecurrence({...baseRule,...recurrenceEdits,enabled:true,startDate:occurrenceDate,exceptions:{},endType:recurrenceEdits.endType||baseRule.endType,endDate:recurrenceEdits.endType==='date'?recurrenceEdits.endDate:baseRule.endType==='date'?baseRule.endDate:null,count:recurrenceEdits.endType==='count'?recurrenceEdits.count:baseRule.endType==='count'?baseRule.count:null},occurrenceDate);
  if(newTask.recurrence.endType==='date'&&newTask.recurrence.endDate&&newTask.recurrence.endDate<occurrenceDate){newTask.recurrence.endType='never';newTask.recurrence.endDate=null}
  return {originalTask,newTask};
}
