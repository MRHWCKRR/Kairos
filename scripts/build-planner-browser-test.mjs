import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const result=await build({entryPoints:[path.join(root,'tests/browser/planner-workflow-entry.mjs')],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'versioned-modules',setup(api){api.onResolve({filter:/[.]js[?]v=/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0])}));}}]});
const css=['app.css','task-capture.css','dialog-window.css','today-view.css','calendar-import.css','native-event-editor.css','ai-workspace.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kairos planner workflow regression</title><style>'+css+'\nbody{display:block;padding:36px;font-family:Inter,system-ui,sans-serif}main{max-width:1120px;margin:auto}.qa-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.qa-header h1{font-size:1.2rem}.qa-header p{color:var(--text-muted);font-size:.85rem}#browser-test-result{margin:20px 0;color:var(--text-muted);font-size:.85rem}.today-view{min-width:0}.qa-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(250px,1fr);gap:48px}.qa-support{border-left:1px solid var(--border-subtle);padding-left:28px}.qa-support h3{font-size:1rem;margin:24px 0 12px}@media(max-width:900px){.qa-grid{grid-template-columns:1fr}.qa-support{border:0;padding:0}}</style></head><body><main><header class="qa-header"><div><h1>Kairos</h1><p>Planner workflow regression · isolated test data</p></div><button class="action-btn" data-run-browser-test>Run browser checks</button></header><div class="qa-grid"><section id="today"></section><aside class="qa-support"><h3>AI changes</h3><div id="ai-undo"></div><h3>Archive</h3><div id="archive"></div><p id="opened"></p></aside></div><p id="browser-test-result" data-result="pending" role="status">Ready to check capture, completion, retry and recovery.</p></main><script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></body></html>';
const directory=path.join(root,'.superpowers','browser-workflows');fs.mkdirSync(directory,{recursive:true});
const output=path.join(directory,'planner-workflows.html');fs.writeFileSync(output,html);console.log(output);

