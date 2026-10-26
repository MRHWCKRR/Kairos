import {stableStringify} from './plan-merge.js?v=1';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

// Reapply only locally edited fields. A retry explicitly prefers those edits;
// unrelated changes made on another device retain their current cloud values.
export function overlaySettingsEdits(base,local,remote){
 if(stableStringify(base)===stableStringify(local))return structuredClone(remote);
 if(object(local)&&object(remote))return Object.fromEntries([...new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])].map(key=>[key,overlaySettingsEdits(base?.[key],local[key],remote[key])]).filter(([,value])=>value!==undefined));
 return local===undefined?undefined:structuredClone(local);
}

export function createSettingsRecovery(storage){
 if(!storage)try{storage=globalThis.localStorage}catch{}
 const key=owner=>'kairos-settings-pending:'+owner;
 function read(owner){
  if(!owner)return null;
  try{const record=JSON.parse(storage?.getItem(key(owner))||'null');return record?.version===1&&record.ownerId===owner&&typeof record.id==='string'&&object(record.base)&&object(record.settings)?record:null}catch{return null}
 }
 function stage(owner,base,settings){
  const record={version:1,id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),ownerId:owner,base:structuredClone(base),settings:structuredClone(settings)};
  try{if(!storage)throw Error('Storage unavailable');storage.setItem(key(owner),JSON.stringify(record));record.persisted=true}catch{record.persisted=false}
  return record;
 }
 function clear(owner,expected){try{if(!expected||read(owner)?.id===expected.id)storage?.removeItem(key(owner))}catch{}}
 function restore(owner,remote,{confirmed=true}={}){
  const record=read(owner);if(!record)return {settings:remote,pending:null};
  const settings=overlaySettingsEdits(record.base,record.settings,remote);
  if(confirmed&&stableStringify(settings)===stableStringify(remote)){clear(owner,record);return {settings:remote,pending:null}}
  return {settings,pending:{...record,base:structuredClone(remote),settings:structuredClone(settings),persisted:true}};
 }
 return {read,stage,clear,restore};
}
