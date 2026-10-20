import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {transitionGettingStarted} from '../getting-started-model.js';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('    async function loadUserProgressFromFirestore('),app.indexOf('    async function saveAchievementsToFirestore('));
function fixture(data,{read,update}={}){
 const calls=[],c=vm.createContext({auth:{currentUser:{uid:'one'}},db:{},doc:(_db,_collection,uid)=>uid,getDoc:async()=>{await read?.();return {exists:()=>true,data:()=>data}},
  achievementsData:{},focusData:{},defaultAchievementsData:()=>({unlocked:{}}),defaultFocusData:()=>({}),deepMerge:(base,value)=>({...base,...value}),gettingStarted:{hydrate:value=>calls.push(['hydrate',value])},guideStore:{update:async(uid,action)=>{calls.push(['update',uid,action]);await update?.();return transitionGettingStarted(data,action,{now:42})}},acceptGuideCompletion:(result,uid)=>calls.push(['complete',uid,result]),console:{error(){}},
  ...Object.fromEntries(['renderAchievementsPage','renderGoalSelects','renderMiniAchievementsWidget','renderFocusTimerWidget','renderStatisticsPage','markInitialLoadComplete'].map(name=>[name,()=>calls.push([name])]))});
 vm.runInContext(source,c);return {c,calls,load:()=>c.loadUserProgressFromFirestore({uid:'one'})};
}
test('real progress loader defers Welcome through profile setup and an active guide',async()=>{
 for(const data of [{},{focusData:{}},{onboardingCompleted:false},{onboardingCompleted:true,gettingStarted:{version:2,status:'active',step:0}}]){
  const f=fixture(data);await f.load();assert.equal(f.calls.some(([type])=>type==='update'),false);assert.deepEqual(Object.keys(f.c.achievementsData.unlocked),[]);
 }
});
test('real loader reconciles a recreated account with initialized focus data after skipping',async()=>{
 const f=fixture({onboardingCompleted:true,focusData:{totalSeconds:0},gettingStarted:{version:2,status:'skipped',step:0},achievements:{unlocked:{}}});await f.load();
 const complete=f.calls.find(([type])=>type==='complete');assert.equal(complete[1],'one');assert.deepEqual(complete[2].awardedIds,['misc_welcome']);assert.equal(complete[2].achievements.unlocked.misc_welcome,42);
});
test('late account reads and grant results cannot hydrate or complete another account',async()=>{
 let f;f=fixture({onboardingCompleted:true},{read:()=>{f.c.auth.currentUser={uid:'two'}}});await f.load();assert.equal(f.calls.length,0);
 f=fixture({onboardingCompleted:true},{update:()=>{f.c.auth.currentUser={uid:'two'}}});await f.load();assert.equal(f.calls.some(([type])=>type==='complete'||type==='renderAchievementsPage'),false);
});
test('confirmed completion feedback only shows newly awarded definitions for the current UID',()=>{
 const feedback=app.slice(app.indexOf('    function acceptGuideCompletion('),app.indexOf('    gettingStarted=mountGettingStarted(')),shown=[],c=vm.createContext({guideOwner:()=> 'one',achievementsData:{},deepMerge:(base,value)=>({...base,...value}),defaultAchievementsData:()=>({unlocked:{}}),ACHIEVEMENTS:[{id:'misc_welcome'}],showAchievementToast:def=>shown.push(def.id),renderAchievementsPage(){},renderMiniAchievementsWidget(){}});
 vm.runInContext(feedback,c);c.acceptGuideCompletion({achievements:{unlocked:{misc_welcome:42}},awardedIds:['misc_welcome']},'two');assert.deepEqual(shown,[]);
 c.acceptGuideCompletion({achievements:{unlocked:{misc_welcome:42}},awardedIds:['misc_welcome']},'one');assert.deepEqual(shown,['misc_welcome']);c.acceptGuideCompletion({achievements:{unlocked:{misc_welcome:42}},awardedIds:[]},'one');assert.deepEqual(shown,['misc_welcome']);
});
