import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {dialogPosition,mountDialogWindow} from '../dialog-window.js';
test('dialog geometry centres and clamps a window including a smaller viewport',()=>{
 assert.deepEqual(dialogPosition({width:400,height:300,viewportWidth:1200,viewportHeight:800}),{x:400,y:250});
 assert.deepEqual(dialogPosition({width:400,height:300,viewportWidth:1200,viewportHeight:800},{x:-50,y:900}),{x:12,y:488});
 assert.deepEqual(dialogPosition({width:400,height:300,viewportWidth:300,viewportHeight:200},{x:80,y:80}),{x:0,y:0});
});
function fixture(){
 const {document,window}=parseHTML('<html><body><dialog open><header><h2>Search</h2><button>Close</button></header><input></dialog></body></html>');
 window.innerWidth=1200;window.innerHeight=800;
 const dialog=document.querySelector('dialog'),handle=dialog.querySelector('header');
 dialog.getBoundingClientRect=()=>({left:parseFloat(dialog.style.left)||0,top:parseFloat(dialog.style.top)||0,width:400,height:300});
 const control=mountDialogWindow({dialog,window});
 const send=(target,type,props={})=>{const event=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:410,clientY:260,...props});target.dispatchEvent(event);return event};
 return {document,window,dialog,handle,control,send};
}
test('drag starts centred, ignores buttons and holds its grab point within the viewport',()=>{
 const f=fixture();f.control.reset();assert.equal(f.dialog.style.left,'400px');assert.equal(f.dialog.style.top,'250px');
 f.send(f.handle.querySelector('button'),'pointerdown');assert.equal(f.dialog.classList.contains('dialog-window-dragging'),false);
 f.send(f.handle,'pointerdown');assert.equal(f.dialog.classList.contains('dialog-window-dragging'),true);
 f.send(f.document,'pointermove',{clientX:2000,clientY:-100});f.send(f.document,'pointerup',{clientX:2000,clientY:-100});
 assert.equal(f.dialog.style.left,'788px');assert.equal(f.dialog.style.top,'12px');assert.equal(f.dialog.classList.contains('dialog-window-dragging'),false);f.control.dispose();
});
test('keyboard movement, resizing, closing and reopening keep the title bar reachable',()=>{
 const f=fixture();f.control.reset();f.send(f.handle,'keydown',{key:'ArrowRight'});assert.equal(f.dialog.style.left,'410px');f.send(f.handle,'keydown',{key:'Home'});assert.equal(f.dialog.style.left,'400px');
 f.send(f.handle,'pointerdown');f.window.innerWidth=600;f.window.innerHeight=500;f.window.dispatchEvent(new f.window.Event('resize'));assert.equal(f.dialog.style.left,'188px');
 f.control.stop();f.control.reset();assert.equal(f.dialog.style.left,'100px');assert.equal(f.dialog.style.top,'100px');f.control.dispose();f.send(f.handle,'pointerdown');assert.equal(f.dialog.classList.contains('dialog-window-dragging'),false);
});
test('pointer frames coalesce and cancellation flushes the final position without a dangling drag',()=>{
 const f=fixture(),frames=new Map();let next=0;
 f.window.requestAnimationFrame=callback=>{frames.set(++next,callback);return next};f.window.cancelAnimationFrame=id=>frames.delete(id);
 f.control.reset();f.send(f.handle,'pointerdown');f.send(f.document,'pointermove',{clientX:450,clientY:300});f.send(f.document,'pointermove',{clientX:480,clientY:320});assert.equal(frames.size,1);
 f.send(f.document,'pointercancel');assert.equal(frames.size,0);assert.equal(f.dialog.style.left,'470px');assert.equal(f.dialog.style.top,'310px');assert.equal(f.dialog.classList.contains('dialog-window-dragging'),false);f.control.dispose();
});
