// @ts-check
/** One queue and cloud baseline for ordinary, task-detail and focus writes. */
/** @param {string|null} [initialOwnerId] */
export function createPlannerWrites(initialOwnerId=null) {
    /** @type {Promise<unknown>} */
    let queue=Promise.resolve();
    let editRevision=0,loadRevision=0;
    let ownerId=initialOwnerId;
    /** @type {any} */
    let snapshot=null;
    return {
        /** @param {string|null} nextOwnerId */
        setOwner(nextOwnerId){
            const changed=ownerId!==null&&ownerId!==nextOwnerId;
            ownerId=nextOwnerId;
            if(changed){snapshot=null;editRevision++;loadRevision++;}
            return changed;
        },
        /** @template T @param {()=>Promise<T>} operation @returns {Promise<T>} */
        enqueue(operation){const work=queue.catch(()=>{}).then(operation);queue=work;return work;},
        idle(){return queue.catch(()=>{}).then(()=>editRevision);},
        /** @param {boolean} [invalidateLoads] */
        markEdit(invalidateLoads=false){editRevision++;if(invalidateLoads)loadRevision++;},
        beginLoad(){return {load:++loadRevision,edit:editRevision};},
        /** @param {{load:number,edit:number}} ticket */
        isCurrentLoad(ticket){return ticket.load===loadRevision&&ticket.edit===editRevision;},
        get snapshot(){return snapshot;},
        set snapshot(value){snapshot=value;}
    };
}
