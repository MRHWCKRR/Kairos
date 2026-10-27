// Deliberately limited to published ICS endpoints, never a generic URL proxy.
// Feed capability tokens stay in the URL and must not be logged or sent to AI.
export function normaliseCalendarFeedUrl(value){
 const invalid=()=>{throw Error('Use a published Google, Outlook or iCloud calendar link, or upload an .ics file.');};
 if(typeof value!=='string'||value.length>2048)return invalid();
 const raw=value.trim().replace(/^webcal:/i,'https:');
 if(!/^https:\/\//i.test(raw)||/[\u0000-\u0020\u007f\\#]/.test(raw)||/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw))return invalid();
 const authority=/^https:\/\/([^/?#]+)/i.exec(raw)?.[1];
 if(!authority||authority.includes('@')||authority.includes(':')||/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw)||/%2e/i.test(raw))return invalid();
 let url;try{url=new URL(raw);}catch{return invalid();}
 if(url.username||url.password||url.port||url.search||url.hash)return invalid();
 const host=url.hostname,path=url.pathname;
 const google=host==='calendar.google.com'&&/^\/calendar\/ical\/[A-Za-z0-9_@%+.-]+\/(?:public|private-[A-Za-z0-9_-]+)\/basic\.ics$/.test(path);
 const outlook=['outlook.live.com','outlook.office365.com'].includes(host)&&/^\/owa\/calendar\/(?:[A-Za-z0-9_~%+.@-]+\/){1,3}calendar\.ics$/.test(path);
 const icloud=/^p\d{1,3}-caldav\.icloud\.com$/.test(host)&&/^\/published\/\d+\/[A-Za-z0-9_-]+$/.test(path);
 if(!google&&!outlook&&!icloud)return invalid();
 return url.href;
}
