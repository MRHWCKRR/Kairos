import {planState,stableStringify} from './plan-merge.js';

const id=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const seconds=v=>Number.isSafeInteger(v)&&v>=0;
function count(v){if(v===undefined)return 0;if(!seconds(v))throw Error('Saved focus totals need review.');return v}
function adjust(v,delta){const next=count(v)+delta;if(!seconds(next))throw Error('Saved focus totals need review.');return next}
const tasks=plan=>(plan?.boards||[]).flatMap(b=>(b.sections||[]).flatMap(s=>s.tasks||[]));
const stale=message=>Object.assign(Error(message),{code:'focus-history-stale'});

// Keep the account document bounded. Evicted sessions become part of the
// uneditable baseline; their time stays in all existing aggregates.
export function appendFocusHistory(user,plan,entry,result,day){
 const history=structuredClone(user.focusHistory||{sessions:[],baselineLongest:count(user.focusData?.longestSessionSeconds)});
 const parent=entry.target?.assignmentId?tasks(plan).filter(t=>t.id===entry.target.assignmentId):[];
 history.sessions.push({id:entry.id,planId:entry.planId,endedAt:entry.endedAt,day,seconds:entry.seconds,revision:0,taskId:result.taskId,title:result.task?.title||entry.target?.title||'General focus',assignmentTitle:parent.length===1?String(parent[0].title||'Assignment').slice(0,180):'',attributed:result.attributed});
 while(history.sessions.length>100||history.sessions.length>1&&JSON.stringify(history).length>65536){const old=history.sessions.shift();history.baselineLongest=Math.max(count(history.baselineLongest),old.removed?0:old.seconds)}
 return history;
}

export function applyFocusCorrection(user,plan,edit){
 if(!edit||Object.keys(edit).some(k=>!['id','ownerId','planId','sessionId','revision','seconds'].includes(k))||![edit.id,edit.ownerId,edit.sessionId].every(id)||(edit.planId!==null&&!id(edit.planId))||!seconds(edit.revision)||!seconds(edit.seconds)||edit.seconds>86400)throw Error('Invalid focus correction identity, duration or fields.');
 if(plan&&plan.userID!==edit.ownerId)throw Error('This planner belongs to another account.');
 const history=structuredClone(user.focusHistory||{sessions:[]}),session=history.sessions.find(s=>s.id===edit.sessionId);
 if(!session)throw stale('This session is no longer available in recent history.');
 if(session.planId!==edit.planId)throw Error('The session planner changed.');
 const fingerprint=stableStringify(edit);
 if(session.lastEdit?.id===edit.id){if(session.lastEdit.fingerprint!==fingerprint)throw Error('This correction identity belongs to a different edit.');return {userPatch:null,planPatch:null,result:{type:'focus_correction',completedTaskIds:[],focusData:structuredClone(user.focusData||{})}}}
 if(session.removed||session.revision!==edit.revision)throw stale('This session changed or was removed. Refresh history before editing.');
 const delta=edit.seconds-session.seconds,old=user.focusData||{},next=plan?planState(plan):null,matches=session.attributed?tasks(next).filter(t=>t.id===session.taskId):[];
 if(matches.length>1)throw stale('This task identity is ambiguous. Review the planner before correcting time.');
 if(matches.length===1)matches[0].focusLoggedSeconds=adjust(matches[0].focusLoggedSeconds,delta);
 session.seconds=edit.seconds;session.revision++;session.removed=edit.seconds===0;session.lastEdit={id:edit.id,fingerprint};
 const focusData={...structuredClone(old),totalSeconds:adjust(old.totalSeconds,delta),dailyFocusLog:{...old.dailyFocusLog,[session.day]:adjust(old.dailyFocusLog?.[session.day],delta)},longestSessionSeconds:Math.max(count(history.baselineLongest),...history.sessions.filter(s=>!s.removed).map(s=>s.seconds))};
 return {userPatch:{focusHistory:history,focusData},planPatch:matches.length===1?next:null,result:{type:'focus_correction',completedTaskIds:[],focusData}};
}
