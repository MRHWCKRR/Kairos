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

// Validate supplied edits before legacy read-time normalization can repair them.
export function assertRecurrenceInput(input){
 const invalid=field=>{throw Error('Invalid repeat rule: review '+field+'.');};
 if(!input||typeof input!=='object'||Array.isArray(input)||input.enabled!==true)invalid('enabled');
 for(const [field,values] of [['frequency',FREQUENCIES],['mode',MODES],['endType',END_TYPES]])if(input[field]!==undefined&&!values.has(input[field]))invalid(field);
 if(Object.hasOwn(input,'interval')&&input.interval==null)invalid('interval');
 for(const field of ['interval','count'])if(input[field]!=null&&(!Number.isSafeInteger(input[field])||input[field]<1))invalid(field);
 if(input.endType==='count'&&input.count==null)invalid('count');
 for(const field of ['startDate','endDate'])if(input[field]!=null&&(typeof input[field]!=='string'||!validDateKey(input[field])))invalid(field);
 if(input.endType==='date'&&input.endDate==null)invalid('end date');
 if(input.weekdays!==undefined&&(!Array.isArray(input.weekdays)||input.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)))invalid('weekdays');
 for(const [field,max] of [['monthDay',31],['month',12],['weekday',6]])if(input[field]!=null&&(!Number.isInteger(input[field])||input[field]<(field==='weekday'?0:1)||input[field]>max))invalid(field);
 if(input.monthlyMode!=null&&!MONTHLY_MODES.has(input.monthlyMode))invalid('monthly mode');
 if(input.weekdayPosition!=null&&!POSITIONS.has(input.weekdayPosition))invalid('weekday position');
}

/** @param {import('./planner-contracts.js').RecurrenceInput|{recurrence:import('./planner-contracts.js').RecurrenceInput}} [input] @param {string|null} [fallbackDate] */
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

export function hasOccurrenceScheduleOverride(exception){return ['date','startTime','endTime','durationMinutes'].some(key=>Object.hasOwn(exception?.override||{},key))}

export function preserveOccurrenceOnSeriesEdit(exception){return hasOccurrenceScheduleOverride(exception)||['completed','skipped'].includes(exception?.status)}

export function generateOccurrenceDates(input,rangeStart,rangeEnd){const rule=normalizeRecurrence(input);if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(rangeStart)||!validDateKey(rangeEnd)||rangeEnd<rangeStart)return [];let dates=candidateStream(rule,rangeEnd);if(rule.endType==='count')dates=dates.slice(0,rule.count);dates=dates.filter(key=>key>=rangeStart&&key<=rangeEnd&&(rule.endType!=='date'||key<=rule.endDate));for(const [key,exception] of Object.entries(rule.exceptions||{}))if(validDateKey(key)&&key>=rangeStart&&key<=rangeEnd&&preserveOccurrenceOnSeriesEdit(exception))dates.push(key);return [...new Set(dates)].sort()}
export function nextOccurrenceDate(input,afterDate){const rule=normalizeRecurrence(input);if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(afterDate))return null;const maxEnd=rule.endType==='date'?rule.endDate:`${dateFromKey(afterDate).getFullYear()+400}-12-31`,dates=candidateStream(rule,maxEnd),limited=rule.endType==='count'?dates.slice(0,rule.count):dates;return limited.find(key=>key>afterDate)||null}

/** @param {import('./planner-contracts.js').RecurringTask} task @param {string} rangeStart @param {string} rangeEnd @param {{today?:string,includeDeleted?:boolean,includeSkipped?:boolean}} [options] */
export function generateTaskOccurrences(task,rangeStart,rangeEnd,options={}){
  const rule=normalizeRecurrence(task,task?.date||rangeStart),today=validDateKey(options.today)?options.today:dateKey(new Date());if(!rule.enabled)return [];
  const logicalDates=generateOccurrenceDates(rule,rangeStart,rangeEnd);
  return logicalDates.map(occurrenceDate=>projectOccurrence(task,rule,occurrenceDate,today));
}

