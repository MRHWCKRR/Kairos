const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
async function verifyBillingRules({mutant=false}={}) {
  const root=process.env.FIREBASE_TOOLS_LIB;
  if(!root)throw Error('Set FIREBASE_TOOLS_LIB to your authenticated Firebase CLI lib directory.');
  const auth=require(path.join(root,'auth.js'));
  const {requireAuth}=require(path.join(root,'requireAuth.js'));
  const {Client}=require(path.join(root,'apiv2.js'));
  const project='kairos-1a',account=auth.getGlobalDefaultAccount();
  if(account?.user?.email!=='dygcddydhrc@gmail.com')throw Error('Expected Kairos owner Firebase account.');
  await requireAuth({project,...account});
  const api=new Client({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1',auth:true});
  const release=await api.get('/projects/'+project+'/releases/cloud.firestore');
  const ruleset=await api.get('/'+release.body.rulesetName);
  const files=ruleset.body.source.files;
  const normalize=text=>text.replace(/\r\n/g,'\n').trim();
  const saved=await fs.readFile(path.join(__dirname,'../docs/firestore-rules.snapshot.rules'),'utf8');
  if(files.length!==1 || normalize(files[0].content)!==normalize(saved))throw Error('Deployed rules differ from reviewed snapshot. Capture and review them again.');
  const content=mutant?files[0].content.replace('match /databases/{database}/documents {','match /databases/{database}/documents {\nmatch /{any=**} { allow read, write: if true; }'):files[0].content;
  const collections=['kairosBillingAccounts','kairosBillingCustomers','kairosBillingEntitlements','kairosBillingEvents','kairosBillingLocks','kairosCreditAccounts','kairosCreditGrants','kairosAccessCodes','kairosCodeRedemptions','kairosAiUsage'];
  const cases=[];
  function add(collection,id,method,uid,expectation,data={}) {
    cases.push({expectation,request:{path:'/databases/(default)/documents/'+collection+'/'+id,method,auth:uid?{uid,token:{email_verified:'true'}}:null,
      ...(method==='create'||method==='update'?{resource:{data}}:{})},resource:{data},expressionReportLevel:'NONE'});
  }
  for(const collection of collections)for(const uid of [null,'rules-owner','rules-other'])for(const method of ['get','list','create','update','delete'])add(collection,'preview-fixture',method,uid,'DENY',{userID:uid});
  for(const method of ['get','create','update','delete'])add('users','rules-owner',method,'rules-owner','ALLOW');
  add('users','rules-owner','get','rules-other','DENY');
  add('study_plans','fixture','get','rules-owner','ALLOW',{userID:'rules-owner'});
  add('study_plans','fixture','update','rules-owner','ALLOW',{userID:'rules-owner'});
  add('study_plans','fixture','get','rules-other','DENY',{userID:'rules-owner'});
  let passed=0;
  for(let offset=0;offset<cases.length;offset+=40) {
    const batch=cases.slice(offset,offset+40);
    const result=await api.post('/projects/'+project+':test',{source:{files:[{name:files[0].name,content}]},testSuite:{testCases:batch}},{skipLog:{body:true}});
    const results=result.body.testResults||[];
    if(results.length!==batch.length || result.body.issues?.some(issue=>issue.severity==='ERROR'))throw Error('Rules engine did not execute all cases.');
    for(let index=0;index<results.length;index++) {
      if(results[index].state!=='SUCCESS')throw Error('Rules permission regression: '+batch[index].request.path+' '+batch[index].request.method+' expected '+batch[index].expectation);
      passed++;
    }
  }
  return {passed,sourceHash:crypto.createHash('sha256').update(normalize(saved)).digest('hex'),ruleset:release.body.rulesetName};
}
module.exports={verifyBillingRules};
if(require.main===module)verifyBillingRules({mutant:process.argv.includes('--mutant')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
