function stripFences(value){
  return String(value??'')
    .replace(/^\uFEFF/,'')
    .replace(/```(?:json|javascript|js)?/gi,'')
    .replace(/```/g,'')
    .trim();
}

function extractBalancedObject(text){
  const start=text.indexOf('{');
  if(start<0)return null;
  let depth=0,inString=false,quote='',escaped=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(inString){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){inString=false;quote=''}
      continue;
    }
    if(ch==='"'||ch==="'"){inString=true;quote=ch;continue}
    if(ch==='{')depth++;
    if(ch==='}'){
      depth--;
      if(depth===0)return text.slice(start,i+1);
    }
  }
  return null;
}

function normalizeLooseJson(value){
  let text=String(value??'')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .trim();

  text=text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g,'$1"$2"$3');
  text=text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g,(_,inner)=>{
    const normalized=inner.replace(/\\'/g,"'").replace(/"/g,'\\"');
    return `"${normalized}"`;
  });
  text=text.replace(/("(?:[^"\\]|\\.)+")\s+(?=[\[{])/g,'$1: ');
  text=text.replace(/,\s*([}\]])/g,'$1');
  return text;
}

export function parseScheduleAiPayload(raw){
  const cleaned=stripFences(raw);
  const candidates=[cleaned,extractBalancedObject(cleaned)].filter(Boolean);
  for(const candidate of candidates){
    try{return JSON.parse(candidate)}catch{}
    try{return JSON.parse(normalizeLooseJson(candidate))}catch{}
  }
  throw new Error('planner-format');
}
