import {stableStringify,planState} from './plan-merge.js?v=1';
import {assertPlannerValue} from './planner-value-contract.js';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function validate(record,owner){
 if(record?.version!==1||record.ownerId!==owner||typeof record.id!=='string'||!record.id||typeof record.planId!=='string'||!record.planId||record.planId.includes('/')||typeof record.newPlan!=='boolean'||!object(record.options))throw Error('Invalid planner recovery data.');
 if(record.attempt!==undefined&&!object(record.attempt))throw Error('Invalid planner recovery attempt.');
 for(const state of [record.base,record.local,...(record.attempt?[record.attempt.base,record.attempt.local]:[])])if(!object(state)||!Array.isArray(state.boards)||!Array.isArray(state.scheduleEvents)||!Array.isArray(state.calendarSources)||!object(state.dayInsights)||stableStringify(planState(state))!==stableStringify(state))throw Error('Invalid planner recovery data.');
 assertPlannerValue(record);
}
export function createPlannerSaveRecovery(storage){
 if(!storage)try{storage=globalThis.localStorage}catch{}
 const key=owner=>'kairos-planner-pending:'+owner;
 function inspect(owner){
  if(!owner)return {raw:null,record:null};
  let raw;try{raw=storage?.getItem(key(owner))??null;if(raw===null)return {raw,record:null};const record=JSON.parse(raw);validate(record,owner);return {raw,record};}
  catch{return {raw,error:'Planner recovery could not be read. Review it before saving.'};}
 }
 function stage(owner,record,expectedRaw){
  if(!storage)throw Error('Browser recovery storage is unavailable. Keep this tab open.');
  if(storage.getItem(key(owner))!==expectedRaw)throw Error('Planner recovery changed. Reopen Kairos to review the retained changes.');
  validate(record,owner);const raw=JSON.stringify(record);
  if(stableStringify(JSON.parse(raw))!==stableStringify(record))throw Error('These edits cannot be retained safely. Keep this tab open.');
  storage.setItem(key(owner),raw);
  if(storage.getItem(key(owner))!==raw)throw Error('Planner recovery could not be verified. Keep this tab open.');
  return raw;
 }
 function clear(owner,expectedRaw){
  if(arguments.length>1&&expectedRaw===undefined)throw Error('Recovery could not be read safely. Keep this tab open.');
  if(!storage){if(expectedRaw==null)return;throw Error('Browser recovery storage is unavailable.');}
  if(expectedRaw!==undefined&&storage.getItem(key(owner))!==expectedRaw)throw Error('Planner recovery changed. Reopen Kairos to review it.');
  storage.removeItem(key(owner));if(storage.getItem(key(owner))!==null)throw Error('Planner recovery could not be cleared.');
 }
 return {inspect,stage,clear};
}
