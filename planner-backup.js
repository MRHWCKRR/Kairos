import {planState} from './plan-merge.js';
export function createPlannerBackup({ownerId,planId,plan,settings={},achievements={},focusData={},now=Date.now()}={}){
 if(!ownerId||!planId||!plan||!Array.isArray(plan.boards))throw Error('Your planner is loading. Try exporting once it is ready.');
 const planner=planState(plan);
 return {format:'kairos-backup',schemaVersion:1,exportedAt:new Date(now).toISOString(),ownerId,planId,planner,
  // Keep the original top-level keys for existing personal export scripts.
  ...structuredClone(planner),settings:structuredClone(settings),achievements:structuredClone(achievements),focusData:structuredClone(focusData)};
}
export function downloadPlannerBackup(backup,{document=globalThis.document,URL=globalThis.URL,Blob=globalThis.Blob}={}){
 const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='kairos-data-export-'+backup.exportedAt.slice(0,10)+'.json';document.body.appendChild(a);
 try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}

