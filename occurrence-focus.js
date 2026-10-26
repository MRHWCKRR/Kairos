import {generateTaskOccurrences,normalizeRecurrence} from './recurrence-utils.js?v=14';
import {stableStringify} from './plan-merge.js?v=1';

export function validFocusDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
export function focusRecurrenceSignature(task){const rule=normalizeRecurrence(task,task.date);delete rule.exceptions;return stableStringify(rule)}
export function focusOccurrence(task,date){
 if(!task?.recurrence?.enabled||!validFocusDate(date))return null;
 const occurrence=generateTaskOccurrences(task,date,date,{today:date})[0];
 if(!occurrence||['skipped','deleted'].includes(occurrence.status))return null;
 return {...occurrence,task:{...occurrence.task,estimatedMinutes:occurrence.durationMinutes,completed:occurrence.status==='completed'}};
}
export function setOccurrenceFocus(task,date,patch){
 const existing=task.recurrence?.exceptions?.[date]||{};
 task.recurrence={...task.recurrence,exceptions:{...task.recurrence?.exceptions,[date]:{...existing,...patch}}};
}
