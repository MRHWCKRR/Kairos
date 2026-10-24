import {validFocusDate} from './occurrence-focus.js?v=1';
import {generateTaskOccurrencesThrough} from './recurrence-utils.js?v=14';
import {resolveTaskDetail,taskDetailValues} from './task-list-model.js?v=18';

export function buildToday(state={},today) {
 if(!validFocusDate(today))throw Error('A valid Today date is required.');
 const result={date:today,overdue:[],today:[],unscheduled:[]},counts=new Map();
 for(const b of state.boards||[])for(const s of b.sections||[])for(const t of s.tasks||[])counts.set(t.id,(counts.get(t.id)||0)+1);
 for(const board of state.boards||[])for(const section of board.sections||[])for(const task of section.tasks||[]){
  if(board.archived||section.archived||task.archived||!task.id||counts.get(task.id)!==1)continue;
  const base={id:task.id,taskId:task.id,boardId:board.id,sectionId:section.id,title:String(task.title||'Untitled task'),path:String(board.title||'Board')+' / '+String(section.title||'Section'),kind:'task',canComplete:true};
  if(task.recurrence?.enabled){
   for(const item of generateTaskOccurrencesThrough(task,today,{today})){
    if(item.status!=='pending')continue;
    const row={...base,id:task.id+'::'+item.occurrenceDate,title:String(item.task.title||base.title),occurrenceDate:item.occurrenceDate,date:item.displayDate,start:item.startTime||'',end:item.endTime||'',canComplete:false};
    if(row.date===today)result.today.push(row);else if(row.date<today)result.overdue.push(row);
   }
   continue;
  }
  if(task.completed)continue;
  const scheduled=validFocusDate(task.date)?task.date:null,due=validFocusDate(task.dueDate)?task.dueDate:null;
  const row={...base,date:scheduled,dueDate:due,start:task.startTime||'',end:task.endTime||''};
  if((due&&due<today)||(scheduled&&scheduled<today))result.overdue.push(row);
  else if(scheduled===today||due===today)result.today.push(row);
  else if(!scheduled)result.unscheduled.push(row);
 }
 const day=new Date(today+'T12:00:00Z').getUTCDay();
 for(const event of state.scheduleEvents||[])if(!event.archived&&(event.date?event.date===today:Number(event.day)===day)){
  result.today.push({id:event.id,kind:'event',title:String(event.title||'Event'),path:'Schedule',date:today,start:event.start||event.startTime||'',end:event.end||event.endTime||'',canComplete:false});
 }
 result.today.sort((a,b)=>(a.start||'99:99').localeCompare(b.start||'99:99')||a.title.localeCompare(b.title));
 result.overdue.sort((a,b)=>(a.dueDate||a.date||'').localeCompare(b.dueDate||b.date||''));
 return result;
}
export function todayTaskCommand(state,row,action,today){
 if(!row?.taskId)throw Error('Open this event in Schedule.');
 const target={taskId:row.taskId,...(row.occurrenceDate?{occurrenceDate:row.occurrenceDate}:{})},found=resolveTaskDetail(state,target);
 if(found.board.id!==row.boardId||found.section.id!==row.sectionId)throw Error('This task moved. Review Today again.');
 if(found.seriesTask||found.task.recurrence?.enabled)throw Error('Open this recurring occurrence in Schedule.');
 const expected={boardId:found.board.id,sectionId:found.section.id};
 if(action==='complete')return {command:{type:'complete_task',target,value:true},expected:{...expected,value:found.task.completed===true}};
 if(action==='plan'&&validFocusDate(today))return {command:{type:'edit_task',target,changes:{date:today}},expected:{...expected,fields:{date:taskDetailValues(found.task).date}}};
 throw Error('Unsupported Today action.');
}

