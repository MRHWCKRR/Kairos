// Project fixed commitments onto one calendar date. A dated event never falls
// back to its weekday, even if legacy metadata still includes a day field.
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const minutes=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
const priorDate=value=>new Date(Date.parse(value+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function eventSegmentsForDate(events,date,{busyOnly=false}={}){
 if(!validDate(date))return [];
 const day=new Date(date+'T12:00:00Z').getUTCDay(),previous=(day+6)%7,previousDate=priorDate(date),out=[];
 for(const event of events||[]){
  if(!event||event.archived||busyOnly&&event.transparent===true)continue;
  const start=minutes(event.start),end=minutes(event.end);if(start===null||end===null)continue;
  const dated=event.date!==undefined&&event.date!==null;
  if(dated&&!validDate(event.date))continue;
  const onDate=dated?event.date===date:event.day!==null&&event.day!==''&&Number.isInteger(Number(event.day))&&Number(event.day)===day;
  const beforeDate=dated?event.date===previousDate:event.day!==null&&event.day!==''&&Number.isInteger(Number(event.day))&&Number(event.day)===previous;
  if(onDate){
   out.push({event,startMin:start,endMin:end>start?end:1440,continued:false});
  }
  if(beforeDate&&end<=start&&end>0)out.push({event,startMin:0,endMin:end,continued:true});
 }
 return out;
}
