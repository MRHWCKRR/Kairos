// Fixture composition only. All imported UI, validation and sync code comes from dist.
import {createMutationSession} from '/mutation-session.js?v=@@VERSION@@';
import {resolveTaskDetail} from '/task-list-model.js?v=@@VERSION@@';
import {mountTaskCapture} from '/task-capture.js?v=@@VERSION@@';
import {createSettingsSync} from '/settings-sync.js?v=@@VERSION@@';
import {createSettingsForm} from '/app-settings-form.js?v=@@VERSION@@';
import {defaultSettings,deepMerge} from '/app-settings-model.js?v=@@VERSION@@';

export function createPackagedErrorLedger(storage){
 const key='packaged-runtime-errors',errors=JSON.parse(storage.getItem(key)||'[]');
 return {record(message){errors.push(String(message));storage.setItem(key,JSON.stringify(errors));},check(){if(errors.length)throw Error('Packaged runtime errors: '+errors.join('; '));}};
}

export async function createPackagedPlannerHost(){
 const identity={ownerId:'packaged-fixture',planId:'fixture'};
 async function request(path='',body,fault){
  const response=await fetch('/__fixture/'+identity.ownerId+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(fault?{'x-fixture-failure':fault}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Fixture request failed.');return value;
 }
 const initial=await request();let data=initial.planner,applied=defaultSettings(),draft=defaultSettings(),details,workspace,failTask=false,failSettings=false;
 const date=data.boards[0].sections[0].tasks[0].date,root=document.getElementById('tasks-page'),overview=document.getElementById('tasks-manager-container');
 const render=()=>workspace?.render();
 const session=createMutationSession({getIdentity:()=>identity,storage:localStorage,commit:async(command,expected,id)=>{
  const fault=failTask?'after-task':null;failTask=false;
  const saved=await request('/tasks',{command,expected,identity:id},fault);data=saved.planner;render();return saved.result;
 }});
 const commit=(...args)=>session.submit(...args);
 const capture=mountTaskCapture({document,window,getIdentity:()=>identity,getState:()=>data,getDefaults:()=>({boardId:'b',sectionId:'s',date}),commit,storage:localStorage});
 function refreshSaveBar(){
  const state=sync.state(),dirty=!!state.pending||JSON.stringify(draft)!==JSON.stringify(applied);
  document.getElementById('settings-save-bar').classList.toggle('active',dirty||!!state.saving);
  const save=document.getElementById('settings-save-btn');save.disabled=!!state.saving||!state.ready;save.textContent=state.saving?'Saving changes.':state.pending?'Retry save':'Save Changes';
 }
 const sync=createSettingsSync({getOwnerId:()=>identity.ownerId,getDraft:()=>draft,setDraft:value=>{draft=value},getApplied:()=>applied,setApplied:value=>{applied=value},defaults:defaultSettings,mergeDefaults:value=>deepMerge(defaultSettings(),value),storage:localStorage,onStatus:refreshSaveBar,
  readRemote:async()=>({settings:(await request()).settings,confirmed:true}),
  writeRemote:async(_owner,merge)=>{const current=await request(),fault=failSettings?'before-settings':null;failSettings=false;return (await request('/settings',merge(current.settings),fault)).result;}
 });
 await sync.load(identity.ownerId);
 const form=createSettingsForm({document,getDraft:()=>draft,setDraft:value=>{draft=value},getApplied:()=>applied,getUser:()=>({uid:identity.ownerId,email:'fixture@example.invalid',providerData:[]}),settingsSync:sync,onDirty:()=>sync.dirty(),onControlsRefresh(){},onSaveBar:refreshSaveBar,tr:key=>key,getLocale:()=> 'en',updateBrowserPushHint(){}});
 let saving=null;
 document.getElementById('settings-save-btn').addEventListener('click',()=>{saving=sync.save();});
 return {identity,date,session,capture,sync,form,request,getState:()=>data,getApplied:()=>applied,getDraft:()=>draft,getDetails:()=>details,getWorkspace:()=>workspace,getSaving:()=>saving,
  failNextTask(){failTask=true},failNextSettings(){failSettings=true},
  setupTaskDetails(module){details=module.mountTaskDetailPane({root,document,window,getOwnerId:()=>identity.ownerId,getPlanId:()=>identity.planId,getState:()=>data,getToday:()=>date,resolveTarget:target=>resolveTaskDetail(data,target),commit});},
  setupTaskWorkspace(module){workspace=module.mountTaskListWorkspace({root,overview,getState:()=>data,getOwnerId:()=>identity.ownerId,getPlanId:()=>identity.planId,getToday:()=>date,commit,requestCloseDetails:()=>details.requestClose()});},
 };
}
