import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const source=await readFile(new URL('../landing.js',import.meta.url),'utf8');
function fixture(){
 const {document,window}=parseHTML('<html><body><nav class="navbar" id="navbar"><a class="logo" href="index.html">Kairos</a><button class="menu-toggle" aria-expanded="false">Menu</button><div class="nav-links" id="public-navigation"><a href="#features">Features</a></div></nav><section id="testimonials"><article>Original feedback</article></section></body></html>');
 vm.runInNewContext(source,{document,window,console});document.dispatchEvent(new window.Event('DOMContentLoaded'));
 return {document,window,button:document.querySelector('button'),links:document.querySelector('.nav-links')};
}
test('public navigation closes on Escape and returns focus to its opener',()=>{
 const f=fixture();let focused=false;f.button.focus=()=>{focused=true};f.button.click();assert.equal(f.button.getAttribute('aria-expanded'),'true');
 const event=new f.window.Event('keydown');event.key='Escape';f.document.dispatchEvent(event);
 assert.equal(f.button.getAttribute('aria-expanded'),'false');assert.equal(f.links.classList.contains('open'),false);assert.equal(focused,true);
});
test('following a navigation link resets menu state',()=>{
 const f=fixture();f.button.click();f.links.querySelector('a').click();
 assert.equal(f.button.getAttribute('aria-expanded'),'false');assert.equal(f.links.classList.contains('open'),false);
});
test('public navigation adds no promotions or duplicate feedback and requires no storage access',()=>{
 const f=fixture();assert.equal(f.document.querySelectorAll('#testimonials article').length,1);
 assert.equal(f.document.querySelector('.offer-float,.cursor-spotlight'),null);
});
