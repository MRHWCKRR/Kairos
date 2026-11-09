// @ts-check
import {savePlannerEdits} from '../../plan-store.js';

/** @type {import('../../app-planner-persistence.js').PlannerState} */
const state={boards:[],dayInsights:{},scheduleEvents:[],calendarSources:[]};
savePlannerEdits('plan','owner',state,state,{requireExisting:true,recoveryAttempt:{base:state,local:state}}).then(saved=>saved.boards.length);
// @ts-expect-error plan IDs must be strings
savePlannerEdits(123,'owner',state,state);
// @ts-expect-error owner IDs must be strings
savePlannerEdits('plan',123,state,state);
// @ts-expect-error submitted planner state must contain every normalized collection
savePlannerEdits('plan','owner',state,{boards:[]});
// @ts-expect-error uncertain attempts must retain both baseline and submitted state
savePlannerEdits('plan','owner',state,state,{recoveryAttempt:{base:state}});
// @ts-expect-error save options require a boolean existing-planner guard
savePlannerEdits('plan','owner',state,state,{requireExisting:'yes'});
