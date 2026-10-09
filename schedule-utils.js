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
  return Math.max(0,Math.min(1439,Math.round(Number(minutes||0)/interval)*interval));
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