function projectOccurrence(task,rule,occurrenceDate,today){
    const seriesId=String(task?.id??'');
    const exception=rule.exceptions?.[occurrenceDate]&&typeof rule.exceptions[occurrenceDate]==='object'?rule.exceptions[occurrenceDate]:null,override=exception?.override&&typeof exception.override==='object'?exception.override:{},effectiveTask={...task,...override,recurrence:task.recurrence},displayDate=validDateKey(override.date)?override.date:occurrenceDate,status=['completed','skipped','deleted'].includes(exception?.status)?exception.status:'pending',duration=override.durationMinutes?Math.max(1,Math.round(Number(override.durationMinutes))):taskDuration(effectiveTask);
    if(Array.isArray(override.checklist))effectiveTask.checklist=structuredClone(override.checklist);
    else if(Array.isArray(task.checklist))effectiveTask.checklist=task.checklist.map(item=>({...item,completed:false}));
    // Focus belongs to the logical occurrence, never to inherited template data.
    effectiveTask.focusLoggedSeconds=Number.isSafeInteger(exception?.focusLoggedSeconds)&&exception.focusLoggedSeconds>=0?exception.focusLoggedSeconds:0;
    if(Number.isInteger(exception?.remainingMinutes)&&exception.remainingMinutes>=1&&exception.remainingMinutes<=1440)effectiveTask.remainingMinutes=exception.remainingMinutes;else delete effectiveTask.remainingMinutes;
    let startTime=null,endTime=null;
    if(rule.mode==='fixed'){startTime=effectiveTask.startTime||null;endTime=effectiveTask.endTime||null;const start=parseMinutes(startTime);if(start!==null&&(!endTime||parseMinutes(endTime)===null))endTime=formatMinutes(start+duration)}
    else if(Object.prototype.hasOwnProperty.call(override,'startTime')){startTime=override.startTime||null;endTime=override.endTime||null;const start=parseMinutes(startTime);if(start!==null&&(!endTime||parseMinutes(endTime)===null))endTime=formatMinutes(start+duration)}
    return {occurrenceId:occurrenceId(seriesId,occurrenceDate),seriesId,occurrenceDate,displayDate,startTime,endTime,durationMinutes:duration,status,isOverdue:status==='pending'&&displayDate<today,isException:!!exception,mode:rule.mode,task:{...effectiveTask,date:displayDate,startTime,endTime}};
}

// Historical completion keeps its logical identity even when the series rule changes.
export function projectStoredOccurrence(task,date,options={}){
  if(!task?.recurrence?.enabled||!validDateKey(date))return null;
  const recurrence={...task.recurrence,exceptions:{[date]:task.recurrence.exceptions?.[date]}};
  return projectOccurrence(task,normalizeRecurrence(recurrence,date),date,options.today||date);
}

