import {stableStringify} from './plan-merge.js';
const same=(a,b)=>stableStringify(a)===stableStringify(b);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keyed=v=>Array.isArray(v)&&v.every(x=>object(x)&&typeof x.id==='string'&&x.id);
const safe=key=>typeof key==='string'&&!['__proto__','prototype','constructor'].includes(key);
const slot=value=>value===undefined?{present:false}:{present:true,value:structuredClone(value)};
export function plannerChanges(before,after){
 const changes=[];
 function walk(a,b,path,index){
  if(same(a,b))return;
  if(keyed(a)&&keyed(b)){
   if(new Set(a.map(x=>x.id)).size!==a.length||new Set(b.map(x=>x.id)).size!==b.length)throw Error('Duplicate planner IDs.');
   for(const id of new Set([...a.map(x=>x.id),...b.map(x=>x.id)])){
    const old=a.find(x=>x.id===id),next=b.find(x=>x.id===id);
    walk(old,next,[...path,{id}],old?a.indexOf(old):b.indexOf(next));
   }
  }else if(object(a)&&object(b)){
   for(const key of new Set([...Object.keys(a),...Object.keys(b)])){if(!safe(key))throw Error('Invalid planner field.');walk(a[key],b[key],[...path,key]);}
  }else changes.push({path,before:slot(a),after:slot(b),...(index===undefined?{}:{index})});
 }
 walk(before,after,[]);
 for(const change of changes){
  const path=change.path;
  if(path.length===7&&path[0]==='boards'&&path[2]==='sections'&&path[4]==='tasks'&&scheduleFields.includes(path[6])){
   const taskPath=path.slice(0,6),{parent,key}=locate(after,taskPath);
   change.scheduleGuard={path:taskPath,fields:scheduleSnapshot(parent[key])};
  }
 }
 return changes;
}
const scheduleFields=['date','startTime','endTime','estimatedMinutes','lastScheduledMinutes'];
const scheduleSnapshot=task=>Object.fromEntries([...scheduleFields,'dueDate','scheduleLocked','recurrence','completed'].map(key=>[key,structuredClone(task[key]??null)]));
function locate(root,path){
 if(!Array.isArray(path)||!path.length||path.length>24)throw Error('Invalid Undo path.');
 let parent=root;
 for(let i=0;i<path.length;i++){
  const part=path[i],last=i===path.length-1;
  if(object(part)&&Object.keys(part).length===1&&typeof part.id==='string'){
   if(!Array.isArray(parent))throw Error('This item changed after the AI action.');
   const matches=parent.map((item,index)=>item?.id===part.id?index:-1).filter(index=>index>=0);
   if(matches.length>1||(!last&&!matches.length))throw Error('This item changed after the AI action.');
   const key=matches[0]??-1;if(last)return {parent,key,array:true};parent=parent[key];
  }else{
   if(!safe(part)||!object(parent))throw Error('This item changed after the AI action.');
   if(last)return {parent,key:part,array:false};parent=parent[part];
  }
 }
}
export function undoPlannerChanges(state,changes){
 if(!Array.isArray(changes)||!changes.length||changes.length>250)throw Error('This Undo is unavailable.');
 for(const change of changes)if(change.scheduleGuard){
  const guard=change.scheduleGuard,{parent,key}=locate(state,guard.path);
  if(!same(scheduleSnapshot(parent[key]),guard.fields))throw Error('The schedule, deadline, lock or recurrence changed after this AI action. Review it manually.');
 }
 const next=structuredClone(state);
 for(const change of [...changes].reverse()){
  if(!change.before||!change.after||typeof change.before.present!=='boolean'||typeof change.after.present!=='boolean')throw Error('Invalid Undo record.');
  const {parent,key,array}=locate(next,change.path),present=array?key>=0:Object.hasOwn(parent,key),current=present?parent[key]:undefined;
  if(present!==change.after.present||!same(current,change.after.value))throw Error('This field changed after the AI action. Review it manually.');
  if(array){
   if(change.before.present){if(key<0)parent.splice(Math.min(Math.max(0,change.index||0),parent.length),0,structuredClone(change.before.value));else parent[key]=structuredClone(change.before.value);}
   else if(key>=0)parent.splice(key,1);
  }else if(change.before.present)parent[key]=structuredClone(change.before.value);else delete parent[key];
 }
 for(const change of changes)if(change.scheduleGuard){
  const {parent,key}=locate(next,change.scheduleGuard.path),task=parent[key];
  if(task.startTime&&(!task.date||!task.endTime)||!task.startTime&&task.endTime||task.startTime&&task.endTime<=task.startTime||task.date&&task.dueDate&&task.date>task.dueDate)throw Error('Undo would produce an invalid schedule. Review it manually.');
 }
 return next;
}
function titleAt(state,path){
 let current=state,title='Planner';
 for(const part of path){
  current=typeof part==='string'?current?.[part]:Array.isArray(current)?current.find(x=>x.id===part.id):null;
  if(current?.title)title=String(current.title);
 }
 return title;
}
const display=s=>!s.present||s.value==null||s.value===''?'Not set':typeof s.value==='object'?s.value.title?String(s.value.title):Array.isArray(s.value)?s.value.length+' items':JSON.stringify(s.value).slice(0,500):String(s.value);
const fieldLabels={date:'Date',dueDate:'Deadline',startTime:'Start time',endTime:'End time',start:'Start time',end:'End time',day:'Repeats on',category:'Category',estimatedMinutes:'Estimate (minutes)',lastScheduledMinutes:'Duration (minutes)',reminderMinutes:'Reminder (minutes)',scheduleLocked:'Schedule locked',completed:'Completed',archived:'Archived',title:'Title',notes:'Notes',recurrence:'Repeat rule',priority:'Priority'};
function destinationAt(state,path){
 let current=state;const titles=[];
 for(const part of path.slice(0,-1)){
  current=typeof part==='string'?current?.[part]:Array.isArray(current)?current.find(x=>x.id===part.id):null;
  if(current?.title)titles.push(String(current.title));
 }
 return titles.join(' / ')||(path[0]==='scheduleEvents'?'Schedule':'Planner');
}
export function plannerChangeRows(before,after){
 const rows=[];
 for(const c of plannerChanges(before,after)){
  const title=c.after.present?titleAt(after,c.path):titleAt(before,c.path),field=typeof c.path.at(-1)==='string'?fieldLabels[c.path.at(-1)]||c.path.at(-1):c.before.present?'Remove':'Create';
  rows.push({title,field,before:display(c.before),after:display(c.after)});
  const added=!c.before.present&&object(c.after.value),removed=!c.after.present&&object(c.before.value);
  if(added||removed){
   const source=added?after:before,value=added?c.after.value:c.before.value;
   const detail=(entity,path)=>{
    const label=String(entity.title||title),location=destinationAt(source,path);
    rows.push({title:label,field:'Location',before:added?'Not set':location,after:added?location:'Not set'});
    for(const key of Object.keys(fieldLabels)){
     if(key==='title'||entity[key]==null||['completed','archived'].includes(key)&&entity[key]===false)continue;
     const value=key==='day'?['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][entity[key]]??entity[key]:entity[key],text=display(slot(value));
     rows.push({title:label,field:fieldLabels[key],before:added?'Not set':text,after:added?text:'Not set'});
    }
    for(const key of ['sections','tasks'])for(const item of entity[key]||[])detail(item,[...path,key,{id:item.id}]);
   };
   detail(value,c.path);
  }
 }
 return rows;
}
