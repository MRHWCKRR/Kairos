import type {PlannerRecovery} from './app-planner-persistence.js';

export type PlannerRecoveryInspection =
    | {raw:string;record:PlannerRecovery;error?:never}
    | {raw:null;record:null;error?:never}
    | {raw:string|null|undefined;record?:never;error:string};

export interface PlannerSaveRecoveryStore {
    inspect(ownerId:string|null|undefined):PlannerRecoveryInspection;
    stage(ownerId:string,record:PlannerRecovery,expectedRaw:string|null):string;
    clear(ownerId:string):void;
    clear(ownerId:string,expectedRaw:string|null):void;
}

export function createPlannerSaveRecovery(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>):PlannerSaveRecoveryStore;
