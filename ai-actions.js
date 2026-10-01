import { auth, db } from './firebase.js';
import {
    collection, getDocs, query, where, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ACTIONS_REQUIRING_CONFIRMATION = new Set(['delete_task', 'delete_schedule_event']);

const clean = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const makeId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

async function latestPlan(user) {
    const snap = await getDocs(query(collection(db, 'study_plans'), where('userID', '==', user.uid)));
    let latest = null;
    for (const item of snap.docs) {
        const data = item.data() || {};
        const seconds = Number(data.createdAt?.seconds || 0);
        if (!latest || seconds > latest.seconds) latest = { id: item.id, data, seconds };
    }
    if (latest) return latest;

    const planRef = doc(collection(db, 'study_plans'));
    const data = { boards: [], dayInsights: {}, scheduleEvents: [], userID: user.uid, createdAt: { seconds: Math.floor(Date.now() / 1000) } };
    await setDoc(planRef, data);
    return { id: planRef.id, data, seconds: data.createdAt.seconds };
}

async function writePlan(plan) {
    await setDoc(doc(db, 'study_plans', plan.id), plan.data, { merge: true });
    window.dispatchEvent(new CustomEvent('kairos-data-changed'));
}

function allTasks(plan) {
    const boards = Array.isArray(plan.boards) ? plan.boards : [];
    return boards.flatMap(board =>
        (Array.isArray(board.sections) ? board.sections : []).flatMap(section =>
            (Array.isArray(section.tasks) ? section.tasks : []).map(task => ({ board, section, task }))
        )
    );
}

function findTask(plan, args) {
    const wantedId = clean(args.taskId, 120);
    const wantedTitle = clean(args.title, 180).toLowerCase();
    const matches = allTasks(plan).filter(({ task }) =>
        (wantedId && String(task.id) === wantedId) ||
        (wantedTitle && clean(task.title, 180).toLowerCase() === wantedTitle)
    );
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple tasks match. Please specify the task name more precisely.' : 'Task not found.');
    return matches[0];
}

function findScheduleEvent(plan, args) {
    const events = Array.isArray(plan.scheduleEvents) ? plan.scheduleEvents : [];
    const id = clean(args.eventId, 120);
    const title = clean(args.title, 120).toLowerCase();
    const matches = events.filter(ev =>
        (id && String(ev.id) === id) ||
        (title && clean(ev.title, 120).toLowerCase() === title)
    );
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple schedule events match. Please specify the event name more precisely.' : 'Schedule event not found.');
    return matches[0];
}

function findSection(plan, args) {
    const boardName = clean(args.board, 100).toLowerCase();
    const sectionName = clean(args.section, 100).toLowerCase();
    const boards = Array.isArray(plan.boards) ? plan.boards : [];
    let board = boards.find(b => !b.archived && (!boardName || clean(b.title, 100).toLowerCase() === boardName));
    if (!board && !boardName) {
        board = { id: makeId('board'), title: 'AI Tasks', archived: false, sections: [] };
        boards.push(board);
        plan.boards = boards;
    }
    if (!board) throw new Error('Board not found.');
    const sections = Array.isArray(board.sections) ? board.sections : [];
    let section = sections.find(s => !s.archived && (!sectionName || clean(s.title, 100).toLowerCase() === sectionName));
    if (!section && !sectionName) {
        section = { id: makeId('section'), title: 'General', archived: false, tasks: [] };
        sections.push(section);
        board.sections = sections;
    }
    if (!section) throw new Error('Section not found.');
    return { board, section };
}

function createBoard(plan, title) {
    const name = clean(title, 100);
    if (!name) throw new Error('A board title is required.');
    const boards = Array.isArray(plan.boards) ? plan.boards : [];
    const existing = boards.find(b => !b.archived && clean(b.title, 100).toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const board = {
        id: makeId('board'),
        title: name,
        archived: false,
        sections: [{
            id: makeId('section'),
            title: 'General',
            archived: false,
            tasks: []
        }]
    };
    boards.push(board);
    plan.boards = boards;
    return board;
}

export function actionNeedsConfirmation(action) {
    return ACTIONS_REQUIRING_CONFIRMATION.has(action?.type) || Number(action?.count || 1) > 1;
}

export async function executeKairosAction(action) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be signed in.');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Invalid AI action.');

    const plan = await latestPlan(user);
    const args = action.args && typeof action.args === 'object' ? action.args : Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'type'));
    const type = action.type;

    if (type === 'create_board') {
        const board = createBoard(plan.data, args.title);

        // A common AI request is "put/move this task into a new board".
        // Allow the model to express that as one atomic action so it cannot
        // create the board without actually moving the referenced task.
        const moveTaskId = clean(args.moveTaskId, 120);
        const moveTaskTitle = clean(args.moveTaskTitle, 180);
        if (moveTaskId || moveTaskTitle) {
            const found = findTask(plan.data, {
                taskId: moveTaskId,
                title: moveTaskTitle
            });
            const section = board.sections[0];
            found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
            section.tasks = Array.isArray(section.tasks) ? section.tasks : [];
            section.tasks.push(found.task);
        }

        await writePlan(plan);
        return { type, board };
    }

    if (type === 'create_task') {
        const { board, section } = findSection(plan.data, args);
        const title = clean(args.title, 180);
        if (!title) throw new Error('A task title is required.');
        const task = {
            id: makeId('task'),
            title,
            completed: false,
            archived: false,
            date: clean(args.date, 20) || null,
            startTime: clean(args.startTime, 5) || null,
            endTime: clean(args.endTime, 5) || null
        };
        section.tasks = Array.isArray(section.tasks) ? section.tasks : [];
        section.tasks.push(task);
        await writePlan(plan);
        return { type, task, board: board.title, section: section.title };
    }

    if (type === 'update_task') {
        const found = findTask(plan.data, args);
        if (args.newTitle !== undefined) found.task.title = clean(args.newTitle, 180);
        if (args.date !== undefined) found.task.date = clean(args.date, 20) || null;
        if (args.startTime !== undefined) found.task.startTime = clean(args.startTime, 5) || null;
        if (args.endTime !== undefined) found.task.endTime = clean(args.endTime, 5) || null;
        if (args.completed !== undefined) found.task.completed = Boolean(args.completed);
        if (args.archived !== undefined) found.task.archived = Boolean(args.archived);

        if (args.board !== undefined || args.section !== undefined) {
            const destination = findSection(plan.data, {
                board: args.board,
                section: args.section
            });
            if (destination.board.id !== found.board.id || destination.section.id !== found.section.id) {
                found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
                destination.section.tasks = Array.isArray(destination.section.tasks) ? destination.section.tasks : [];
                destination.section.tasks.push(found.task);
            }
        }

        await writePlan(plan);
        return {
            type,
            task: found.task,
            board: args.board !== undefined ? clean(args.board, 100) : found.board.title,
            section: args.section !== undefined ? clean(args.section, 100) : found.section.title
        };
    }

    if (type === 'complete_task') {
        const found = findTask(plan.data, args);
        found.task.completed = true;
        await writePlan(plan);
        return { type, task: found.task };
    }

    if (type === 'delete_task') {
        const found = findTask(plan.data, args);
        found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
        await writePlan(plan);
        return { type, task: found.task };
    }

    if (type === 'create_schedule_event') {
        const title = clean(args.title, 120);
        if (!title) throw new Error('A schedule event title is required.');
        const event = {
            id: makeId('event'),
            title,
            category: clean(args.category, 30) || 'other',
            day: Number.isInteger(Number(args.day)) ? Number(args.day) : 0,
            start: clean(args.start, 10),
            end: clean(args.end, 10)
        };
        if (event.day < 0 || event.day > 6 || !event.start || !event.end) throw new Error('A valid day, start time, and end time are required.');
        plan.data.scheduleEvents = Array.isArray(plan.data.scheduleEvents) ? plan.data.scheduleEvents : [];
        plan.data.scheduleEvents.push(event);
        await writePlan(plan);
        return { type, event };
    }

    if (type === 'update_schedule_event') {
        const event = findScheduleEvent(plan.data, args);
        if (args.newTitle !== undefined) event.title = clean(args.newTitle, 120);
        if (args.category !== undefined) event.category = clean(args.category, 30) || 'other';
        if (args.day !== undefined) event.day = Number(args.day);
        if (args.start !== undefined) event.start = clean(args.start, 10);
        if (args.end !== undefined) event.end = clean(args.end, 10);
        if (event.day < 0 || event.day > 6 || !event.start || !event.end) throw new Error('Invalid schedule event details.');
        await writePlan(plan);
        return { type, event };
    }

    if (type === 'delete_schedule_event') {
        const event = findScheduleEvent(plan.data, args);
        plan.data.scheduleEvents = (plan.data.scheduleEvents || []).filter(item => item.id !== event.id);
        await writePlan(plan);
        return { type, event };
    }

    throw new Error('Unsupported AI action: ' + type);
}
