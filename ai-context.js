import { auth, db } from './firebase.js';
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const PLAN_CACHE_MS = 15000;
let cached = null;
let cachedAt = 0;
let cachedUid = null;

const clean = (value, max = 240) => String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function formatDate(date, timeZone) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone
        }).format(date);
    } catch {
        return date.toLocaleDateString();
    }
}

function formatTime(date, timeZone) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            hour: 'numeric', minute: '2-digit', timeZone
        }).format(date);
    } catch {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
}

function formatTaskDate(value, timeZone) {
    if (!value) return '';
    const date = new Date(value + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return clean(value, 40);
    return formatDate(date, timeZone);
}

function dayLabel(day) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(day)] || 'Unknown day';
}

function normaliseBoards(plan) {
    if (Array.isArray(plan?.boards)) return plan.boards;
    if (Array.isArray(plan?.sections)) return [{ title: 'My Routine', sections: plan.sections }];
    return [];
}

function calculateAge(birthday, now, timeZone) {
    if (!birthday) return '';
    const match = String(birthday).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const [, year, month, day] = match;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now));
    const current = {};
    for (const part of parts) {
        if (part.type !== 'literal') current[part.type] = Number(part.value);
    }
    let age = current.year - Number(year);
    if (current.month < Number(month) || (current.month === Number(month) && current.day < Number(day))) age--;
    return age >= 0 && age <= 130 ? String(age) : '';
}

async function loadContextData(user) {
    const now = Date.now();
    if (cached && cachedUid === user.uid && now - cachedAt < PLAN_CACHE_MS) return cached;

    const [userSnap, plansSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(query(collection(db, 'study_plans'), where('userID', '==', user.uid)))
    ]);

    let latestPlan = null;
    for (const snap of plansSnap.docs) {
        const data = snap.data() || {};
        const seconds = Number(data.createdAt?.seconds || 0);
        if (!latestPlan || seconds > latestPlan.createdSeconds) latestPlan = { ...data, createdSeconds: seconds };
    }

    const userData = userSnap.exists() ? (userSnap.data() || {}) : {};
    const cloudSettings = userData.settings || {};
    let cachedSettings = {};
    try {
        const local = JSON.parse(localStorage.getItem('kairos_settings_cache') || '{}');
        if (local && typeof local === 'object') cachedSettings = local;
    } catch {
        // Ignore malformed local settings cache.
    }

    const cloudProfile = cloudSettings.profile || {};
    const cachedProfile = cachedSettings.profile || {};
    const profile = {
        ...cachedProfile,
        ...cloudProfile,
        displayName: clean(cloudProfile.displayName, 80) || clean(cachedProfile.displayName, 80),
        birthday: clean(cloudProfile.birthday, 20) || clean(cachedProfile.birthday, 20),
        timezone: clean(cloudProfile.timezone, 80) || clean(cachedProfile.timezone, 80)
    };
    const accessibility = {
        ...(cachedSettings.accessibility || {}),
        ...(cloudSettings.accessibility || {})
    };
    const timeZone = clean(profile.timezone, 80) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const boards = normaliseBoards(latestPlan);
    const tasks = [];
    for (const board of boards) {
        for (const section of Array.isArray(board.sections) ? board.sections : []) {
            for (const task of Array.isArray(section.tasks) ? section.tasks : []) {
                if (task.archived || task.completed) continue;
                tasks.push({
                    board: clean(board.title, 80),
                    section: clean(section.title, 80),
                    title: clean(task.title, 180),
                    date: task.date || ''
                });
            }
        }
    }

    tasks.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    });

    const scheduleEvents = Array.isArray(latestPlan?.scheduleEvents)
        ? latestPlan.scheduleEvents.filter(ev => ev && ev.title).slice(0, 80).map(ev => ({
            title: clean(ev.title, 100),
            category: clean(ev.category, 30),
            day: Number(ev.day),
            start: clean(ev.start, 10),
            end: clean(ev.end, 10)
        }))
        : [];

    const birthday = clean(profile.birthday, 20);
    const result = {
        timeZone,
        language: clean(accessibility.language, 20) || 'en',
        displayName: clean(profile.displayName, 80) || clean(user.displayName, 80),
        birthday,
        age: calculateAge(birthday, now, timeZone),
        now,
        tasks: tasks.slice(0, 120),
        scheduleEvents,
        boards: boards.filter(b => !b.archived).slice(0, 30).map(b => ({
            title: clean(b.title, 100),
            sections: (Array.isArray(b.sections) ? b.sections : [])
                .filter(s => !s.archived)
                .slice(0, 30)
                .map(s => clean(s.title, 100))
        }))
    };

    cached = result;
    cachedAt = now;
    cachedUid = user.uid;
    return result;
}

export async function getKairosContext() {
    const user = auth.currentUser;
    if (!user) return '';

    try {
        const data = await loadContextData(user);
        const nowDate = new Date(data.now);
        const lines = [
            'Kairos context (read-only; use this only when relevant):',
            'Current date: ' + formatDate(nowDate, data.timeZone),
            'Current time: ' + formatTime(nowDate, data.timeZone),
            'User timezone: ' + data.timeZone,
            'Kairos language setting: ' + data.language
        ];

        if (data.displayName) {
            lines.push('User name: ' + data.displayName);
            lines.push('Address the user by name occasionally and naturally, but do not overuse it.');
        }

        if (data.birthday) {
            lines.push('User birthday: ' + data.birthday);
            if (data.age) lines.push('User age: ' + data.age);
            lines.push('Use birthday/age only when relevant to recommendations, planning, or age-appropriate context. Do not mention the birthday unless it is relevant.');
        }

        if (data.boards.length) {
            lines.push('Projects/boards and sections:');
            for (const board of data.boards) {
                const sections = board.sections.length ? ' — ' + board.sections.join(', ') : '';
                lines.push('- ' + board.title + sections);
            }
        }

        if (data.tasks.length) {
            lines.push('Open tasks:');
            for (const task of data.tasks) {
                const location = [task.board, task.section].filter(Boolean).join(' / ');
                const deadline = task.date ? ' — deadline: ' + formatTaskDate(task.date, data.timeZone) : '';
                lines.push('- ' + task.title + (location ? ' [' + location + ']' : '') + deadline);
            }
        } else {
            lines.push('Open tasks: none currently recorded.');
        }

        if (data.scheduleEvents.length) {
            lines.push('Recurring weekly commitments:');
            for (const event of data.scheduleEvents) {
                lines.push('- ' + event.title + ' (' + (event.category || 'other') + ') — ' + dayLabel(event.day) + ' ' + event.start + '-' + event.end);
            }
        } else {
            lines.push('Recurring weekly commitments: none currently recorded.');
        }

        return lines.join('\n');
    } catch (error) {
        console.warn('Kairos AI context unavailable:', error);
        return '';
    }
}

export function invalidateKairosContext() {
    cached = null;
    cachedAt = 0;
    cachedUid = null;
}
