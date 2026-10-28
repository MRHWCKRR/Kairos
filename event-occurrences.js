// Weekly native event identity is the original date, even after a move.
export const validEventDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1900-01-01'&&value<='2200-12-30'&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
export const isWeeklyNativeEvent=event=>!!event&&event.date==null&&!event.readOnly&&!event.calendarSourceId&&event.day!==null&&event.day!==''&&Number.isInteger(Number(event.day))&&Number(event.day)>=0&&Number(event.day)<=6;
export const withinEventDates=(event,date)=>(event.startDate==null||validEventDate(event.startDate)&&date>=event.startDate)&&(event.endDate==null||validEventDate(event.endDate)&&date<=event.endDate);
export const isEventOccurrenceDate=(event,date)=>isWeeklyNativeEvent(event)&&validEventDate(date)&&new Date(date+'T12:00:00Z').getUTCDay()===Number(event.day)&&withinEventDates(event,date);
export function eventOccurrence(event,date,{includeSkipped=false,includeInactive=false}={}){
 if(!isEventOccurrenceDate(includeInactive?{...event,startDate:null,endDate:null}:event,date))return null;
 const exception=Object.hasOwn(event.exceptions||{},date)?event.exceptions[date]:null;
 if(exception?.skipped===true&&!includeSkipped)return null;
 const override=exception?.skipped===true?null:exception?.override;
 const effective={...event,...(override&&validEventDate(override.date)?override:{}),id:event.id,date:override&&validEventDate(override.date)?override.date:date,occurrenceDate:date,recurringEvent:true};
 delete effective.startDate;delete effective.endDate;delete effective.day;delete effective.exceptions;
 if(exception?.skipped===true)effective.skippedOccurrence=true;
 return effective;
}
export function eventOccurrencesForDate(event,date){
 if(!event||!validEventDate(date))return [];
 if(!isWeeklyNativeEvent(event))return (event.date!=null?event.date===date:Number(event.day)===new Date(date+'T12:00:00Z').getUTCDay())?[event]:[];
 const originals=new Set([date,...Object.keys(event.exceptions||{})]),out=[];
 for(const original of originals){const effective=eventOccurrence(event,original);if(effective?.date===date)out.push(effective);}
 return out;
}
