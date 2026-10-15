import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDialogs} from '../ui-dialogs.js';
import {createAuthFeedback} from '../auth-feedback.js';
import {enhanceSelects} from '../ui-selects.js';
const dom=html=>parseHTML('<html><head></head><body>'+html+'</body></html>');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('confirmation cancellation is false; queued prompt escapes content and preserves its value',async()=>{
 const {document,window}=dom('<button id="origin">Edit</button>');const ui=createDialogs({document,window});
 const confirmation=ui.confirm('Delete <script>bad()</script>?');const prompt=ui.prompt('Rename','original');await tick();
 assert.equal(document.querySelectorAll('dialog').length,1);assert.equal(document.querySelector('dialog script'),null);
 document.querySelector('button[type="button"]').click();assert.equal(await confirmation,false);await tick();
 assert.equal(document.querySelector('dialog input').value,'original');document.querySelector('dialog input').value='New name';document.querySelector('dialog form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(await prompt,'New name');assert.equal(document.querySelector('dialog'),null);
});
test('Escape cancels prompt and confirmation; empty prompt does not submit',async()=>{
 const {document,window}=dom('');const ui=createDialogs({document,window});const pending=ui.prompt('Name');await tick();
 document.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));assert.equal(document.querySelector('.kairos-dialog-error').hidden,false);
 const event=new window.Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Escape'});document.querySelector('dialog').dispatchEvent(event);assert.equal(await pending,null);
});
test('auth feedback uses text, links invalid fields, and clears on edit',()=>{
 const {document,window}=dom('<div class="login-box"><input id="email" aria-describedby="hint"><input id="password"><div class="social-buttons"></div></div>');const feedback=createAuthFeedback(document);
 feedback('<img src=x>',{fields:['password']});assert.equal(document.querySelector('#auth-status img'),null);assert.equal(document.querySelector('#password').getAttribute('aria-invalid'),'true');assert.equal(document.querySelector('#email').getAttribute('aria-describedby'),'hint');document.querySelector('#password').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(document.querySelector('#auth-status').hidden,true);assert.equal(document.querySelector('#password').hasAttribute('aria-invalid'),false);
});
test('select enhancer preserves source form field and disabled state, cleans up',()=>{
 const {document,window}=dom('<form><label for="choice">Priority</label><select id="choice" name="priority" disabled><option value="low">Low</option><option value="high">High</option></select></form>');
 const controls=enhanceSelects({document,window});const select=document.querySelector('select'),button=document.querySelector('.kairos-select button');assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-label'),'Priority');assert.equal(select.name,'priority');select.disabled=false;controls.refresh();assert.equal(button.disabled,false);controls.destroy();assert.equal(document.querySelector('select'),select);assert.equal(document.querySelector('.kairos-select'),null);assert.equal(select.hasAttribute('aria-hidden'),false);
});
test('dropdown keyboard navigation skips disabled options, Escape cancels and Enter emits native change',()=>{
 const {document,window}=dom('<select><option value="low">Low</option><option disabled value="medium">Medium</option><option value="high">High</option></select>');const select=document.querySelector('select');let index=0;
 Object.defineProperty(select,'selectedIndex',{get:()=>index,set:value=>{index=value;Array.from(select.querySelectorAll('option')).forEach((option,i)=>option.selected=i===index);}});Object.defineProperty(select,'value',{get:()=>select.querySelectorAll('option')[index]?.getAttribute('value')});select.selectedIndex=0;
 window.HTMLElement.prototype.getBoundingClientRect=()=>({left:30,top:30,bottom:65,width:200,height:100});
 const controls=enhanceSelects({document,window});const button=document.querySelector('.kairos-select-trigger');let changes=0;select.addEventListener('change',()=>changes++);
 function key(key){const event=new window.Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:key});button.dispatchEvent(event);}
 key('ArrowDown');key('ArrowDown');assert.equal(select.value,'low');assert.match(button.getAttribute('aria-activedescendant'),/-2$/);key('Escape');assert.equal(select.value,'low');assert.equal(changes,0);
 key('ArrowDown');key('ArrowDown');key('Enter');assert.equal(select.value,'high');assert.equal(changes,1);assert.equal(button.textContent,'High');
 key('l');key('Tab');assert.equal(select.value,'low');assert.equal(changes,2);controls.destroy();
});
