import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageRenderCache} from '../page-render-cache.js';
test('hidden updates coalesce and clean revisits keep the existing DOM',()=>{
  const idle=[];let active='home-page',renders=0;
  const cache=createPageRenderCache({isActive:page=>page===active,scheduleIdle:fn=>idle.push(fn)});
  function render(){if(cache.defer('tasks-page',render))return;renders++;}
  render();render();render();assert.equal(renders,0);assert.equal(idle.length,1);
  idle.shift()();assert.equal(renders,1);
  active='tasks-page';cache.activate('tasks-page');cache.activate('tasks-page');assert.equal(renders,1);
});
test('navigation flushes pending data immediately and keeps multiple page renderers',()=>{
  const idle=[];let active='home-page',badges=0,goals=0;
  const cache=createPageRenderCache({isActive:page=>page===active,scheduleIdle:fn=>idle.push(fn)});
  function badge(){if(cache.defer('achievements-page',badge))return;badges++;}
  function goal(){if(cache.defer('achievements-page',goal))return;goals++;}
  badge();goal();badge();active='achievements-page';cache.activate(active);
  assert.equal(badges,1);assert.equal(goals,1);idle.shift()();assert.equal(badges,1);
});
