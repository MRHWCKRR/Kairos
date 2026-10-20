import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGettingStarted, transitionGettingStarted } from '../getting-started-model.js';
import { createGettingStartedStore } from '../getting-started-store.js';

const guide = (status = 'active', step = 0) => ({ version: 2, status, step, updatedAt: 1 });
const transition = (data, action, options = {}) => transitionGettingStarted(data, action, { now: 1234, ...options });

test('parser only accepts version two states and bounded integer steps', () => {
    assert.equal(normalizeGettingStarted(null), null);
    assert.equal(normalizeGettingStarted({ ...guide(), version: 1 }), null);
    assert.equal(normalizeGettingStarted(guide('unknown')), null);
    for (const step of [-1, 5, 1.5, '2']) assert.equal(normalizeGettingStarted(guide('active', step)), null);
    assert.deepEqual(normalizeGettingStarted(guide('completed', 4)), guide('completed', 4));
});

test('reconciliation never awards before onboarding or while the guide is active', () => {
    for (const data of [{}, { onboardingCompleted: false }, { onboardingCompleted: true, gettingStarted: guide() }]) {
        const result = transition(data, { type: 'reconcile' }, { includeOg: true });
        assert.deepEqual(result.patch, {});
        assert.deepEqual(result.awardedIds, []);
    }
});

test('complete and skip atomically award exactly once, preserving every existing achievement field', () => {
    for (const type of ['completed', 'skipped']) {
        const achievements = { unlocked: { focus_1: 18 }, countedTaskIds: ['task-one'], lifetimeTasksCompleted: 19, goals: [{ id: 'goal' }], futureCounter: 42 };
        const data = { onboardingCompleted: true, gettingStarted: guide('active', 2), achievements };
        const original = structuredClone(data);
        const result = transition(data, { type }, { includeOg: true });
        assert.equal(result.state.status, type);
        assert.equal(result.state.step, type === 'completed' ? 4 : 2);
        assert.deepEqual(result.awardedIds, ['misc_welcome', 'misc_og']);
        assert.deepEqual(result.achievements, { ...achievements, unlocked: { focus_1: 18, misc_welcome: 1234, misc_og: 1234 } });
        assert.deepEqual(data, original);
        const repeated = transition({ ...data, ...result.patch }, { type }, { includeOg: true });
        assert.deepEqual(repeated.patch, {});
        assert.deepEqual(repeated.awardedIds, []);
    }
});

test('legacy users qualify based on onboarding alone, without focus data or repeat grants', () => {
    const achievements = { unlocked: { misc_welcome: 9, misc_og: 0 }, futureField: 'preserved' };
    assert.deepEqual(transition({ onboardingCompleted: true, achievements, focusData: {} }, { type: 'reconcile' }, { includeOg: true }).patch, {});
    assert.deepEqual(transition({ onboardingCompleted: true }, { type: 'reconcile' }).awardedIds, ['misc_welcome']);
    assert.deepEqual(transition({ focusData: { totalSeconds: 99999 } }, { type: 'reconcile' }).patch, {});
});

test('progress only updates an active guide and late progress cannot reactivate a terminal guide', () => {
    assert.deepEqual(transition({ onboardingCompleted: true }, { type: 'progress', step: 1 }).patch, {});
    assert.deepEqual(transition({ gettingStarted: guide() }, { type: 'completed' }).patch, {});
    const data = { onboardingCompleted: true, gettingStarted: guide() };
    const progressed = transition(data, { type: 'progress', step: 3 });
    assert.deepEqual(progressed.patch, { gettingStarted: { ...guide('active', 3), updatedAt: 1234 } });
    assert.deepEqual(transition(data, { type: 'progress', step: 99 }).patch, {});
    const finished = transition({ ...data, ...progressed.patch }, { type: 'completed' });
    assert.deepEqual(transition({ ...data, ...finished.patch }, { type: 'progress', step: 1 }).patch, {});
});

function storeFixture(initial, { afterRead, beforeCommit } = {}) {
    let owner = 'first-uid';
    const records = new Map(Object.entries(initial));
    const writes = [];
    const store = createGettingStartedStore({
        db: 'db',
        doc: (_db, collection, uid) => { assert.equal(collection, 'users'); return uid; },
        getOwner: () => owner,
        includeOg: true,
        runTransaction: async (_db, callback) => {
            const pending = [];
            const result = await callback({
                async get(uid) { const value = records.get(uid); await afterRead?.(() => { owner = 'second-uid'; }); return { exists: () => value !== undefined, data: () => structuredClone(value) }; },
                update(uid, patch) { pending.push([uid, patch]); }
            });
            await beforeCommit?.(() => { owner = 'second-uid'; });
            for (const [uid, patch] of pending) { records.set(uid, { ...records.get(uid), ...patch }); writes.push([uid, patch]); }
            return result;
        }
    });
    return { store, records, writes, setOwner: value => { owner = value; } };
}

test('store uses UID scoped user records and reads the current record after account recreation', async () => {
    const f = storeFixture({ 'first-uid': { onboardingCompleted: true }, 'second-uid': { onboardingCompleted: false } });
    assert.deepEqual((await f.store.update('first-uid', { type: 'reconcile' })).awardedIds, ['misc_welcome', 'misc_og']);
    f.setOwner('second-uid');
    assert.deepEqual((await f.store.update('second-uid', { type: 'reconcile' })).patch, {});
    assert.equal(f.writes.length, 1);
    assert.equal(await f.store.update('first-uid', { type: 'reconcile' }), null);
});

test('store rejects stale account results during delayed reads and after commits', async () => {
    for (const phase of ['afterRead', 'beforeCommit']) {
        const f = storeFixture({ 'first-uid': { onboardingCompleted: true, gettingStarted: guide() } }, { [phase]: switchOwner => switchOwner() });
        assert.equal(await f.store.update('first-uid', { type: 'completed' }), null);
        if (phase === 'afterRead') assert.equal(f.writes.length, 0);
        assert.equal(f.records.has('second-uid'), false);
    }
});

test('store never creates a missing account document or writes unchanged state', async () => {
    const f = storeFixture({});
    assert.equal(await f.store.update('first-uid', { type: 'reconcile' }), null);
    assert.equal(f.writes.length, 0);
});

test('a transaction retry reads a concurrent terminal state and discards the stale progress patch', async () => {
    let record = { onboardingCompleted: true, gettingStarted: guide() };
    const attempts = [];
    const store = createGettingStartedStore({
        db: 'db', doc: () => 'first-uid', getOwner: () => 'first-uid',
        runTransaction: async (_db, callback) => {
            async function attempt() {
                const writes = [];
                const result = await callback({
                    get: async () => ({ exists: () => true, data: () => structuredClone(record) }),
                    update: (_reference, patch) => writes.push(patch)
                });
                attempts.push(writes);
                return result;
            }
            await attempt();
            record = { ...record, ...transition(record, { type: 'completed' }).patch };
            return attempt();
        }
    });
    const result = await store.update('first-uid', { type: 'progress', step: 2 });
    assert.equal(attempts[0].length, 1);
    assert.deepEqual(attempts[1], []);
    assert.equal(result.state.status, 'completed');
    assert.deepEqual(result.patch, {});
    assert.deepEqual(result.awardedIds, []);
});
