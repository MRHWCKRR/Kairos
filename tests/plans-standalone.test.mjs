import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';
import {mountStandalonePlans} from '../plans-controller.js';
import {mountPlanUsage} from '../plan-usage.js';

const html=await readFile(new URL('../plans.html',import.meta.url),'utf8');
function setup(href='https://kairos.invalid/plans.html?return=settings') {
  const {document,window}=parseHTML(html),redirects=[];
  window.location={href,assign:url=>redirects.push(url),replace:url=>redirects.push(url)};
  window.localStorage={getItem:()=>JSON.stringify({appearance:{mode:'light',theme:'fairyfloss'}})};
  const auth={currentUser:null};let calls=0;
  const request=async()=>{calls++;return {access:{tier:'free',dailyLimit:100},usage:{used:2,remaining:98,bonusCredits:0},billing:{status:'none'},trial:true,plans:{free:{dailyLimit:10},plus:{dailyLimit:100}},offers:[],codesEnabled:true};};
  const controller=mountStandalonePlans({document,window,auth,request,mount:mountPlanUsage});
  return {document,window,auth,redirects,controller,calls:()=>calls};
}
test('standalone Plans contains no workspace shell and uses normal document scrolling',async()=>{
  const {document}=parseHTML(html);
  assert.equal(document.querySelector('.sidebar, .app-layout, .main-content'),null);
  assert.ok(document.body.classList.contains('standalone-plans'));
  const css=await readFile(new URL('../plan-usage.css',import.meta.url),'utf8');
  assert.match(css,/body\.standalone-plans\s*\{[^}]*height: auto;[^}]*overflow-y: auto/s);
  assert.doesNotMatch(document.getElementById('plans-page').textContent,/pre-launch|trial|at launch/i);
});
test('verified accounts load current allowances and return to the previous workspace',async()=>{
  const f=setup();f.auth.currentUser={uid:'verified',emailVerified:true};
  f.controller.onAuth(f.auth.currentUser);await new Promise(r=>setTimeout(r,0));
  assert.equal(f.document.getElementById('plans-page').hidden,false);
  assert.equal(f.calls(),1);
  assert.equal(f.document.getElementById('plan-free-limit').textContent,'100');
  assert.equal(f.document.getElementById('plan-plus-limit').textContent,'100');
  assert.ok(f.document.body.classList.contains('mode-light'));
  f.document.getElementById('plan-back-btn').click();
  assert.equal(f.redirects.at(-1),'app.html?page=settings');f.controller.destroy();
});
test('signed-out and unverified accounts cannot load billing, and return targets stay local',()=>{
  const f=setup('https://kairos.invalid/plans.html?return=https://example.com');
  f.controller.onAuth(null);assert.equal(f.redirects.at(-1),'login.html');
  f.controller.onAuth({uid:'unverified',emailVerified:false,email:'a+b@example.com'});
  assert.equal(f.calls(),0);assert.equal(f.document.getElementById('plans-page').hidden,true);
  assert.equal(f.redirects.at(-1),'verify-email.html?email=a%2Bb%40example.com');
  f.document.getElementById('plan-back-btn').click();assert.equal(f.redirects.at(-1),'app.html?page=dashboard');
  f.controller.destroy();
});
test('legacy Plans and checkout return links redirect before loading the workspace',async()=>{
  const source=await readFile(new URL('../app-bootstrap.js',import.meta.url),'utf8');
  for(const query of ['page=plans','billing=return','billing=canceled']) {
    let redirected='';const href='https://kairos.invalid/app.html?'+query;
    vm.runInNewContext(source,{URL,window:{},document:{readyState:'complete'},location:{href,replace:url=>redirected=url}});
    assert.equal(new URL(redirected).pathname,'/plans.html');
    if(query.startsWith('billing'))assert.equal(new URL(redirected).searchParams.get('billing'),query.split('=')[1]);
  }
});
