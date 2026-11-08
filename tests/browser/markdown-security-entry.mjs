const result=document.querySelector('#packaged-smoke-result'),root=document.querySelector('#ai-chat-messages');
const check=(condition,message)=>{if(!condition)throw Error(message);};
const wait=async condition=>{for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Markdown rendering did not settle.');};
function bubble(text){const row=document.createElement('div');row.className='ai-chat-bubble-row assistant';const content=document.createElement('div');content.className='ai-chat-bubble';content.textContent=text;row.append(content);root.append(row);return content;}
try{
 const {default:purify}=await import('@@PURIFY_URL@@');
 const [major,minor,patch]=purify.version.split('.').map(Number);
 check(major>3||major===3&&(minor>2||minor===2&&patch>=7),'The sanitizer must include the CVE-2025-15599 fix.');
 const safe=bubble('# Plan\n\n**Read** and [Docs](https://example.com/docs)\n\n- One\n- Two\n\n|Task|Minutes|\n|---|---|\n|Read|20|\n\n```js\nconst tag = "<script>";\n```');
 const unsafe=bubble('<img src="/missing-test-image" onerror="window.markdownUnexpectedExecution=true"><svg onload="window.markdownUnexpectedExecution=true"></svg><script>window.markdownUnexpectedExecution=true</script><a href="javascript:alert(1)">unsafe</a>');
 const empty=bubble('');
 await import('/ai-markdown.js');
 await wait(()=>safe.dataset.markdownRendered==='true'&&unsafe.dataset.markdownRendered==='true'&&empty.dataset.markdownRendered==='true');
 check(safe.querySelector('h1')?.textContent==='Plan'&&safe.querySelector('strong')?.textContent==='Read','Headings and emphasis must remain readable.');
 check(safe.querySelectorAll('li').length===2&&safe.querySelector('td')?.textContent==='Read','Lists and tables must survive sanitization.');
 check(safe.querySelector('pre code')?.textContent.includes('<script>'),'Code must remain literal text.');
 const link=safe.querySelector('a');check(link?.target==='_blank'&&link?.rel==='noopener noreferrer','External links need safe browsing attributes.');
 check(!unsafe.querySelector('script,svg,[onerror],[onload]')&&!unsafe.querySelector('a')?.hasAttribute('href'),'Executable HTML or URL survived sanitization.');
 check(!window.markdownUnexpectedExecution,'Sanitized content executed code.');
 const original=safe.innerHTML,later=bubble('**Later message**');
 await wait(()=>later.dataset.markdownRendered==='true');
 check(later.querySelector('strong')?.textContent==='Later message'&&safe.innerHTML===original,'New messages must render without rewriting existing messages.');
 result.dataset.result='passed';result.textContent='Real CDN sanitizer '+purify.version+': Markdown, XSS filtering, links, empty messages and observer checks passed.';
}catch(error){result.dataset.result='failed';result.textContent=error.message;}
