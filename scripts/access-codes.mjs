import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const origins=new Set(['https://kairos-web-preview.kirosapp.workers.dev','https://kairos-web.kirosapp.workers.dev','http://localhost:8787']);
export async function runAccessCodeCommand({args,session,fetchImpl=fetch}) {
  if(!session || !origins.has(session.origin) || typeof session.idToken!=='string' || typeof session.appCheckToken!=='string') throw Error('Owner session required');
  const [command,...rest]=args;
  if(!['issue','revoke'].includes(command) || rest.length%2) throw Error('Use issue or revoke with named options');
  const values={};
  for(let index=0;index<rest.length;index+=2) {
    if(!['--months','--uses','--expires','--uid','--feature','--code'].includes(rest[index]) || values[rest[index]]!==undefined) throw Error('Invalid code option');
    values[rest[index]]=rest[index+1];
  }
  const body=command==='revoke'?{code:values['--code']}:{
    kind:values['--feature']?'feature':'plan',planId:'plus',featureId:values['--feature'],
    months:Number(values['--months']||1),maxUses:Number(values['--uses']||1),
    redeemBefore:values['--expires']?Date.parse(values['--expires']):Date.now()+30*86400000,
    intendedUid:values['--uid']||null
  };
  const response=await fetchImpl(session.origin+'/api/billing/codes/'+command,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.idToken,'X-Firebase-AppCheck':session.appCheckToken},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw Error('Code operation failed ('+response.status+'); check owner login and configuration.');
  const result=await response.json();
  return command==='issue'?{code:result.code}:{revoked:result.revoked===true};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2),index=args.indexOf('--session-file');
    if(index<0 || !args[index+1]) throw Error('A private --session-file is required.');
    const session=JSON.parse(await readFile(args[index+1],'utf8'));args.splice(index,2);
    const result=await runAccessCodeCommand({args,session});
    console.log(result.code||'Code revoked.');
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