export function generateTaskOccurrencesThrough(task,rangeEnd,options={}){
  const rule=normalizeRecurrence(task,task?.date||rangeEnd),today=validDateKey(options.today)?options.today:dateKey(new Date());
  if(!rule.enabled||!validDateKey(rule.startDate)||!validDateKey(rangeEnd))return [];
  const byId=new Map();
  for(const item of generateTaskOccurrences(task,rule.startDate,rangeEnd,{today})){
    if((item.status==='pending'||options.includeCompleted&&item.status==='completed')&&item.displayDate<=rangeEnd)byId.set(item.occurrenceId,item);
  }
  for(const [logicalDate,exception] of Object.entries(rule.exceptions||{})){
    if(options.includeCompleted&&exception?.status==='completed'&&validDateKey(logicalDate)&&!byId.has(occurrenceId(task.id,logicalDate))){
      const item=projectOccurrence(task,rule,logicalDate,today);if(item.displayDate<=rangeEnd)byId.set(item.occurrenceId,item);
    }
    if(hasOccurrenceScheduleOverride(exception)&&validDateKey(logicalDate)){
      const item=projectOccurrence(task,rule,logicalDate,today);if((item.status==='pending'||options.includeCompleted&&item.status==='completed')&&item.displayDate<=rangeEnd)byId.set(item.occurrenceId,item);
      continue;
    }
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
  if(status==='pending'&&preserveOccurrenceOnSeriesEdit(existing)&&!generateOccurrenceDates({...rule,exceptions:{}},occurrenceDate,occurrenceDate).length){const old=projectOccurrence(next,rule,occurrenceDate,occurrenceDate);existing.override={...existing.override,date:old.displayDate,startTime:old.startTime,endTime:old.endTime,durationMinutes:old.durationMinutes};}
  existing.status=status;delete existing.completedAt;delete existing.skippedAt;if(status==='completed')existing.completedAt=timestamp;if(status==='skipped')existing.skippedAt=timestamp;
  rule.exceptions={...rule.exceptions,[occurrenceDate]:existing};next.recurrence=rule;return next;
}

export function applyOccurrenceOverride(task,occurrenceDate,changes={}){
  const next=structuredClone(task),rule=normalizeRecurrence(next,next?.date||occurrenceDate),existing=rule.exceptions?.[occurrenceDate]&&typeof rule.exceptions[occurrenceDate]==='object'?structuredClone(rule.exceptions[occurrenceDate]):{},override=structuredClone(existing.override||{});
  for(const [key,value] of Object.entries(changes||{})){
    if(value===undefined||key==='recurrence')continue;
    const baseline=key==='date'?occurrenceDate:key==='durationMinutes'?taskDuration(task):task?.[key];
    if(key==='checklist'||JSON.stringify(value)!==JSON.stringify(baseline))override[key]=structuredClone(value);
    else delete override[key];
  }
  // A detached date needs a schedule pin even when form values match the template.
  if(preserveOccurrenceOnSeriesEdit(existing)&&!generateOccurrenceDates({...rule,exceptions:{}},occurrenceDate,occurrenceDate).length&&!hasOccurrenceScheduleOverride({override}))override.date=occurrenceDate;
  if(Object.keys(override).length)existing.override=override;else delete existing.override;
  rule.exceptions={...rule.exceptions,[occurrenceDate]:existing};next.recurrence=rule;return next;
}

export function splitRecurringSeries(task,occurrenceDate,edits={},newTaskId,{preserveMoved=false}={}){
  const originalTask=structuredClone(task),baseRule=normalizeRecurrence(originalTask,originalTask?.date||occurrenceDate),historical={};
  for(const [key,value] of Object.entries(baseRule.exceptions||{}))if(key<occurrenceDate||preserveMoved&&preserveOccurrenceOnSeriesEdit(value))historical[key]=structuredClone(value);
  // Keep the original identity's time ledger available to history corrections.
  // The new series starts with fresh occurrences and receives no copied time.
  for(const [key,value] of Object.entries(baseRule.exceptions||{}))if(key>=occurrenceDate&&!historical[key]&&Object.hasOwn(value||{},'focusLoggedSeconds'))historical[key]={focusLoggedSeconds:value.focusLoggedSeconds};
  let cutoff=addDays(occurrenceDate,-1);
  if(baseRule.endType==='date'&&baseRule.endDate<cutoff)cutoff=baseRule.endDate;
  if(baseRule.endType==='count'){const dates=generateOccurrenceDates({...baseRule,exceptions:{}},baseRule.startDate,cutoff);cutoff=dates.at(-1)||addDays(baseRule.startDate,-1)}
  originalTask.recurrence={...baseRule,endType:'date',endDate:cutoff,count:null,exceptions:historical};
  const recurrenceEdits=edits?.recurrence&&typeof edits.recurrence==='object'?edits.recurrence:{},taskEdits={...edits};delete taskEdits.recurrence;
  const retained={};if(preserveMoved)for(const [key,value] of Object.entries(baseRule.exceptions||{}))if(key>=occurrenceDate&&preserveOccurrenceOnSeriesEdit(value))retained[key]={status:'deleted'};
  const newTask={...structuredClone(task),...structuredClone(taskEdits),id:newTaskId,completed:false};
  delete newTask.focusLoggedSeconds;delete newTask.remainingMinutes;
  newTask.recurrence=normalizeRecurrence({...baseRule,...recurrenceEdits,enabled:true,startDate:occurrenceDate,exceptions:retained,endType:recurrenceEdits.endType||baseRule.endType,endDate:recurrenceEdits.endType==='date'?recurrenceEdits.endDate:baseRule.endType==='date'?baseRule.endDate:null,count:recurrenceEdits.endType==='count'?recurrenceEdits.count:baseRule.endType==='count'?baseRule.count:null},occurrenceDate);
  if(preserveMoved&&baseRule.endType==='count'&&newTask.recurrence.endType==='count'&&newTask.recurrence.count===baseRule.count){const before=generateOccurrenceDates({...baseRule,exceptions:{}},baseRule.startDate,addDays(occurrenceDate,-1)).length;if(before>=baseRule.count)return {originalTask,newTask:null};newTask.recurrence.count=baseRule.count-before}
  if(newTask.recurrence.endType==='date'&&newTask.recurrence.endDate&&newTask.recurrence.endDate<occurrenceDate){if(preserveMoved)return {originalTask,newTask:null};newTask.recurrence.endType='never';newTask.recurrence.endDate=null}
  return {originalTask,newTask};
}
