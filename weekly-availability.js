import {parseTime} from './schedule-utils.js?v=5';

// Sunday is index 0, matching fixed commitments and the profile's local dates.
export function normaliseWeeklyAvailability(value){
 if(value==null)return null;
 if(typeof value!=='object'||Object.keys(value).length!==7||!Array.from({length:7},(_,day)=>String(day)).every(day=>Object.hasOwn(value,day)))throw Error('Weekly availability needs all seven days.');
 return Object.fromEntries(Array.from({length:7},(_,index)=>{
  const day=value[index];
  if(!Array.isArray(day)||day.length>4)throw Error('Use up to four work windows per day.');
  const windows=day.map(window=>{
   if(!window||typeof window!=='object'||Object.keys(window).some(key=>!['start','end'].includes(key))||!/^\d{2}:\d{2}$/.test(window.start)||!/^\d{2}:\d{2}$/.test(window.end))throw Error('Enter valid start and end times for each work window.');
   const start=parseTime(window.start),end=parseTime(window.end);
   if(start===null||end===null||end<=start)throw Error('Each work window must end after it starts on the same day. Split overnight hours across two days.');
   return {start:window.start,end:window.end};
  }).sort((a,b)=>a.start.localeCompare(b.start));
  for(let i=1;i<windows.length;i++)if(windows[i].start<windows[i-1].end)throw Error('Work windows must not overlap (day '+(index+1)+').');
  return [index,windows];
 }));
}
export function savedWeeklyAvailability(userData){return normaliseWeeklyAvailability(userData?.settings?.planning?.weeklyAvailability)}
export function planningDefaults(weeklyAvailability,explicit={}){
 const weekly=normaliseWeeklyAvailability(weeklyAvailability);
 if(weekly!==null&&explicit.dayStart===undefined&&explicit.dayEnd===undefined)return {weeklyAvailability:weekly,availabilitySource:'saved'};
 return {dayStart:explicit.dayStart??'07:00',dayEnd:explicit.dayEnd??'22:00',availabilitySource:'daily'};
}
export function assertSavedAvailability(options,userData){
 if(options?.availabilitySource==='saved'&&JSON.stringify(normaliseWeeklyAvailability(options.weeklyAvailability))!==JSON.stringify(savedWeeklyAvailability(userData)))throw Error('Your saved weekly availability changed. Review a new preview.');
}

export const AVAILABILITY_DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function weeklyAvailabilityText(value){const week=normaliseWeeklyAvailability(value);return week===null?'No saved weekly hours':AVAILABILITY_DAYS.map((day,i)=>day+': '+(week[i].map(window=>window.start+'–'+window.end).join(', ')||'Unavailable')).join('; ')}
