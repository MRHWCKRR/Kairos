export type PlannerValue = null | boolean | number | string | Date | PlannerValue[] | PlannerRecord;
export interface PlannerRecord { [field:string]: PlannerValue; }
export type EventReminder = null | 'default' | 5 | 15 | 30 | 60;
interface NativeEventFields {
 id:string; title:string; category:string; start:string; end:string;
 allDay:boolean; transparent:boolean; reminderMinutes?:EventReminder;
}
export type NativeEventWrite = NativeEventFields & (
 {date:string;day?:never;startDate?:never;endDate?:never;intervalWeeks?:never;anchorDate?:never} |
 {day:0|1|2|3|4|5|6;date?:never;startDate?:string|null;endDate?:string|null;intervalWeeks?:1|2;anchorDate?:string|null}
);
export interface PlannerState {
 boards?:PlannerRecord[]; dayInsights?:PlannerRecord;
 scheduleEvents?:Array<NativeEventWrite|PlannerRecord>; calendarSources?:PlannerRecord[];
}
export interface NativeEventRequest {
 eventId:string;event:NativeEventWrite|null;occurrenceDate?:string;
 occurrenceOperation?:'update'|'skip'|'restore';
}
interface RecurrenceFields {
 enabled?:boolean; frequency?:'daily'|'weekly'|'monthly'|'yearly'; interval?:number;
 weekdays?:Array<0|1|2|3|4|5|6>; startDate?:string|null;
 mode?:'fixed'|'flexible'; monthlyMode?:'date'|'weekdayPosition'|null;
 monthDay?:number|null; weekdayPosition?:'first'|'second'|'third'|'fourth'|'last'|null;
 weekday?:number|null; month?:number|null; exceptions?:Record<string,PlannerRecord>;
}
export type RecurrenceInput = RecurrenceFields & (
 {endType?:'never';endDate?:null;count?:null} |
 {endType:'date';endDate:string;count?:null} |
 {endType:'count';count:number;endDate?:null}
);
export interface RecurringTask {
 id:string;title?:string;date?:string|null;startTime?:string|null;endTime?:string|null;
 estimatedMinutes?:number;recurrence?:RecurrenceInput;
}
