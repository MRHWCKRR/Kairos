import {normaliseWeeklyAvailability,savedWeeklyAvailability,weeklyAvailabilityText} from './weekly-availability.js';
import {planningClock,validPlanningDate} from './planning-model.js';
import {planningWindows,planningBlockValid} from './planning-slots.js?v=2';
import {parseTime} from './schedule-utils.js';

export function schedulePlanningAvailability(bridge){
 const timezone=bridge?.getTimezone?.()||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 new Intl.DateTimeFormat('en',{timeZone:timezone});
 return {timezone,weeklyAvailability:normaliseWeeklyAvailability(bridge?.getWeeklyAvailability?.())};
}
export function schedulePlanningClock(bridge,now=Date.now()){return planningClock(now,schedulePlanningAvailability(bridge).timezone)}
export function sameScheduleAvailability(left,right){return !!left&&!!right&&left.timezone===right.timezone&&JSON.stringify(normaliseWeeklyAvailability(left.weeklyAvailability))===JSON.stringify(normaliseWeeklyAvailability(right.weeklyAvailability))}
export function assertScheduleAvailability(expected,userData){
 const actual={timezone:userData?.settings?.profile?.timezone||expected?.timezone,weeklyAvailability:savedWeeklyAvailability(userData)};
 if(!sameScheduleAvailability(expected,actual))throw Error('Your saved work hours or timezone changed. Review a new Schedule preview.');
}
export function scheduleProposalFits(proposal,availability,duration){
 // Without a saved week, preserve the existing Schedule proposal rules.
 if(availability?.weeklyAvailability==null)return true;
 const date=proposal?.to?.date,start=parseTime(proposal?.to?.startTime),rawEnd=parseTime(proposal?.to?.endTime),end=duration!==undefined&&start!==null?start+duration:rawEnd===0&&start>0?1440:rawEnd;
 if(!validPlanningDate(date)||start===null||end===null||!Number.isFinite(end)||end<=start)return false;
 const options={from:date,to:date,timezone:availability.timezone,weeklyAvailability:availability.weeklyAvailability,availabilitySource:'saved'};
 return planningWindows(options,date).some(window=>start>=window.start&&end<=window.end)&&planningBlockValid(date,start,end-start,availability.timezone);
}
export function scheduleAvailabilityText(availability){return availability?.weeklyAvailability==null?'No saved weekly hours. Times use '+availability?.timezone+'.':('Saved weekly hours in '+availability.timezone+'. '+weeklyAvailabilityText(availability.weeklyAvailability))}
