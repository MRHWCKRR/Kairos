const DAY=86400000;
export function usageDay(time=Date.now()) {
  return new Date(time+10*3600000).toISOString().slice(0,10);
}
const validCount=value=>Number.isSafeInteger(value)&&value>=0;
export function savedMessageCount(data={}) {
  const chats=Array.isArray(data.aiWorkspace?.chats)?data.aiWorkspace.chats:[{messages:data.aiChatHistory}];
  // New messages belong to the durable event ledger, even while a write is
  // pending on another device. Only legacy messages seed its initial total.
  return chats.reduce((sum,chat)=>sum+(Array.isArray(chat.messages)?chat.messages.filter(m=>m?.role==='user'&&typeof m.content==='string'&&m.notice!==true&&typeof m.usageId!=='string').length:0),0);
}
export function readMessageUsage(data={},time=Date.now()) {
  const raw=data.aiMessageStats;
  if(raw?.version!==1 || !validCount(raw.totalSent))return {version:1,totalSent:savedMessageCount(data),daily:{},startedDay:null,recentIds:[]};
  const cutoff=new Date(Date.parse(usageDay(time)+'T12:00:00Z')-364*DAY).toISOString().slice(0,10);
  const daily=Object.fromEntries(Object.entries(raw.daily||{}).filter(([day,count])=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&day>=cutoff&&day<=usageDay(time)&&validCount(count)));
  return {version:1,totalSent:raw.totalSent,daily,startedDay:/^\d{4}-\d{2}-\d{2}$/.test(raw.startedDay||'')?raw.startedDay:null,recentIds:Array.isArray(raw.recentIds)?raw.recentIds.filter(id=>typeof id==='string').slice(-512):[]};
}
export function addSentMessage(data,time=Date.now(),baseline,event) {
  const state=readMessageUsage(data,time),day=usageDay(event?.time??time);
  if(event?.id && state.recentIds.includes(event.id))return state;
  if(!(data.aiMessageStats?.version===1&&validCount(data.aiMessageStats.totalSent)) && validCount(baseline))state.totalSent=baseline;
  if(event?.initialize)return state;
  state.totalSent+=1;
  const cutoff=new Date(Date.parse(usageDay(time)+'T12:00:00Z')-364*DAY).toISOString().slice(0,10);
  if(day>=cutoff && day<=usageDay(time))state.daily[day]=(state.daily[day]||0)+1;
  if(!state.startedDay || day<state.startedDay)state.startedDay=day;
  // Bound retry receipts so statistics cannot exhaust the profile document.
  if(event?.id)state.recentIds=[...state.recentIds,event.id].slice(-512);
  return state;
}
export function createMessageRecorder({getUser,transact,document,clock=Date.now}) {
  return async (uid,baseline,event)=>{
    const time=clock(),ref=document(uid);
    await transact(async transaction=>{
      if(getUser()?.uid!==uid || !getUser().emailVerified)return;
      const snapshot=await transaction.get(ref);
      if(getUser()?.uid!==uid || !getUser().emailVerified)return;
      // A pending activity write must not recreate a deleted profile.
      if(!snapshot.exists())throw Error('Account data is unavailable.');
      const data=snapshot.data();
      if(event?.initialize && data.aiMessageStats?.version===1&&validCount(data.aiMessageStats.totalSent))return;
      const next=addSentMessage(data,time,baseline,event);
      transaction.set(ref,{aiMessageStats:next},{mergeFields:['aiMessageStats']});
    });
  };
}
export function activityDays(daily={},time=Date.now()) {
  const end=Date.parse(usageDay(time)+'T12:00:00Z'),start=end-364*DAY;
  // Align the first column to Sunday, like a contribution calendar.
  const first=start-new Date(start).getUTCDay()*DAY;
  return Array.from({length:Math.round((end-first)/DAY)+1},(_,index)=>{
    const day=new Date(first+index*DAY).toISOString().slice(0,10),count=validCount(daily[day])?daily[day]:0;
    return {day,count,padding:first+index*DAY<start,level:count===0?0:count<=2?1:count<=5?2:count<=10?3:4};
  });
}
