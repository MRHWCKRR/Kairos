import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';

async function fixture({dialog=false}={}){
 const module=await import('../task-checklist-reorder.js').catch(()=>({}));assert.equal(typeof module.mountChecklistReorder,'function');
 const {document,window}=parseHTML('<html><body><main class="page-view active"><aside class="task-detail-pane"><section><ul></ul></section></aside></main></body></html>');
 const root=document.querySelector('section'),list=root.querySelector('ul'),pane=root.parentElement,page=document.querySelector('main'),items=['a','b','c'].map(id=>({id,title:id==='a'?'<img src=x>':id,completed:false})),calls=[],frames=new Map();let enabled=true,frameId=0,hit=null,releases=0;
 if(dialog){const modal=document.createElement('dialog');modal.setAttribute('open','');document.body.appendChild(modal);modal.appendChild(pane)}
 const rect=(top,bottom)=>({left:0,right:300,top,bottom,width:300,height:bottom-top});pane.getBoundingClientRect=()=>rect(0,300);list.getBoundingClientRect=()=>rect(50,200);Object.defineProperties(pane,{scrollHeight:{value:900},clientHeight:{value:300}});pane.scrollTop=0;
 for(const [index,item] of items.entries()){const row=document.createElement('li');row.dataset.stepRow=item.id;row.innerHTML='<button data-step-grip type="button">Grip</button><input data-step-title><input data-step-check type="checkbox">';row.querySelector('[data-step-title]').value=item.title;row.getBoundingClientRect=()=>rect(50+index*50,100+index*50);list.appendChild(row)}
 document.elementFromPoint=(x,y)=>x<0||x>300||y<50||y>200?null:hit;root.setPointerCapture=()=>{};root.releasePointerCapture=()=>releases++;
 const controller=module.mountChecklistReorder({root,list,getItems:()=>items,onReorder:drop=>calls.push(drop),isEnabled:()=>enabled,document,window,requestFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelFrame:id=>frames.delete(id)});
 const row=id=>list.querySelector('[data-step-row="'+id+'"]'),grip=id=>row(id).querySelector('[data-step-grip]');
 const event=(target,type,props={})=>{const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,isPrimary:true,clientX:30,clientY:60},props);target.dispatchEvent(e);return e};
 const down=(id='a',props={})=>event(grip(id),'pointerdown',props),move=(id='c',props={})=>{hit=row(id);return event(document,'pointermove',{clientY:190,...props})},up=(props={})=>event(document,'pointerup',{clientY:190,...props});
 const frame=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn()};
 return {document,window,root,list,pane,page,items,calls,frames,controller,row,grip,event,down,move,up,frame,setEnabled:value=>enabled=value,setHit:value=>hit=value,releases:()=>releases};
}
test('only primary grip starts and the 4px threshold never mutates the draft while moving',async()=>{
 const f=await fixture();for(const target of [f.row('a').querySelector('[data-step-title]'),f.row('a').querySelector('[data-step-check]')]){f.event(target,'pointerdown');f.move();assert.equal(f.root.querySelector('.checklist-dragging'),null)}
 for(const props of [{button:2},{isPrimary:false}]){f.down('a',props);f.move();assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null)}
 f.down();f.move('a',{clientY:63});assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null);f.move('c',{clientY:64});assert.ok(f.document.querySelector('[data-checklist-drag-preview]'));assert.deepEqual(f.calls,[]);assert.deepEqual(f.items.map(x=>x.id),['a','b','c']);assert.equal(f.document.querySelector('[data-checklist-drag-preview] img'),null);f.controller.dispose();
});
test('valid release commits once with a fresh before or after insertion target',async()=>{
 for(const [y,after] of [[151,false],[195,true]]){const f=await fixture();f.down();f.move('c',{clientY:y});assert.equal(f.row('c').classList.contains(after?'checklist-drop-after':'checklist-drop-before'),true);assert.deepEqual(f.calls,[]);f.up({clientY:y});f.up({clientY:y});assert.deepEqual(f.calls,[{stepId:'a',anchorId:'c',after}]);assert.equal(f.frames.size,0);assert.equal(f.root.querySelector('.checklist-dragging'),null);f.controller.dispose();}
});
test('outside, source, no-op and wrong-pointer releases never apply stale targets',async()=>{
 for(const scenario of ['outside','source','noop','wrong']){const f=await fixture();f.down();f.move();if(scenario==='outside')f.up({clientX:500});else if(scenario==='source'){f.setHit(f.row('a'));f.up({clientY:75})}else if(scenario==='noop'){f.setHit(f.row('b'));f.up({clientY:101})}else {f.up({pointerId:2});assert.equal(f.calls.length,0);f.event(f.document,'pointercancel');}assert.equal(f.calls.length,0);assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null);f.controller.dispose();}
});
test('Escape cancels before the pane close action and removes drag feedback and frames',async()=>{
 const f=await fixture();let closed=0;f.pane.addEventListener('keydown',()=>closed++);f.down();f.move();const e=f.event(f.grip('a'),'keydown',{key:'Escape'});assert.equal(e.defaultPrevented,true);assert.equal(closed,0);assert.equal(f.frames.size,0);assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null);f.up();assert.equal(f.calls.length,0);f.controller.dispose();
});
test('cancellation lifecycle cannot leave a pending drag or callback',async()=>{
 for(const scenario of ['cancel','lost','blur','disabled','page','order','dispose']){const f=await fixture();f.down();f.move();if(scenario==='cancel')f.event(f.document,'pointercancel');if(scenario==='lost')f.event(f.root,'lostpointercapture');if(scenario==='blur')f.window.dispatchEvent(new f.window.Event('blur'));if(scenario==='disabled'){f.setEnabled(false);f.frame()}if(scenario==='page'){f.page.classList.remove('active');f.frame()}if(scenario==='order'){f.items.reverse();f.frame()}if(scenario==='dispose')f.controller.dispose();assert.equal(f.document.querySelector('[data-checklist-drag-preview]'),null,scenario);assert.equal(f.frames.size,0,scenario);f.up();assert.equal(f.calls.length,0,scenario);f.controller.dispose();}
});
test('expanded drag preview stays in the dialog and auto-scroll recalculates destination',async()=>{
 const f=await fixture({dialog:true});f.pane.getBoundingClientRect=()=>({top:50,bottom:200,left:0,right:300,height:150,width:300});f.down();f.move('b',{clientY:190});assert.ok(f.document.querySelector('dialog [data-checklist-drag-preview]'));f.setHit(f.row('c'));f.frame();assert.equal(f.pane.scrollTop,12);assert.equal(f.row('c').classList.contains('checklist-drop-after'),true);assert.equal(f.calls.length,0);f.up();assert.equal(f.calls[0].anchorId,'c');f.controller.dispose();
});
