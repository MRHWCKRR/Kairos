import type {PlannerState as PlannerInput} from './planner-contracts.js';
import type {createPlannerWrites} from './app-planner-writes.js';

export type PlannerState = Required<PlannerInput>;
export type PlannerDocument = PlannerInput & {docId:string;sections?:PlannerInput['boards'];createdAt?:{seconds:number}};
export type PlannerAttempt = {base:PlannerState;local:PlannerState};
export type PlannerSaveOptions = Record<string,unknown> & {
    origin?:string;
    scheduleAvailability?:{timezone:string;weeklyAvailability:Record<string,Array<{start:string;end:string}>>|null}|null;
    requireExisting?:boolean;
    recoveryAttempt?:PlannerAttempt;
};
export type PlannerRecovery = PlannerAttempt & {
    version:1;id:string;ownerId:string;planId:string;newPlan:boolean;
    options:PlannerSaveOptions;attempt?:PlannerAttempt;
};
export type PlannerStatus = {
    ownerId:string|null;busy:boolean;pending:boolean;retained:boolean;conflict:boolean;
    status:'idle'|'saving'|'saved'|'unconfirmed'|'conflict';message:string;
    canRetry:boolean;canDiscard:boolean;
};
export interface PlannerPersistenceHost {
    writes:ReturnType<typeof createPlannerWrites>;
    getOwnerId:()=>string|null;
    getPlanId:()=>string|null;
    getState:()=>PlannerState;
    setState:(state:PlannerState)=>void;
    setIdentity:(ownerId:string|null,planId:string|null)=>void;
    readPlans:(ownerId:string)=>Promise<PlannerDocument[]>;
    initialize:(ownerId:string)=>Promise<unknown>;
    saveEdits:(planId:string,ownerId:string,base:PlannerState,local:PlannerState,options:PlannerSaveOptions)=>Promise<PlannerState>;
    migrate:(plan:PlannerDocument)=>PlannerInput['boards']|null;
    normalizeBoards:(boards:NonNullable<PlannerInput['boards']>)=>NonNullable<PlannerInput['boards']>;
    storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>;
    onInvalidate?:(change:{ownerId:string;planId:string|null;before:PlannerState|null;after:PlannerState})=>void;
    onSaved?:()=>void;
    onReminders?:()=>void;
    onRender?:()=>void;
    onLoadComplete?:()=>void;
    onError?:(phase:'save'|'load',error:Error)=>void;
}
export function createPlannerPersistence(host:PlannerPersistenceHost): {
    save:(options?:PlannerSaveOptions)=>Promise<boolean>;
    load:(user:{uid:string})=>Promise<void>;
    retry:()=>Promise<boolean>;
    discard:(expectedId?:string|null)=>Promise<boolean>;
    state:()=>PlannerStatus;
    clear:(ownerId:string)=>void;
    recovery:()=>PlannerRecovery|null;
    assertReady:()=>void;
    subscribe:(listener:(status:PlannerStatus)=>void)=>()=>void;
};
