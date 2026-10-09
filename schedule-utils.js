export function toDateKey(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

export function parseTime(value){
  if(!/^\d{1,2}:\d{2}$/.test(String(value||''))) return null;
  const [h,m]=String(value).split(':').map(Number);
  if(h<0||h>23||m<0||m>59) return null;
  return h*60+m;
}

export function formatTime(minutes,hour12=true){
  const safe=Math.max(0,Math.min(1439,Math.round(minutes)));
  const h=Math.floor(safe/60),m=safe%60;
  if(!hour12) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  const period=h>=12?'PM':'AM';
  const h12=h%12||12;
  return `${h12}:${String(m).padStart(2,'0')} ${period}`;
}

export function snapMinutes(minutes,interval=15){
  const safeInterval=Math.max(1,Number(interval)||15);
  return Math.max(0,Math.min(1440,Math.round(Number(minutes||0)/safeInterval)*safeInterval));
}

export function blockGeometry(startMin,endMin,hourHeight=56,minHeightPx=22){
  const start=Math.max(0,Math.min(1440,Number(startMin)||0));
  const end=Math.max(start,Math.min(1440,Number(endMin)||start));
  const pxPerMinute=(Number(hourHeight)||56)/60;
  return {
    topPx:start*pxPerMinute,
    heightPx:Math.max(Number(minHeightPx)||0,(end-start)*pxPerMinute)
  };
}

export function taskDurationMinutes(task={},fallback=60){
  const start=parseTime(task.startTime),end=parseTime(task.endTime);
  let duration=null;
  if(start!==null&&end!==null){ duration=(end-start+1440)%1440; if(duration===0) duration=1440; }
  if(duration===null&&Number.isFinite(Number(task.estimatedMinutes))) duration=Number(task.estimatedMinutes);
  if(duration===null) duration=fallback;
  return Math.max(15,Math.round(duration));
}

function localDate(date){ return new Date(date.getFullYear(),date.getMonth(),date.getDate(),12); }
export function addDays(date,days){ const d=localDate(date); d.setDate(d.getDate()+days); return d; }

export function getVisibleDates(anchor,view){
  const a=localDate(anchor);
  if(view==='day') return [a];
  if(view==='three-day') return [0,1,2].map(i=>addDays(a,i));
  const sunday=addDays(a,-a.getDay());
  return Array.from({length:7},(_,i)=>addDays(sunday,i));
}

export function shiftAnchor(anchor,view,direction){
  const step=view==='day'?1:view==='three-day'?3:7;
  return addDays(anchor,step*(direction<0?-1:1));
}

function overlaps(a,b){ return a.startMin < b.endMin && b.startMin < a.endMin; }

export function layoutOverlaps(items){
  const sorted=items.map(x=>({...x})).sort((a,b)=>a.startMin-b.startMin||a.endMin-b.endMin);
  const groups=[];
  let group=[]; let groupEnd=-1;
  for(const item of sorted){
    if(group.length && item.startMin>=groupEnd){ groups.push(group); group=[]; groupEnd=-1; }
    group.push(item); groupEnd=Math.max(groupEnd,item.endMin);
  }
  if(group.length) groups.push(group);
  const out=[];
  for(const g of groups){
    const ends=[];
    for(const item of g){
      let col=ends.findIndex(end=>end<=item.startMin);
      if(col<0){ col=ends.length; ends.push(item.endMin); } else ends[col]=item.endMin;
      item.column=col;
    }
    const count=Math.max(1,ends.length);
    for(const item of g) out.push({...item,columnCount:count});
  }
  return out;
}

export function findConflicts(taskInterval,fixedIntervals=[]){ return fixedIntervals.filter(x=>overlaps(taskInterval,x)); }

export function splitOvernightInterval(item){
  const start=parseTime(item.start),end=parseTime(item.end);
  if(start===null||end===null) return [];
  if(end>start) return [{id:item.id,startMin:start,endMin:end,part:'single'}];
  return [
    {id:item.id,startMin:start,endMin:1440,part:'start'},
    {id:item.id,startMin:0,endMin:end,part:'end'}
  ];
}

export function applyScheduledMove(task,dateKey,targetMinutes,interval=15){
  const duration=taskDurationMinutes(task);
  let start=snapMinutes(targetMinutes,interval);
  start=Math.min(start,Math.max(0,1440-duration));
  const end=Math.min(1440,start+duration);
  return {date:dateKey,startTime:formatTime(start,false),endTime:formatTime(end%1440,false)};
}

export function applyResize(task,targetEndMinutes,interval=15){
  const start=parseTime(task.startTime);
  if(start===null) return {endTime:task.endTime||null};
  let end=snapMinutes(targetEndMinutes,interval);
  end=Math.max(start+15,Math.min(1440,end));
  return {endTime:formatTime(end%1440,false)};
}

export function clearScheduledFields(task){
  task.date=null;
  task.startTime=null;
  task.endTime=null;
  return task;
}

export function normalizeTaskMetadata(task){
  if(task.dueDate===undefined)task.dueDate=null;
  if(task.estimatedMinutes===undefined)task.estimatedMinutes=null;
  if(task.priority===undefined)task.priority=null;
  if(task.notes===undefined)task.notes='';
  if(task.reminderMinutes===undefined)task.reminderMinutes=null;
  if(task.scheduleLocked===undefined)task.scheduleLocked=false;
  if(task.schedulingPreference===undefined)task.schedulingPreference=null;
  return task;
}

export function scheduleFieldsFromDuration(date,startTime,durationMinutes){
  const dateValue=date||null;
  const start=parseTime(startTime);
  if(start===null)return {date:dateValue,startTime:null,endTime:null};
  const duration=Math.max(15,Number(durationMinutes)||60);
  const end=Math.min(1440,start+duration);
  return {date:dateValue,startTime:formatTime(start,false),endTime:formatTime(end%1440,false)};
}

function validDateKey(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number);
  const parsed=new Date(y,m-1,d,12);
  return parsed.getFullYear()===y&&parsed.getMonth()===m-1&&parsed.getDate()===d;
}

