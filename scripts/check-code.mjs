import {build} from 'esbuild';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function lintSources({rootDir,entries}) {
    await build({absWorkingDir:rootDir,entryPoints:entries,bundle:true,write:false,outdir:'lint-output',
        platform:'node',format:'esm',target:'es2022',packages:'external',logLevel:'silent',
        plugins:[{name:'browser-imports',setup(api){
            api.onResolve({filter:/^https?:\/\//},()=>({external:true}));
            api.onResolve({filter:/^\..*\.js\?v=/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0])}));
        }}]});
}
async function scriptsBelow(rootDir,directory) {
    return (await readdir(path.join(rootDir,directory),{withFileTypes:true})).flatMap(entry=>{
        const name=path.posix.join(directory,entry.name);
        return entry.isDirectory()?[]:/\.(?:m?js)$/.test(name)?[name]:[];
    });
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
    const rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const manifest=JSON.parse(await readFile(path.join(rootDir,'cloudflare/public-assets.json'),'utf8'));
    const entries=[...manifest.files.filter(name=>name.endsWith('.js')),...await scriptsBelow(rootDir,'server'),...await scriptsBelow(rootDir,'api'),...await scriptsBelow(rootDir,'cloudflare')];
    try {await lintSources({rootDir,entries});console.log(`Checked syntax and module exports for ${entries.length} application entrypoints.`);}
    catch(error){for(const detail of error.errors??[])console.error(`${detail.location?.file??''}:${detail.location?.line??''} ${detail.text}`);process.exitCode=1;}
}
