// @ts-check
import {createPlannerSaveRecovery} from '../../planner-save-recovery.js';

/** @type {import('../../app-planner-persistence.js').PlannerState} */
const state={boards:[],dayInsights:{},scheduleEvents:[],calendarSources:[]};
/** @type {import('../../app-planner-persistence.js').PlannerRecovery} */
const record={version:1,id:'save',ownerId:'owner',planId:'plan',newPlan:false,base:state,local:state,options:{requireExisting:true}};
/** @type {Pick<Storage,'getItem'|'setItem'|'removeItem'>} */
const storage={getItem:(_key)=>null,setItem(_key,_value){},removeItem(_key){}};
const recovery=createPlannerSaveRecovery(storage);
const inspection=recovery.inspect('owner');
if(inspection.record)inspection.record.local.boards.length;
const raw=recovery.stage('owner',record,null);
recovery.clear('owner',raw);
recovery.clear('owner');
// @ts-expect-error owner IDs must be strings
recovery.inspect(123);
// @ts-expect-error retained records require complete normalized planner state
recovery.stage('owner',{...record,local:{boards:[]}},null);
// @ts-expect-error compare-and-set receipts are strings or null
recovery.stage('owner',record,123);
// @ts-expect-error explicit clear receipts cannot be undefined
recovery.clear('owner',undefined);
