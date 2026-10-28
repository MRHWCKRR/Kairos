import {parseTime,taskDurationMinutes} from './schedule-utils.js?v=6';
import {generateTaskOccurrences} from './recurrence-utils.js?v=14';

export function dayChangeCandidates(boards,date,time) {
  const now=parseTime(time),items=[];
  for(const board of boards||[]){
    if(board.archived)continue;
    for(const section of board.sections||[]){
      if(section.archived)continue;
      for(const task of section.tasks||[]){
        if(task.archived||task.scheduleLocked)continue;
        const candidates=task.recurrence?.enabled?
          generateTaskOccurrences(task,date,date,{today:date}).filter(o=>o.status==='pending'&&o.mode==='flexible'&&o.displayDate===date).map(o=>({...o.task,id:o.occurrenceId,date:o.displayDate,startTime:o.startTime,endTime:o.endTime,plannedMinutes:o.durationMinutes,completed:false})):[task];
        for(const candidate of candidates){
          const start=parseTime(candidate.startTime),duration=candidate.plannedMinutes||taskDurationMinutes(candidate);
          if(candidate.completed||candidate.date!==date||start===null||start+duration>1440)continue;
          if(start<=now&&start+duration>now)continue;
          items.push({...candidate,id:String(candidate.id),boardTitle:String(board.title||''),plannedMinutes:duration});
        }
      }
    }
  }
  return items.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
}
export function prepareDayChange(input,candidates,date) {
  const description=String(input.description||'').trim();
  if(!description)throw Error('Describe what changed first.');
  if(description.length>1200)throw Error('Keep the change under 1,200 characters.');
  const ids=[...new Set((input.taskIds||[]).map(String))],allowed=new Set(candidates.map(t=>String(t.id)));
  if(!ids.length)throw Error('Choose at least one task Kairos may move.');
  if(ids.some(id=>!allowed.has(id)))throw Error('A selected task is no longer available to move. Reopen My day changed.');
  const blockedWindows=[];
  if(input.blockedFrom||input.blockedUntil){
    const from=parseTime(input.blockedFrom),until=parseTime(input.blockedUntil);
    if(from===null||until===null||until<=from)throw Error('Choose an end time after the start time.');
    blockedWindows.push({date,startTime:input.blockedFrom,endTime:input.blockedUntil});
  }
  return {description,taskIds:ids,currentDate:date,blockedWindows};
}
export function proposalStillMatches(proposal,task) {
  return !!task&&!task.completed&&!task.archived&&!task.scheduleLocked&&['date','startTime','endTime'].every(key=>(proposal.from?.[key]??null)===(task[key]??null));
}
