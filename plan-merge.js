export function stableStringify(value) {
    const canonical = item => Array.isArray(item) ? item.map(canonical)
        : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
    return JSON.stringify(canonical(value));
}
const equal = (a, b) => stableStringify(a) === stableStringify(b);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keyed = list => Array.isArray(list) && list.every(item => object(item) && typeof item.id === 'string' && item.id);

// Apply only changes made since the editor's baseline. Concurrent edits to
// another entity/field survive; competing edits fail rather than lose data.
export function mergePlanEdits(base, local, remote) {
    if (equal(local, base)) return structuredClone(remote);
    if (equal(remote, base) || equal(local, remote)) return structuredClone(local);
    if (base !== undefined && (local === undefined || remote === undefined)) {
        throw new Error('This item changed in another window or chat. Reload the planner before retrying.');
    }
    if (keyed(base) && keyed(local) && keyed(remote)) {
        const maps = [base, local, remote].map(list => new Map(list.map(item => [item.id, item])));
        if (maps.some((map, index) => map.size !== [base, local, remote][index].length)) {
            throw new Error('Conflicting duplicate planner IDs.');
        }
        const baseIds = base.map(item => item.id), localIds = local.map(item => item.id);
        const order = equal(baseIds, localIds) ? remote.map(item => item.id) : localIds;
        const ids = [...new Set([...order, ...remote.map(item => item.id), ...localIds])];
        return ids.map(id => mergePlanEdits(maps[0].get(id), maps[1].get(id), maps[2].get(id))).filter(item => item !== undefined);
    }
    if (object(local) && object(remote) && (base === undefined || object(base))) {
        const keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
        return Object.fromEntries([...keys].map(key => [key, mergePlanEdits(base?.[key], local[key], remote[key])]).filter(([, value]) => value !== undefined));
    }
    throw new Error('This item changed in another window or chat. Reload the planner before retrying.');
}

export function planState(data) {
    const boards = Array.isArray(data.boards) ? data.boards
        : Array.isArray(data.sections) ? [{ id: 'legacy-board', title: 'My Routine', sections: data.sections }] : [];
    return structuredClone({
        boards: boards.map(board => ({ ...board, archived: board.archived ?? false,
            sections: (board.sections || []).map(section => ({ ...section, archived: section.archived ?? false,
                tasks: (section.tasks || []).map(task => ({ ...task, archived: task.archived ?? false }))
            }))
        })),
        dayInsights: data.dayInsights || {}, scheduleEvents: data.scheduleEvents || []
    });
}
