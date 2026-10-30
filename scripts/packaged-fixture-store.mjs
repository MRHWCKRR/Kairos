import {applyTaskListCommand} from '../task-list-model.js';
import {planState,stableStringify} from '../plan-merge.js';
import {assertPlannerValue} from '../planner-value-contract.js';
import {defaultSettings} from '../app-settings-model.js';

// Test-only storage boundary, not a Firestore emulator or an authentication service.
export function createPackagedFixtureStore({date=new Date().toISOString().slice(0,10)}={}) {
 const owners=new Map(['packaged-fixture','other-fixture'].map(owner=>{
  const settings=defaultSettings();settings.profile.timezone='UTC';settings.profile.avatarURL='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  return [owner,{planner:planState({boards:[{id:'b',title:'Packaged smoke board',sections:[{id:'s',title:'Section',tasks:[{id:'t',title:'Packaged smoke task',date,startTime:'09:00',endTime:'10:00',completed:false}]}]}]}),settings,receipts:[],writes:0}];
 }));
 const record=owner=>{if(!owners.has(owner))throw Error('Unknown fixture owner.');return owners.get(owner)};
 return {
  read:owner=>structuredClone(record(owner)),
  commit(owner,{command,expected,identity}){
   const data=record(owner);
   if(identity?.ownerId!==owner||identity.planId!=='fixture'||typeof identity.operationId!=='string'||!identity.operationId||!Number.isFinite(identity.createdAt)||identity.createdAt<=0)throw Error('Invalid fixture identity.');
   const fingerprint=stableStringify({command,expected}),receipt=data.receipts.find(r=>r.id===identity.operationId);
   if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('Fixture operation changed.');return structuredClone(receipt.result)}
   const applied=applyTaskListCommand(data.planner,command,expected);assertPlannerValue(applied.next);
   data.planner=structuredClone(applied.next);data.receipts.push({id:identity.operationId,fingerprint,result:structuredClone(applied.result)});data.writes++;
   return structuredClone(applied.result);
  },
  saveSettings(owner,settings){const data=record(owner);assertPlannerValue(settings);data.settings=structuredClone(settings);return structuredClone(data.settings)}
 };
}
