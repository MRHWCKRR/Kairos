import {mountTodayView,mountMutationFeedback} from './today-view.js?v=8';
import {mountAiUndo} from './ai-undo-view.js?v=4';

export function createDashboardController({document=globalThis.document,window=globalThis.window,getIdentity,getState,getToday,session,onCapture,confirmClear,loadUndoPreview,openTask,requestClose,navigate,setScheduleDate,selectOccurrence,selectItem}={}){
    let today=null,feedback=null,undo=null,mounted=false,disposed=false,generation=0,actor=JSON.stringify(getIdentity());
    async function open(row,action,source){
        const identity=getIdentity();if(disposed||!identity?.ownerId||!identity?.planId)return false;
        const ticket=generation,id=JSON.stringify(identity),current=()=>!disposed&&generation===ticket&&JSON.stringify(getIdentity())===id;
        if(action==='open'&&row.kind==='task'&&!row.occurrenceDate)return openTask(row.taskId,source);
        if(!await requestClose()||!current())return false;
        await navigate('schedule-page');if(!current())return false;
        setScheduleDate(row.date||getToday());
        if(row.kind==='event')return selectItem('event',row.id,{occurrenceDate:row.occurrenceDate||null});
        if(row.occurrenceDate)return selectOccurrence({seriesId:row.taskId,occurrenceId:row.taskId+'::'+row.occurrenceDate,occurrenceDate:row.occurrenceDate});
        return selectItem(row.kind==='event'?'event':'task',row.taskId||row.id);
    }
    function mount(){
        if(disposed||mounted)return;mounted=true;
        feedback=mountMutationFeedback({root:document.getElementById('planner-mutation-feedback'),session,window,confirmClear});
        today=mountTodayView({root:document.getElementById('dashboard-focus-container'),document,window,getIdentity,getState,getToday,session,onCapture,confirmClear,onOpen:open});
        undo=mountAiUndo({root:document.getElementById('ai-mutation-tools'),document,window,getIdentity,session,loadPreview:loadUndoPreview});
        window?.addEventListener('pagehide',pagehide);
    }
    function sync(){if(disposed)return;const next=JSON.stringify(getIdentity());if(next!==actor){actor=next;generation++;}session.sync();today?.sync();feedback?.sync();undo?.sync();}
    function pagehide(event){if(!event.persisted)dispose();}
    function dispose(){if(disposed)return;disposed=true;generation++;today?.dispose();feedback?.dispose();undo?.dispose();window?.removeEventListener('pagehide',pagehide);today=feedback=undo=null;}
    return {mount,sync,open,dispose};
}
