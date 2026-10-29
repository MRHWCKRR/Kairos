// @ts-check
/** One queue and cloud baseline for ordinary, task-detail and focus writes. */
export function createPlannerWrites() {
    /** @type {Promise<unknown>} */
    let queue=Promise.resolve();
    let editRevision=0,loadRevision=0;
    /** @type {any} */
    let snapshot=null;
    return {
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
