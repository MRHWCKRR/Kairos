import {validFocusDate} from './occurrence-focus.js?v=1';
import {generateTaskOccurrences} from './recurrence-utils.js?v=12';
const norm=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const shiftDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const usable=value=>typeof value==='string'&&value.length>0&&value.length<=160;
function indexRow(row,notes=''){
 return {...row,titleText:norm(row.title),searchText:norm([row.title,row.path,row.assignmentTitle,row.date,row.occurrenceDate,notes].join(' '))};
}

export function buildSearchIndex(state={}, {today}={}){
 if(!validFocusDate(today))throw Error('A valid search date is required.');
 const from=shiftDate(today,-30),to=shiftDate(today,30),boards=state.boards||[],all=boards.flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).map(task=>({board,section,task}))));
 const taskCounts=new Map(),boardCounts=new Map();
 for(const board of boards)boardCounts.set(board.id,(boardCounts.get(board.id)||0)+1);
 for(const {task}of all)taskCounts.set(task.id,(taskCounts.get(task.id)||0)+1);
 const unique=new Map(all.filter(({task})=>usable(task.id)&&taskCounts.get(task.id)===1).map(e=>[e.task.id,e]));
 const active=new Map([...unique].filter(([,e])=>!e.board.archived&&!e.section.archived&&!e.task.archived));
 const parents=new Set([...active.values()].filter(({task})=>active.has(task.assignmentId)&&!task.recurrence?.enabled&&!active.get(task.assignmentId).task.recurrence?.enabled&&!active.get(task.assignmentId).task.assignmentId).map(({task})=>task.assignmentId));
 const rows=[];
 for(const board of boards)if(!board.archived&&usable(board.id)&&boardCounts.get(board.id)===1)rows.push(indexRow({key:'board-'+rows.length,kind:'board',title:String(board.title||'Board'),path:'Board',label:'Board',target:{kind:'board',boardId:board.id},completed:false,overdue:false,date:null}));
 for(const {board,section,task}of all){
  if(board.archived||section.archived||task.archived||!unique.has(task.id))continue;
  const title=String(task.title||'Task'),path=String(board.title||'Board')+' / '+String(section.title||'Section'),assignmentTitle=parents.has(task.assignmentId)?active.get(task.assignmentId)?.task.title||'':'';
  const series=task.recurrence?.enabled===true,date=validFocusDate(task.dueDate)?task.dueDate:validFocusDate(task.date)?task.date:null;
  const completed=!series&&task.completed===true;
  const base={key:'task-'+rows.length,kind:series?'series':'task',title,path,assignmentTitle,label:series?'Recurring series':parents.has(task.id)?'Assignment':parents.has(task.assignmentId)?'Assignment session':'Task',target:{kind:'task',taskId:task.id},date:series?null:date,completed,overdue:!series&&!completed&&!!date&&date<today};
  rows.push(indexRow(base,task.notes));
  if(series)for(const occurrence of generateTaskOccurrences(task,from,to,{today})){
   if(['skipped','deleted'].includes(occurrence.status))continue;
   rows.push(indexRow({...base,key:base.key+'::'+occurrence.occurrenceDate,kind:'occurrence',title:String(occurrence.task.title||title),label:'Recurring occurrence',target:{kind:'task',taskId:task.id,occurrenceDate:occurrence.occurrenceDate},date:occurrence.displayDate,occurrenceDate:occurrence.occurrenceDate,completed:occurrence.status==='completed',overdue:occurrence.status==='pending'&&occurrence.displayDate<today},occurrence.task.notes));
  }
 }
 return {rows,from,to,today};
}

export function searchPlanner(index,{query='',status='all',limit=50}={}){
 if(!['all','unfinished','overdue','completed'].includes(status))return {rows:[],total:0};
 const text=norm(query).slice(0,500),tokens=text.split(' ').filter(Boolean),size=Number.isInteger(limit)?Math.min(100,Math.max(1,limit)):50;
 const rank=row=>!text?0:row.titleText===text?0:row.titleText.startsWith(text)?1:row.titleText.includes(text)?2:3;
 const kind=row=>row.kind==='board'?0:row.kind==='occurrence'?2:1;
 const matches=index.rows.filter(row=>(status==='all'||row.kind!=='board'&&(status==='completed'?row.completed:status==='overdue'?row.overdue:!row.completed))&&tokens.every(token=>row.searchText.includes(token))).sort((a,b)=>rank(a)-rank(b)||kind(a)-kind(b)||a.title.localeCompare(b.title)||String(a.date||'').localeCompare(String(b.date||'')));
 return {rows:matches.slice(0,size),total:matches.length};
}
