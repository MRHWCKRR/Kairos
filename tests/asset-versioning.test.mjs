import test from 'node:test';
import assert from 'node:assert/strict';
import {versionPublicAssets} from '../asset-versioning.js';

const files=()=>new Map([
 ['app.html','<script type="module" src="app.js?v=114"></script><link href="app.css?theme=dark&v=3#top" rel="stylesheet">'],
 ['app.js',"import './leaf.js?v=1'; import('./lazy.js'); const external='https://cdn.example/app.js?v=keep';"],
 ['leaf.js',"import './app.js?v=114'; export const value=1;"],
 ['lazy.js',"import './leaf.js';"],['app.css','body{color:white}']
]);
test('one deterministic content version covers cyclic imports, lazy entries and HTML',()=>{
 const input=files(),out=versionPublicAssets(input),again=versionPublicAssets(new Map([...input].reverse()));
 assert.match(out.version,/^[a-f0-9]{16}$/);assert.equal(again.version,out.version);
 assert.match(out.files.get('app.html'),new RegExp('app.js\\?v='+out.version));
 for(const name of ['app.js','leaf.js','lazy.js']) assert.match(out.files.get(name),new RegExp('\\.js\\?v='+out.version));
 assert.ok(out.files.get('app.js').includes("import('./lazy.js?v="+out.version+"')"));
 assert.ok(out.files.get('app.js').includes('https://cdn.example/app.js?v=keep'));
 assert.ok(out.files.get('app.html').includes('app.css?theme=dark&amp;v='+out.version+'#top'));
 assert.equal(input.get('leaf.js'),files().get('leaf.js'),'source inputs stay unchanged');
 assert.deepEqual(versionPublicAssets(out.files),out,'repeat preparation is idempotent');
});
test('a leaf edit invalidates HTML and every importing parent without manual bumps',()=>{
 const input=files(),first=versionPublicAssets(input);input.set('leaf.js',input.get('leaf.js').replace('value=1','value=2'));
 const next=versionPublicAssets(input);assert.notEqual(next.version,first.version);
 for(const file of ['app.html','app.js','lazy.js'])assert.notEqual(first.files.get(file),next.files.get(file));
 input.set('leaf.js',input.get('leaf.js').replace('v=114','v=999'));
 assert.equal(versionPublicAssets(input).version,next.version,'legacy counters do not affect release content');
});
test('only declared local assets change, including root paths and strings with HTML query escaping',()=>{
 const input=new Map([['app.html','<script src="/app.js?mode=ok&amp;v=2#start"></script><a href="docs.html">Docs</a>'],['app.js',"const x='./missing.js?v=2'; const api='/api/js';"],['docs.html','Docs']]);
 const out=versionPublicAssets(input);assert.ok(out.files.get('app.html').includes('/app.js?mode=ok&amp;v='+out.version+'#start'));
 assert.equal(out.files.get('app.js'),input.get('app.js'));assert.equal(out.files.get('docs.html'),'Docs');
});
test('inline JavaScript query strings keep JavaScript ampersands',()=>{
 const input=new Map([['app.html','<script>const href="app.js?mode=ok&other=yes";</script>'],['app.js','export const value=1;']]);
 const out=versionPublicAssets(input);
 assert.ok(out.files.get('app.html').includes('app.js?mode=ok&other=yes&v='+out.version));
});
