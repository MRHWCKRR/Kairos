import {planState,mergePlanEdits} from './plan-merge.js?v=1';

/** Ordinary planner persistence. The host owns live collections; writes owns the shared queue/baseline. */
export function createPlannerPersistence({writes,getOwnerId,getPlanId,getState,setState,setIdentity,readPlans,initialize,saveEdits,migrate,normalizeBoards,onInvalidate=()=>{},onSaved=()=>{},onReminders=()=>{},onRender=()=>{},onLoadComplete=()=>{},onError=()=>{}}) {
    const listeners=new Set();let record;
    function currentRecord(){const ownerId=getOwnerId();if(record?.ownerId!==ownerId)record={ownerId,count:0,failed:false,saved:false,options:{}};return record;}
    function state(){const r=currentRecord();return {ownerId:r.ownerId,busy:r.count>0,pending:r.failed||r.count>0,retained:false,status:r.count?'saving':r.failed?'unconfirmed':r.saved?'saved':'idle'};}
    function notify(r){if(currentRecord()===r)for(const listener of listeners)listener(state());}
    async function save(options={}) {
        const ownerId=getOwnerId();
        if(!ownerId)return false;
        const status=currentRecord();status.count++;status.options={...options};notify(status);
        writes.markEdit();
        const work=writes.enqueue(async()=>{
            if(getOwnerId()!==ownerId)throw new Error('The signed-in account changed.');
            const existing=getPlanId(),planId=existing||'plan-'+ownerId,local=planState(getState());
            if(!existing)await initialize(ownerId);
            const saved=await saveEdits(planId,ownerId,writes.snapshot||planState({}),local,options);
            if(getOwnerId()!==ownerId)throw new Error('The signed-in account changed.');
            const live=planState(getState()),rebased=mergePlanEdits(local,live,saved);
            const remoteChanges=JSON.stringify(rebased)!==JSON.stringify(live);
            setState(rebased);
            onInvalidate({ownerId,planId,before:writes.snapshot,after:saved});
            writes.snapshot=saved;
            setIdentity(ownerId,planId);
            onSaved();
            if(remoteChanges)onRender();
            onReminders();
            return true;
        });
        try{const result=await work;status.failed=false;status.saved=true;return result}catch(error){status.failed=true;if(currentRecord()===status)onError('save',error);return false}
        finally{status.count--;notify(status);}
    }
    async function load(user) {
        // A reload must not replace live-only edits after a rejected save.
        if(currentRecord().failed)return;
        const ticket=writes.beginLoad();
        ticket.edit=await writes.idle();
        if(currentRecord().failed)return;
        const current=()=>getOwnerId()===user.uid&&writes.isCurrentLoad(ticket);
        if(!current())return;
        try {
            const plans=await readPlans(user.uid);
            if(!current())return;
            if(plans.length){
                plans.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
                const latest=plans[0],previous=getPlanId()===latest.docId?writes.snapshot:null;
                const migrated=migrate(latest);
                const state=planState({boards:normalizeBoards(migrated||getState().boards),dayInsights:latest.dayInsights||{},scheduleEvents:Array.isArray(latest.scheduleEvents)?latest.scheduleEvents:[],calendarSources:Array.isArray(latest.calendarSources)?latest.calendarSources:[]});
                setIdentity(Array.isArray(migrated)?user.uid:null,latest.docId);
                // UI edits mutate live collections; the confirmed baseline must stay independent.
                setState(state);writes.snapshot=planState(state);
                onInvalidate({ownerId:user.uid,planId:latest.docId,before:previous,after:writes.snapshot});
                onReminders();
            }else{
                setIdentity(null,null);writes.snapshot=null;setState(planState({}));
            }
            onRender();
        }catch(error){if(!current())return;onError('load',error);onRender()}
        finally{if(current())onLoadComplete()}
    }
    return {save,load,state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},retry(){const r=currentRecord();return r.failed&&!r.count?save(r.options):Promise.resolve(false)}};
}
