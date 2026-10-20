import { transitionGettingStarted } from './getting-started-model.js';

/** Firebase primitives are injected so the model remains usable without Firebase. */
export function createGettingStartedStore({ db, doc, runTransaction, getOwner, includeOg = false }) {
    return {
        async update(owner, action) {
            if (!owner || getOwner() !== owner) return null;
            const reference = doc(db, 'users', owner);
            const result = await runTransaction(db, async transaction => {
                if (getOwner() !== owner) return null;
                const snapshot = await transaction.get(reference);
                if (getOwner() !== owner || !snapshot.exists()) return null;
                const result = transitionGettingStarted(snapshot.data(), action, { includeOg });
                if (getOwner() !== owner) return null;
                if (Object.keys(result.patch).length) transaction.update(reference, result.patch);
                return result;
            });
            return getOwner() === owner ? result : null;
        }
    };
}
