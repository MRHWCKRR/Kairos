import {planningConflicts} from '../../planning-slots.js';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {mergePlanEdits,planState,stableStringify} from '../../plan-merge.js';
import {taskDurationMinutes} from '../../schedule-utils.js';
import {taskListFingerprint} from '../../task-list-model.js';
import {previewAiPlanning,aiPlanningSummary,resolveAiPlanningTimezone} from '../../ai-planning.js';
import {applyPlanningCommand} from '../../planning-commands.js';

export async function plannerFixture(data, {failAfterCommit=false,retryTransaction=false}={}) {
  let stored=structuredClone(data), writes=[], events=0, fail=failAfterCommit;
  const context=vm.createContext({structuredClone,console,Date,Intl,previewAiPlanning,aiPlanningSummary,resolveAiPlanningTimezone,planningConflicts,applyPlanningCommand,mergePlanEdits,planState,stableStringify,taskDurationMinutes,taskListFingerprint,
    auth:{currentUser:{uid:'one'}},db:{},collection:()=>({}),query:x=>x,where:()=>({}),doc:(...args)=>args,
    serverTimestamp:()=>({seconds:1}),getDoc:async()=>({exists:()=>!!stored,data:()=>structuredClone(stored)}),
    getDocs:async()=>({docs:stored?[{id:'plan',data:()=>structuredClone(stored)}]:[]}),
    setDoc:async(_,next)=>{stored={...stored,...structuredClone(next)};writes.push(structuredClone(stored))},
    runTransaction:async(_,callback)=>{
      let pending;
      const tx={get:async()=>({exists:()=>!!stored,data:()=>structuredClone(stored)}),
        set:(_,next)=>pending=structuredClone(next)};
      if(retryTransaction){await callback(tx);pending=undefined}
      const result=await callback(tx);
      if(pending){stored={...stored,...pending};writes.push(structuredClone(stored))}
      if(fail){fail=false;throw new Error('Network response lost')}
      return result;
    },
    window:{dispatchEvent(){events++}},CustomEvent:class{},invalidateKairosContext(){}});
  const strip=s=>s.replace(/^import[\s\S]*?;\s*/gm,'').replace(/^export /gm,'');
  vm.runInContext(strip(await readFile(new URL('../../ai-action-schema.js',import.meta.url),'utf8')),context);
  let store='';
  try{store=await readFile(new URL('../../plan-store.js',import.meta.url),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  vm.runInContext(strip(store),context);
  vm.runInContext(strip(await readFile(new URL('../../ai-actions.js',import.meta.url),'utf8')),context);
  return {context,writes,data:()=>structuredClone(stored),events:()=>events,
    execute:(action,options)=>context.executeKairosAction(action,options)};
}
