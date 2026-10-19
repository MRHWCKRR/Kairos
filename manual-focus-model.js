import {taskFocusTarget} from './task-focus.js?v=3';
import {validFocusDate} from './occurrence-focus.js?v=1';
import {planningClock} from './planning-model.js?v=1';

export function manualFocusChoices(state){
 const all=(state.boards||[]).flatMap(board=>(board.sections||[]).flatMap(section=>(section.tasks||[]).map(task=>({board,section,task})))),counts=new Map();
 for(const {task}of all)counts.set(task.id,(counts.get(task.id)||0)+1);
 return all.filter(({board,section,task})=>!board.archived&&!section.archived&&!task.archived&&typeof task.id==='string'&&task.id.length>0&&task.id.length<=160&&counts.get(task.id)===1).map(({board,section,task})=>({id:task.id,label:[board.title||'Board',section.title||'Section',task.title||'Task'].map(s=>String(s).slice(0,180)).join(' / '),recurring:task.recurrence?.enabled===true}));
}

export function makeManualFocusEntry(state,identity,values,{now=Date.now(),timezone='UTC',idFactory=()=> 'focus-manual-'+globalThis.crypto.randomUUID()}={}){
 const integer=value=>typeof value==='number'&&Number.isInteger(value)||typeof value==='string'&&/^\d+$/.test(value.trim());
 const id=value=>typeof value==='string'&&value.length>0&&value.length<=160;
 if(!id(identity?.ownerId)||(identity.planId!==null&&!id(identity.planId)))throw Error('The signed-in account or planner changed.');
 if(!validFocusDate(values.workDate)||values.workDate>planningClock(now,timezone).date)throw Error('Choose a valid work date that is not in the future.');
 if(!integer(values.minutes)||!integer(values.seconds))throw Error('Enter whole minutes and seconds.');
 const minutes=Number(values.minutes),seconds=Number(values.seconds),duration=minutes*60+seconds;
 if(minutes<0||seconds<0||seconds>59||duration<1||duration>86400)throw Error('Enter 1 second to 24 hours, with seconds from 0 to 59.');
 let target=null;
 if(values.taskId){const choice=manualFocusChoices(state).find(c=>c.id===values.taskId);target=choice?taskFocusTarget(state,choice.id,choice.recurring?values.occurrenceDate:null):null;if(!target)throw Error('This task or dated occurrence is unavailable. Choose again.');}
 return {id:idFactory(),ownerId:identity.ownerId,planId:identity.planId,source:'manual',workDate:values.workDate,createdAt:now,endedAt:now,seconds:duration,target,mode:'log'};
}
