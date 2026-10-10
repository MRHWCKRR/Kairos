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
function clampInt(value,min,max,fallback){
  const n=Math.trunc(Number(value));
  return Number.isFinite(n)&&n>=min&&n<=max?n:fallback;
}
function normalizedWeekdays(values=[]){
  return [...new Set((Array.isArray(values)?values:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))].sort((a,b)=>a-b);
}
function defaultStart(input,fallbackDate){
  if(validDateKey(input?.startDate))return input.startDate;
  if(validDateKey(fallbackDate))return fallbackDate;
  return null;
}

export function normalizeRecurrence(input={},fallbackDate=null){
  const source=input?.recurrence&&typeof input.recurrence==='object'?input.recurrence:input||{};
  const preset=String(source.preset||'').toLowerCase();
  let frequency=FREQUENCIES.has(source.frequency)?source.frequency:'daily';
  let weekdays=normalizedWeekdays(source.weekdays);
  if(preset==='weekdays'){
    frequency='weekly';
    weekdays=[1,2,3,4,5];
  }
  const startDate=defaultStart(source,fallbackDate);
  const interval=Math.max(1,Math.trunc(Number(source.interval)||1));
  const monthlyMode=frequency==='monthly'&&MONTHLY_MODES.has(source.monthlyMode)?source.monthlyMode:(frequency==='monthly'?'date':null);
  const inferredMonthDay=startDate?Number(startDate.slice(8,10)):1;
  const inferredMonth=startDate?Number(startDate.slice(5,7)):1;
  const endType=END_TYPES.has(source.endType)?source.endType:'never';
  const mode=MODES.has(source.mode)?source.mode:'flexible';
  const rule={
    enabled:source.enabled===true,
    frequency,
    interval,
    weekdays:frequency==='weekly'?weekdays:[],
    monthlyMode,
    monthDay:frequency==='monthly'||frequency==='yearly'?clampInt(source.monthDay,1,31,inferredMonthDay):null,
    weekdayPosition:frequency==='monthly'&&monthlyMode==='weekdayPosition'&&POSITIONS.has(source.weekdayPosition)?source.weekdayPosition:null,
    weekday:frequency==='monthly'&&monthlyMode==='weekdayPosition'?clampInt(source.weekday,0,6,startDate?new Date(Number(startDate.slice(0,4)),Number(startDate.slice(5,7))-1,Number(startDate.slice(8,10)),12).getDay():0):null,
    month:frequency==='yearly'?clampInt(source.month,1,12,inferredMonth):null,
    startDate,
    endType,
    endDate:endType==='date'&&validDateKey(source.endDate)?source.endDate:null,
    count:endType==='count'?Math.max(1,Math.trunc(Number(source.count)||1)):null,
    mode,
    exceptions:source.exceptions&&typeof source.exceptions==='object'&&!Array.isArray(source.exceptions)?structuredClone(source.exceptions):{}
  };
  if(frequency==='weekly'&&!rule.weekdays.length&&startDate){
    const [y,m,d]=startDate.split('-').map(Number);rule.weekdays=[new Date(y,m-1,d,12).getDay()];
  }
  return rule;
}

export function validateRecurrence(rule){
  if(!rule||typeof rule!=='object')return false;
  if(rule.enabled!==true)return true;
  if(!FREQUENCIES.has(rule.frequency))return false;
  if(!Number.isInteger(rule.interval)||rule.interval<1)return false;
  if(!validDateKey(rule.startDate))return false;
  if(!MODES.has(rule.mode))return false;
  if(!END_TYPES.has(rule.endType))return false;
  if(rule.endType==='date'&&(!validDateKey(rule.endDate)||rule.endDate<rule.startDate))return false;
  if(rule.endType==='count'&&(!Number.isInteger(rule.count)||rule.count<1))return false;
  if(rule.frequency==='weekly'&&(!Array.isArray(rule.weekdays)||!rule.weekdays.length||rule.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)))return false;
  if(rule.frequency==='monthly'){
    if(!MONTHLY_MODES.has(rule.monthlyMode))return false;
    if(rule.monthlyMode==='date'&&(!Number.isInteger(rule.monthDay)||rule.monthDay<1||rule.monthDay>31))return false;
    if(rule.monthlyMode==='weekdayPosition'&&(!POSITIONS.has(rule.weekdayPosition)||!Number.isInteger(rule.weekday)||rule.weekday<0||rule.weekday>6))return false;
  }
  if(rule.frequency==='yearly'&&(!Number.isInteger(rule.month)||rule.month<1||rule.month>12||!Number.isInteger(rule.monthDay)||rule.monthDay<1||rule.monthDay>31))return false;
  return true;
}

export function occurrenceId(seriesId,occurrenceDate){
  return `${String(seriesId)}::${String(occurrenceDate)}`;
}
