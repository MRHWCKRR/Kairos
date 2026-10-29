// @ts-check
import {buildNativeEventChange} from '../../native-event-commands.js';
import {normalizeRecurrence,generateTaskOccurrences} from '../../recurrence-utils.js';
import {assertPlannerValue} from '../../planner-value-contract.js';
/** @type {import('../../planner-contracts.js').NativeEventWrite} */
const event={id:'e',title:'Class',category:'other',date:'2026-10-29',start:'09:00',end:'10:00',allDay:false,transparent:false,reminderMinutes:30};
buildNativeEventChange({scheduleEvents:[]},{eventId:'e',event},'Australia/Brisbane');
// @ts-expect-error native event fields must include category
buildNativeEventChange({}, {eventId:'e',event:{id:'e',title:'Class',date:'2026-10-29',start:'09:00',end:'10:00',allDay:false,transparent:false}},'UTC');
// @ts-expect-error a dated native event cannot also specify a weekly day
buildNativeEventChange({}, {eventId:'e',event:{...event,day:1}},'UTC');
// @ts-expect-error custom reminders use the supported discrete values
buildNativeEventChange({}, {eventId:'e',event:{...event,reminderMinutes:17}},'UTC');
normalizeRecurrence({enabled:true,frequency:'weekly',weekdays:[1,3],endType:'count',count:5});
// @ts-expect-error weekdays range from Sunday 0 to Saturday 6
normalizeRecurrence({enabled:true,frequency:'weekly',weekdays:[7]});
// @ts-expect-error a count-bounded rule requires count
normalizeRecurrence({enabled:true,endType:'count'});
// @ts-expect-error recurrence intervals must be numeric
generateTaskOccurrences({id:'t',recurrence:{interval:'2'}},'2026-10-29','2026-11-01');
/** @type {unknown} */
const received={boards:[]};assertPlannerValue(received);
/** @type {import('../../planner-contracts.js').PlannerValue} */
const safe=received;
void safe;
