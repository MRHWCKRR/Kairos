import {mergePlanEdits} from './plan-merge.js';

// The user-document listener is shared with progress widgets; this controller
// owns its lifetime so signing out also invalidates delayed reads and writes.
export function createNotificationCenter({document=globalThis.document,getOwnerId,subscribe,persist,escapeText,translate=key=>key,onUserData=()=>{},showBrowserNotification=()=>{},onError=console.error,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    let owner=null,notifications=[],snapshot=[],unsubscribe=null,generation=0,snapshotRevision=0,readTimer=null,bellCleanup=null,bellTargets=null,disposed=false,write=null,saveRequested=false;
    const current=(id,ticket)=>!disposed&&owner===id&&getOwnerId()===id&&generation===ticket;
    function cancelRead(){if(readTimer!==null)clearTimer(readTimer);readTimer=null;}
    function reset(){generation++;cancelRead();unsubscribe?.();unsubscribe=null;owner=null;notifications=[];snapshot=[];write=null;saveRequested=false;document?.getElementById('notif-panel')?.classList.remove('active');render();}
    function setup(id){
        if(disposed||!id||getOwnerId()!==id)return;
        if(owner===id&&unsubscribe)return;
        reset();owner=id;const ticket=generation;
        unsubscribe=subscribe(id,data=>{
            if(!current(id,ticket))return;
            onUserData(data);
            if(Array.isArray(data?.notifications)){
                try{notifications=mergePlanEdits(snapshot,notifications,data.notifications);}
                catch(error){onError('Notifications changed while local edits were pending:',error);return;}
                snapshot=structuredClone(data.notifications);snapshotRevision++;
            } else if(!data||data.notifications===undefined){
                if(!notifications.length){notifications=[{id:'notif-welcome',title:'Welcome to Kairos! 👋',message:'Set up your first routine or paste a syllabus into AI Helper to get going.',time:now(),read:false}];void save();}
            }
            render();
        },error=>{if(current(id,ticket))onError('Notifications sync error:',error);});
    }
    async function save(){
        const id=owner,ticket=generation;if(!id||!current(id,ticket))return;
        saveRequested=true;if(write)return write;
        // Serialize edits so a second click uses the acknowledged baseline and
        // cannot let an older completion replace a newer account's snapshot.
        const operation=(async()=>{
            while(saveRequested&&current(id,ticket)){
                saveRequested=false;const base=structuredClone(snapshot),local=structuredClone(notifications),revision=snapshotRevision;
                try{
                    const merged=await persist(id,base,local);
                    if(!current(id,ticket))return;
                    if(revision===snapshotRevision){notifications=mergePlanEdits(local,notifications,merged);snapshot=structuredClone(merged);snapshotRevision++;render();}
                }catch(error){if(current(id,ticket))onError('Error saving notifications:',error);return;}
            }
        })();
        write=operation;try{await operation;}finally{if(write===operation)write=null;}
    }
    function unreadCount(){return notifications.filter(n=>!n.read).length;}
    function timeAgo(ts){const mins=Math.floor(Math.max(0,now()-ts)/60000);if(mins<1)return 'Just now';if(mins<60)return `${mins}m ago`;const hours=Math.floor(mins/60);return hours<24?`${hours}h ago`:`${Math.floor(hours/24)}d ago`;}
    function render(){
        const badge=document?.getElementById('notif-badge'),count=unreadCount();if(badge){badge.textContent=count>9?'9+':String(count);badge.style.display=count?'flex':'none';}
        const list=document?.getElementById('notif-panel-list');if(!list)return;
        if(!notifications.length){list.innerHTML=`<p class="notif-empty text-muted">${escapeText(translate('no_notifications_yet'))}</p>`;return;}
        list.innerHTML=notifications.map(n=>`
            <div class="notif-item ${n.read?'':'unread'}" data-notif-id="${escapeText(n.id)}">
                <div class="notif-item-dot"></div>
                <div class="notif-item-body">
                    <p class="notif-item-title">${escapeText(n.title)}</p>
                    <p class="notif-item-message">${escapeText(n.message)}</p>
                    <p class="notif-item-time">${timeAgo(n.time)}</p>
                </div>
                <div class="dots-menu-wrapper notif-dots-wrapper">
                    <button type="button" class="dots-menu-btn notif-dots-btn" title="Options">⋮</button>
                    <div class="dots-menu notif-dots-menu">
                        <button type="button" class="notif-delete-btn danger-option" data-notif-id="${escapeText(n.id)}">Delete</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    function bindBell(){
        if(disposed)return;
        const bell=document?.getElementById('notif-bell-btn'),wrapper=document?.getElementById('notif-wrapper'),panel=document?.getElementById('notif-panel');
        if(bellTargets?.[0]===bell&&bellTargets?.[1]===wrapper&&bellTargets?.[2]===panel)return;
        bellCleanup?.();bellCleanup=null;bellTargets=null;cancelRead();
        if(!bell||!wrapper||!panel)return;
        bellTargets=[bell,wrapper,panel];
        const click=event=>{
            event.stopPropagation();const open=!panel.classList.contains('active');cancelRead();document.querySelectorAll('.notif-panel.active').forEach(p=>p.classList.remove('active'));
            if(!open)return;
            panel.classList.add('active');const id=owner,ticket=generation,visibleIds=new Set(notifications.filter(n=>!n.read).map(n=>n.id));
            if(visibleIds.size)readTimer=setTimer(()=>{readTimer=null;if(!current(id,ticket))return;notifications=notifications.map(n=>visibleIds.has(n.id)?{...n,read:true}:n);render();void save();},700);
        };
        const outside=event=>{if(!wrapper.contains(event.target))panel.classList.remove('active');};
        bell.addEventListener('click',click);document.addEventListener('click',outside);bellCleanup=()=>{bell.removeEventListener('click',click);document.removeEventListener('click',outside);};render();
    }
    function push(title,message){if(disposed||!owner||getOwnerId()!==owner)return;notifications=[{id:'notif-'+now()+'-'+Math.random().toString(36).slice(2,7),title,message,time:now(),read:false},...notifications].slice(0,50);render();void save();showBrowserNotification(title,message);}
    function remove(id){if(disposed||!owner||getOwnerId()!==owner)return;notifications=notifications.filter(n=>n.id!==id);render();return save();}
    function dispose(){if(disposed)return;reset();disposed=true;bellCleanup?.();bellCleanup=null;bellTargets=null;}
    return {setup,reset,save,push,remove,render,bindBell,unreadCount,dispose,state:()=>({owner,notifications:structuredClone(notifications),snapshot:structuredClone(snapshot)})};
}
