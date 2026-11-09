// @ts-check
import {createPlannerPersistence} from '../../app-planner-persistence.js';
import {createPlannerWrites} from '../../app-planner-writes.js';

/** @type {import('../../app-planner-persistence.js').PlannerState} */
const state={boards:[],dayInsights:{},scheduleEvents:[],calendarSources:[]};
/** @type {import('../../app-planner-persistence.js').PlannerPersistenceHost} */
const host={writes:createPlannerWrites('one'),getOwnerId:()=> 'one',getPlanId:()=> 'plan',getState:()=>state,setState(){},setIdentity(){},readPlans:async()=>[],initialize:async()=>{},saveEdits:async(_plan,_owner,_base,local)=>local,migrate:plan=>plan.boards,normalizeBoards:boards=>boards};
const persistence=createPlannerPersistence(host);
persistence.save({origin:'test',scheduleAvailability:{timezone:'UTC',weeklyAvailability:null}}).then(saved=>saved.valueOf());
persistence.subscribe(status=>{const label=status.status;void label});
// @ts-expect-error owner identity must be a string or null
createPlannerPersistence({...host,getOwnerId:()=>123});
// @ts-expect-error confirmed reads need document IDs
createPlannerPersistence({...host,readPlans:async()=>[{boards:[]}]});
// @ts-expect-error save callbacks must return a planner state
createPlannerPersistence({...host,saveEdits:async()=>true});
// @ts-expect-error schedule availability timezones are strings
persistence.save({scheduleAvailability:{timezone:10,weeklyAvailability:null}});
// @ts-expect-error load identity requires a UID
persistence.load({uid:123});
// @ts-expect-error discard receipt IDs are strings
persistence.discard(123);
