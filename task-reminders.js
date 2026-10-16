import { generateTaskOccurrences } from './recurrence-utils.js';

export function validReminderMinutes(value) {
    return Number.isInteger(value) && value >= 1 && value <= 10080;
}

function localParts(epoch, timeZone) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
    }).formatToParts(new Date(epoch)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}
function wallEpoch(parts) {
    return Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
}
export function zonedTaskStart(date,time,timeZone) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'')) return null;
    const wanted=Date.parse(date+'T'+time+':00Z');
    if (!Number.isFinite(wanted) || new Date(wanted).toISOString().slice(0,10)!==date) return null;
    const matches=[];
    // Consider both sides of a timezone transition. Gaps have no match;
    // ambiguous starts consistently use the earlier occurrence.
    for(const delta of [-86400000,0,86400000]){
        const sample=wanted+delta,offset=wallEpoch(localParts(sample,timeZone))-sample;
        const candidate=wanted-offset;
        if(wallEpoch(localParts(candidate,timeZone))===wanted)matches.push(candidate);
    }
    return matches.length?Math.min(...matches):null;
}
function shiftDate(date,days){return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)}

export function dueTaskReminders(boards, now=Date.now(), timeZone='UTC') {
    let today;
    try {const p=localParts(now,timeZone);today=p.year+'-'+p.month+'-'+p.day}
    catch {return []}
    const start=shiftDate(today,-8),end=shiftDate(today,8),due=[];
    for(const board of boards||[])for(const section of board.sections||[])for(const task of section.tasks||[]){
        if(board.archived||section.archived||!task?.id||task.archived||task.completed)continue;
        let candidates=[{task,key:task.id}];
        if(task.recurrence?.enabled){
            const occurrences=generateTaskOccurrences(task,start,end,{today});
            for(const [logicalDate,exception] of Object.entries(task.recurrence.exceptions||{})){
                const moved=exception?.override?.date;
                if(moved>=start&&moved<=end&&(logicalDate<start||logicalDate>end)){
                    occurrences.push(...generateTaskOccurrences(task,logicalDate,logicalDate,{today}));
                }
            }
            candidates=occurrences.filter(item=>item.status==='pending').map(item=>({task:item.task,key:item.occurrenceId}));
        }
        for(const item of candidates){
            const effective=item.task;
            if(effective.archived||effective.completed||!validReminderMinutes(effective.reminderMinutes))continue;
            const startsAt=zonedTaskStart(effective.date,effective.startTime,timeZone);
            if(startsAt===null)continue;
            const dueAt=startsAt-effective.reminderMinutes*60000;
            if(dueAt<=now&&now<startsAt){
                const id='task-reminder:'+item.key+':'+startsAt+':'+effective.reminderMinutes;
                if(!due.some(reminder=>reminder.id===id))due.push({id,taskId:task.id,title:String(effective.title||'Task'),date:effective.date,startTime:effective.startTime,minutesBefore:effective.reminderMinutes,dueAt,startsAt});
            }
        }
    }
    return due;
}

export function reminderDeliveryStatus(settings={}, permission='unsupported') {
    return { enabled:settings.enabled!==false, browserEnabled:settings.browserPush===true, permission };
}

export function dueBedtimeReminders(events,now=Date.now(),timeZone='UTC') {
    let today;
    try{const parts=localParts(now,timeZone);today=parts.year+'-'+parts.month+'-'+parts.day}catch{return []}
    const due=[];
    // Include tomorrow: a bedtime shortly after midnight has a reminder today.
    for(const date of [today,shiftDate(today,1)]){
        const day=new Date(date+'T12:00:00Z').getUTCDay();
        for(const event of events||[]){
            if(!event?.id||event.archived||event.category!=='sleep'||event.day!==day)continue;
            const startsAt=zonedTaskStart(date,event.start,timeZone);
            if(startsAt===null)continue;
            const dueAt=startsAt-15*60000,id='bedtime-reminder:'+event.id+':'+startsAt+':15';
            if(dueAt<=now&&now<startsAt&&!due.some(item=>item.id===id))due.push({id,eventId:event.id,title:String(event.title||'Sleep'),date,startTime:event.start,minutesBefore:15,dueAt,startsAt});
        }
    }
    return due;
}
