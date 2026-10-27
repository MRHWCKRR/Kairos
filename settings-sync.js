import {createSettingsRecovery,overlaySettingsEdits} from './settings-recovery.js?v=2';
import {normaliseShortcuts} from './shortcut-model.js?v=1';
import {normaliseWeeklyAvailability} from './weekly-availability.js?v=1';
import {normalisePlanningPreferences} from './planning-preferences.js?v=5';

export function normaliseSettings(settings){
    const next=structuredClone(settings);next.accessibility??={};next.accessibility.shortcuts=normaliseShortcuts(next.accessibility.shortcuts);
    if(next.planning){next.planning.weeklyAvailability=normaliseWeeklyAvailability(next.planning.weeklyAvailability);Object.assign(next.planning,normalisePlanningPreferences(next.planning));}
    return next;
}

// Forms own their editable draft; this controller owns the confirmed baseline,
// recovery record and async tickets, including merges after edits during a save.
export function createSettingsSync({getOwnerId,getDraft,setDraft,getApplied,setApplied,defaults,mergeDefaults,readRemote,writeRemote,storage=globalThis.localStorage,onApply=()=>{},onLoaded=()=>{},onSaved=()=>{},onSettled=()=>{},onStatus=()=>{},onError=()=>{},onLoadComplete=()=>{}}={}){
    const recovery=createSettingsRecovery(storage);
    let cloud=structuredClone(getApplied()),pending=null,saving=null,revision=0,disposed=false,owner=getOwnerId(),readyOwner=owner;
    const same=(id,ticket)=>!disposed&&getOwnerId()===id&&revision===ticket;
    function cache(id,settings){try{storage?.setItem('kairos_settings_cache',JSON.stringify(settings));storage?.setItem('kairos_settings_cache_uid',id);}catch{}}
    function reset(){revision++;const next=getOwnerId();readyOwner=null;owner=next;saving=null;pending=null;cloud=defaults();}
    async function load(id){
        if(disposed||!id)return false;
        if(owner!==id)reset();owner=id;const ticket=++revision;
        let loaded=defaults(),confirmed=false;
        try{if(storage?.getItem('kairos_settings_cache_uid')===id)loaded=mergeDefaults(JSON.parse(storage.getItem('kairos_settings_cache')||'{}'));}catch{}
        try{const remote=await readRemote(id);loaded=mergeDefaults(remote.settings||{});confirmed=remote.confirmed===true;}catch(error){if(same(id,ticket))onError('load',error);}
        try{
            if(!same(id,ticket))return false;
            if(!confirmed){const staged=recovery.read(id);if(staged)loaded=mergeDefaults(staged.base);}
            readyOwner=id;cloud=structuredClone(loaded);const restored=recovery.restore(id,loaded,{confirmed});pending=restored.pending;
            setApplied(structuredClone(restored.settings));setDraft(structuredClone(restored.settings));cache(id,restored.settings);onApply();onStatus();onLoaded();return true;
        }finally{onLoadComplete();}
    }
    function dirty(){const id=getOwnerId();if(disposed)return;if(id&&pending?.ownerId===id)pending=recovery.stage(id,cloud,getDraft());onStatus();}
    async function save(){
        const id=getOwnerId();if(disposed||!id||id!==readyOwner||saving?.ownerId===id)return false;
        let submitted;try{submitted=normaliseSettings(getDraft());}catch(error){onError('validation',error);return false;}
        if(owner!==id)reset();owner=id;
        const ticket={ownerId:id},base=structuredClone(cloud),record=recovery.stage(id,base,submitted);pending=record;saving=ticket;revision++;
        setDraft(structuredClone(submitted));setApplied(structuredClone(submitted));cache(id,submitted);onApply();onStatus();
        try{
            let saved=false;
            try{saved=await writeRemote(id,remote=>normaliseSettings(overlaySettingsEdits(base,submitted,mergeDefaults(remote))));}
            catch(error){if(!disposed&&getOwnerId()===id&&saving===ticket)onError('save',error,record);}
            if(disposed||getOwnerId()!==id||saving!==ticket)return false;
            if(saved){
                recovery.clear(id,record);cloud=structuredClone(saved);const draft=overlaySettingsEdits(submitted,getDraft(),saved);setDraft(draft);setApplied(structuredClone(saved));pending=null;
                if(JSON.stringify(draft)!==JSON.stringify(saved))pending=recovery.stage(id,saved,draft);
                cache(id,pending?draft:saved);onApply();onSaved({hasDraft:!!pending});
            }else{pending=recovery.stage(id,cloud,getDraft());cache(id,getDraft());}
            onSettled();return !!saved;
        }finally{if(saving===ticket){saving=null;if(!disposed&&getOwnerId()===id)onStatus();}}
    }
    function cancel(){const id=getOwnerId();if(disposed||saving?.ownerId===id)return false;if(pending?.ownerId===id){recovery.clear(id,pending);pending=null;setApplied(structuredClone(cloud));cache(id,cloud);}setDraft(structuredClone(getApplied()));onApply();onStatus();return true;}
    function clear(id){recovery.clear(id);}
    function dispose(){if(disposed)return;disposed=true;revision++;saving=null;}
    return {load,save,dirty,cancel,reset,clear,dispose,state:()=>({cloud,pending,saving,ready:!!owner&&owner===getOwnerId()&&readyOwner===owner})};
}
