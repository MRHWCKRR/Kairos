// @ts-check
/**
 * Validate application-owned planner fields before adding SDK timestamp sentinels.
 * Dates and Firestore's supported numeric values remain compatible with legacy data.
 * @param {unknown} value
 * @returns {asserts value is import('./planner-contracts.js').PlannerValue}
 */
export function assertPlannerValue(value) {
    const ancestors=new WeakSet();
    /** @param {string} path @param {string} reason @returns {never} */
    const invalid=(path,reason)=>{throw Error('Invalid planner value at '+path+': '+reason);};
    /** @param {unknown} current @param {string} path @param {number} depth */
    function visit(current,path,depth) {
        if(depth>64)invalid(path,'nesting exceeds the supported limit');
        if(current===null||['string','boolean','number'].includes(typeof current))return;
        if(typeof current!=='object')invalid(path,'undefined or unsupported value');
        if(Object.prototype.toString.call(current)==='[object Date]'){
            if(!Number.isFinite(Date.prototype.getTime.call(current)))invalid(path,'invalid date');
            return;
        }
        const object=/** @type {object} */(current);
        if(ancestors.has(object))invalid(path,'cyclic value');
        const prototype=Object.getPrototypeOf(current);
        if(!Array.isArray(current)&&prototype!==null&&Object.getPrototypeOf(prototype)!==null)invalid(path,'unsupported object');
        ancestors.add(object);
        try {
            if(Array.isArray(current))for(let i=0;i<current.length;i++)visit(current[i],path+'['+i+']',depth+1);
            else for(const [key,child] of Object.entries(object))visit(child,path+'.'+key.slice(0,80),depth+1);
        } finally {ancestors.delete(object);}
    }
    visit(value,'planner',0);
}
