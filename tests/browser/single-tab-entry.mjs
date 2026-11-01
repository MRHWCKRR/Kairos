// Multiple same-origin browsing contexts, real native locks and built bootstrap.
// Only app.js is mapped to a harmless fixture so this never contacts Firebase.
const result=document.getElementById('packaged-smoke-result');
const check=(value,message)=>{if(!value)throw Error(message);};
const wait=async(predicate,label)=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out: '+label);};
const frames=[];
function frame(id){const element=document.createElement('iframe');element.title='Workspace '+id;element.src='/__tab.html?id='+id;element.style='width:640px;height:460px';document.body.appendChild(element);frames.push(element);return element;}
const started=frame=>frame.contentDocument?.documentElement.dataset.workspaceStarted==='true';
const blocked=frame=>frame.contentDocument?.getElementById('workspace-tab-gate')?.dataset.reason==='blocked';
try{
 const first=frame('first'),second=frame('second');
 await wait(()=>(started(first)&&blocked(second))||(started(second)&&blocked(first)),'one active and one blocked document');
 const owner=started(first)?first:second,other=owner===first?second:first;
 check(owner.contentDocument.documentElement.dataset.workspaceStarts==='1','Owner initialized more than once');
 check(!started(other),'Blocked document imported the application');
 const gate=other.contentDocument.getElementById('workspace-tab-gate'),button=gate.querySelector('[data-tab-retry]');
 check(other.contentWindow.getComputedStyle(gate).position==='fixed','Blocked screen stylesheet did not load');
 button.scrollIntoView();button.focus();check(other.contentDocument.activeElement===button&&!button.disabled,'Blocked recovery must be keyboard accessible');
 button.click();await new Promise(resolve=>setTimeout(resolve,500));check(blocked(other)&&!started(other),'Retry displaced the original owner');
 owner.remove();button.click();await wait(()=>started(other),'retry after original document closes');
 check(!other.contentDocument.getElementById('workspace-tab-gate'),'Successful retry retained the gate');
 const previous=other.contentDocument;other.contentWindow.location.reload();
 await wait(()=>other.contentDocument!==previous&&started(other),'ordinary owner reload');
 const third=frame('third');await wait(()=>blocked(third),'third workspace blocked after owner reload');
 check(!started(third),'Reload allowed a second active app');
 result.dataset.result='passed';result.textContent='Passed packaged single workspace: concurrent tabs, blocked imports, keyboard retry, owner closure and reload.';
}catch(error){result.dataset.result='failed';result.textContent='Failed single workspace: '+error.message;}
finally{for(const element of frames)element.remove();}
