const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStep = value => Number.isInteger(value) && value >= 0 && value <= 4;

export function normalizeGettingStarted(value) {
    if (!isRecord(value) || value.version !== 2 || !['active', 'completed', 'skipped'].includes(value.status) || !isStep(value.step)) return null;
    return {
        version: 2,
        status: value.status,
        step: value.step,
        updatedAt: Number.isFinite(value.updatedAt) && value.updatedAt >= 0 ? value.updatedAt : 0
    };
}

/** Compute an atomic user-document update; never mutate the source snapshot. */
export function transitionGettingStarted(data, action, { now = Date.now, includeOg = false } = {}) {
    const user = isRecord(data) ? data : {};
    let state = normalizeGettingStarted(user.gettingStarted);
    let achievements = isRecord(user.achievements) ? user.achievements : {};
    const patch = {};
    const awardedIds = [];
    const timestamp = typeof now === 'function' ? now() : now;
    const terminal = action?.type === 'completed' || action?.type === 'skipped';

    if (state?.status === 'active') {
        if (action?.type === 'progress' && isStep(action.step) && action.step !== state.step) {
            state = { ...state, step: action.step, updatedAt: timestamp };
            patch.gettingStarted = state;
        } else if (terminal && user.onboardingCompleted === true) {
            state = { ...state, status: action.type, step: action.type === 'completed' ? 4 : state.step, updatedAt: timestamp };
            patch.gettingStarted = state;
        }
    }

    // Active guides defer signup awards until their explicit completion or skip.
    // A malformed active record also defers awards rather than qualifying as legacy.
    const active = state?.status === 'active' || (!state && user.gettingStarted?.status === 'active');
    if ((action?.type === 'reconcile' || patch.gettingStarted?.status === 'completed' || patch.gettingStarted?.status === 'skipped') && user.onboardingCompleted === true && !active) {
        const unlocked = isRecord(achievements.unlocked) ? achievements.unlocked : {};
        const updatedUnlocked = { ...unlocked };
        for (const id of includeOg ? ['misc_welcome', 'misc_og'] : ['misc_welcome']) {
            if (Object.hasOwn(unlocked, id)) continue;
            updatedUnlocked[id] = timestamp;
            awardedIds.push(id);
        }
        if (awardedIds.length) {
            achievements = { ...achievements, unlocked: updatedUnlocked };
            patch.achievements = achievements;
        }
    }
    return { patch, state, achievements, awardedIds };
}
