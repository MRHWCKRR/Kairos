// @ts-check
import {normaliseShortcuts} from './shortcut-model.js';

/** @template T @param {T} obj @returns {T} */
export function cloneDeep(obj) {
    return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
}

/** @param {any} base @param {any} override @returns {any} */
export function deepMerge(base, override) {
    if (typeof base !== 'object' || base === null) return override !== undefined ? override : base;
    /** @type {any} */
    const result = Array.isArray(base) ? [...base] : { ...base };
    if (override && typeof override === 'object') {
        for (const key of Object.keys(override)) {
            if (typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])) {
                result[key] = deepMerge(base[key], override[key]);
            } else {
                result[key] = override[key];
            }
        }
    }
    return result;
}

export function defaultSettings() {
    let tz = 'UTC';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
    return {
        profile: { displayName: '', avatarURL: '', birthday: '', timezone: tz },
        accessibility: { density: 'default', timeFormat: '12', reduceMotion: false, language: 'en', shortcuts: normaliseShortcuts() },
        appearance: {
            mode: 'dark',
            theme: 'default',
            textColor: 'default',
            font: 'sans',
            background: 'none',
            customBackground: null,
            cursor: 'default',
            ambientSound: 'none',
            ambientVolume: 35,
            customAmbientYoutubeUrl: '',
            confetti: true
        },
        planning: {weeklyAvailability:null,dailyLimitMinutes:0,gapMinutes:0,rescheduleCompleted:false},
        notifications: { enabled: true, boardCompletion: true, bedtimeReminders: true, browserPush: false }
    };
}