function proposalConflictsWithRecurring(date,startMin,endMin,fixedEvents=[]){
  if(!validDateKey(date))return true;
  const [y,m,d]=String(date).split('-').map(Number),day=new Date(y,m-1,d,12).getDay(),previous=(day+6)%7;
  for(const event of fixedEvents){
    const eventStart=parseTime(event?.start),eventEnd=parseTime(event?.end),eventDay=Number(event?.day);
    if(eventStart===null||eventEnd===null||eventDay<0||eventDay>6)continue;
    if(eventDay===day){
      const interval=eventEnd>eventStart?{startMin:eventStart,endMin:eventEnd}:{startMin:eventStart,endMin:1440};
      if(overlaps({startMin,endMin},interval))return true;
    }
    if(eventDay===previous&&eventEnd<=eventStart&&eventEnd>0&&overlaps({startMin,endMin},{startMin:0,endMin:eventEnd}))return true;
  }
  return false;
}

export function validateScheduleProposals(raw,tasksById,fixedEvents=[]){
  if(!Array.isArray(raw))return [];
  const preliminary=[],seen=new Set();
  for(const item of raw){
    const taskId=String(item?.taskId??'');
    const task=tasksById?.get?.(taskId);
    if(!task||task.scheduleLocked||task.completed||task.archived||seen.has(taskId))continue;
    const date=item?.to?.date,start=item?.to?.startTime,end=item?.to?.endTime;
    const startMin=parseTime(start),endMin=parseTime(end);
    if(!validDateKey(date)||startMin===null||endMin===null||endMin-startMin<15)continue;
    if(validDateKey(task.dueDate)&&date>task.dueDate)continue;
    if(proposalConflictsWithRecurring(date,startMin,endMin,fixedEvents))continue;
    seen.add(taskId);
    preliminary.push({
      taskId,
      from:{date:item?.from?.date??task.date??null,startTime:item?.from?.startTime??task.startTime??null,endTime:item?.from?.endTime??task.endTime??null},
      to:{date,startTime:formatTime(startMin,false),endTime:formatTime(endMin,false)},
      reason:String(item?.reason||'Fits the available time.').trim().slice(0,500),
      conflictIds:Array.isArray(item?.conflictIds)?item.conflictIds.map(String).slice(0,20):[],
      _interval:{date,startMin,endMin}
    });
  }
  const proposedById=new Map(preliminary.map(p=>[p.taskId,p]));
  const finalIntervals=[];
  for(const [id,task] of tasksById||[]){
    if(task?.completed||task?.archived)continue;
    const proposal=proposedById.get(String(id));
    if(proposal){finalIntervals.push({taskId:String(id),...proposal._interval});continue;}
    if(!validDateKey(task?.date))continue;
    const startMin=parseTime(task?.startTime),rawEnd=parseTime(task?.endTime);
    if(startMin===null||rawEnd===null)continue;
    const endMin=rawEnd>startMin?rawEnd:1440;
    finalIntervals.push({taskId:String(id),date:task.date,startMin,endMin});
  }
  return preliminary.filter(proposal=>{
    const blocked=finalIntervals.some(other=>other.taskId!==proposal.taskId&&other.date===proposal._interval.date&&overlaps(proposal._interval,other));
    if(blocked)return false;
    delete proposal._interval;
    return true;
  }).map(proposal=>{delete proposal._interval;return proposal});
}
