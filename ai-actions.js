import { auth, db } from './firebase.js';
import { persistAiPlanAction, getConfirmedAiAction } from './plan-store.js?v=4';
import { validateActionShape } from './ai-action-schema.js?v=2';
import { stableStringify, planState } from './plan-merge.js';
import { taskDurationMinutes } from './schedule-utils.js';
import {previewAiPlanning,resolveAiPlanningTimezone} from './ai-planning.js?v=2';
import {planningConflicts} from './planning-slots.js';
import {applyPlanningCommand} from './planning-commands.js?v=2';
import {
    collection, getDocs, query, where, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ACTIONS_REQUIRING_CONFIRMATION = new Set(['delete_task', 'delete_schedule_event', 'delete_board', 'delete_section']);

const clean = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const makeId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

async function planningTimezone(user) {
    const snapshot=await getDoc(doc(db,'users',user.uid));
    if(auth.currentUser?.uid!==user.uid)throw Error('The signed-in account changed.');
    return resolveAiPlanningTimezone(snapshot.data(),user.uid);
}

async function latestPlan(user) {
    const snap = await getDocs(query(collection(db, 'study_plans'), where('userID', '==', user.uid)));
    let latest = null;
    for (const item of snap.docs) {
        const data = item.data() || {};
        const seconds = Number(data.createdAt?.seconds || 0);
        if (!latest || seconds > latest.seconds) latest = { id: item.id, data, seconds };
    }
    if (latest) return latest;

    return { id: 'plan-' + user.uid };
}

export async function getAiPlanId() {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be signed in.');
    return (await latestPlan(user)).id;
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
    const tasks = allTasks(plan);
    const matches = tasks.filter(({ task }) =>
        wantedId ? String(task.id) === wantedId :
        (wantedTitle && clean(task.title, 180).toLowerCase() === wantedTitle)
    );
    if (matches.length === 1) return matches[0];

    throw new Error(matches.length ? 'Multiple tasks match. Please specify the task name more precisely.' : 'Task not found.');
}

function findScheduleEvent(plan, args) {
    const events = Array.isArray(plan.scheduleEvents) ? plan.scheduleEvents : [];
    const id = clean(args.eventId, 120);
    const title = clean(args.title, 120).toLowerCase();
    const matches = events.filter(ev =>
        id ? String(ev.id) === id :
        (title && clean(ev.title, 120).toLowerCase() === title)
    );
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple schedule events match. Please specify the event name more precisely.' : 'Schedule event not found.');
    return matches[0];
}

function resolveBoard(plan, args, includeArchived = true) {
    const id = clean(args.boardId, 120), name = clean(args.board || args.title, 100).toLowerCase();
    const matches = (plan.boards || []).filter(board => (includeArchived || !board.archived) &&
        (id ? board.id === id : name && clean(board.title, 100).toLowerCase() === name));
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple boards match. Specify a board ID.' : 'Board not found.');
    return matches[0];
}

function resolveSection(plan, args, includeArchived = true) {
    const id = clean(args.sectionId, 120), name = clean(args.section || args.title, 100).toLowerCase();
    const scoped = args.boardId !== undefined || args.board !== undefined;
    const boards = scoped ? [resolveBoard(plan, args, includeArchived)] : plan.boards || [];
    const matches = boards.flatMap(board => (board.sections || []).filter(section =>
        (includeArchived || (!board.archived && !section.archived)) &&
        (id ? section.id === id : name && clean(section.title, 100).toLowerCase() === name)
    ).map(section => ({ board, section })));
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple sections match. Specify a section ID or its board.' : 'Section not found or does not belong to the specified board.');
    return matches[0];
}

function findSection(plan, args) {
    if (args.sectionId !== undefined) return resolveSection(plan, args, false);
    const hasBoard = args.boardId !== undefined || args.board !== undefined;
    let board = hasBoard ? resolveBoard(plan, args, false) : (plan.boards || []).find(item => !item.archived);
    if (!board) {
        board = { id: makeId('board'), title: 'AI Tasks', archived: false, sections: [] };
        plan.boards = [...(plan.boards || []), board];
    }
    if (args.section !== undefined) return resolveSection(plan, { boardId: board.id, section: args.section }, false);
    let section = (board.sections || []).find(item => !item.archived);
    if (!section) {
        section = { id: makeId('section'), title: 'General', archived: false, tasks: [] };
        board.sections = [...(board.sections || []), section];
    }
    return { board, section };
}

function actionPreview(plan, action) {
    const args = action.args;
    let entity, kind, pinned;
    if (action.type.endsWith('_board')) {
        entity = resolveBoard(plan, args); kind = 'board';
        pinned = { ...args, boardId: entity.id };
    } else if (action.type.endsWith('_section')) {
        const found = resolveSection(plan, args); entity = found.section; kind = 'section';
        pinned = { ...args, boardId: found.board.id, sectionId: entity.id };
    } else if (action.type === 'delete_task') {
        entity = findTask(plan, args).task; kind = 'task'; pinned = { ...args, taskId: entity.id };
    } else {
        entity = findScheduleEvent(plan, args); kind = 'event'; pinned = { ...args, eventId: entity.id };
    }
    const sections = kind === 'board' ? entity.sections || [] : kind === 'section' ? [entity] : [];
    return {
        action: { type: action.type, args: pinned },
        approval: { signature: stableStringify({ kind, entity }) },
        summary: { kind, title: entity.title, sectionCount: sections.length,
            taskCount: sections.reduce((total, section) => total + (section.tasks || []).length, 0),
            sections: sections.map(section => ({ title: section.title,
                tasks: (section.tasks || []).map(task => ({ title: task.title }))
            }))
        }
    };
}

export async function previewKairosAction(action, options = {}) {
    const user = auth.currentUser;
    if (!user || (options.ownerId && options.ownerId !== user.uid)) throw new Error('The signed-in account changed.');
    validateActionArgs(action.type, action.args);
    const planId = options.planId || await getAiPlanId();
    const snapshot = await getDoc(doc(db, 'study_plans', planId));
    if (!snapshot.exists()) throw new Error('Planner not found.');
    const data = snapshot.data();
    if (data.userID !== user.uid) throw new Error('This planner belongs to another account.');
    if(action.type.startsWith('plan_')) {
        const timezone=await planningTimezone(user);
        const proposal=previewAiPlanning(planState(data),action,{timezone});
        return {action,approval:{request:stableStringify(action),command:proposal.command,expected:proposal.expected},summary:{kind:'planning',title:action.type==='plan_sessions'?'New work sessions':'Schedule changes',rows:proposal.rows,timezone,options:proposal.command.options,remainingConflicts:proposal.remainingConflicts||0}};
    }
    return actionPreview(planState(data), action);
}

export async function confirmedKairosAction(action, options) {
    const user = auth.currentUser;
    if (!user || options.ownerId !== user.uid) throw new Error('The signed-in account changed.');
    return getConfirmedAiAction(options.planId, user.uid, action, options.operationId);
}

function requireReviewedContents(plan, action, confirmation) {
    if (!confirmation?.signature) throw new Error('A current preview and confirmation are required.');
    if (confirmation.signature !== actionPreview(plan, action).approval.signature) {
        throw new Error('The contents changed. Review the new preview before confirming again.');
    }
}

function createBoard(plan, title) {
    const name = clean(title, 100);
    if (!name) throw new Error('A board title is required.');
    const boards = Array.isArray(plan.boards) ? plan.boards : [];
    const matches = boards.filter(b => !b.archived && clean(b.title, 100).toLowerCase() === name.toLowerCase());
    if (matches.length > 1) throw new Error('Multiple boards match. Choose a uniquely named board.');
    const existing = matches[0];
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
    return action?.type?.startsWith('plan_') || ACTIONS_REQUIRING_CONFIRMATION.has(action?.type) || (['update_board', 'update_section'].includes(action?.type) && action.args?.archived === true) || Number(action?.count || 1) > 1;
}

export async function executeKairosAction(action, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be signed in.');
    if (options.ownerId && options.ownerId !== user.uid) throw new Error('The signed-in account changed.');
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new Error('Invalid AI action.');

    const args = action.args && typeof action.args === 'object' ? action.args : Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'type'));
    const type = action.type;
    validateActionArgs(type, args);
    const planId = options.planId || (await latestPlan(user)).id;
    const operationId = options.operationId || makeId('operation');
    const createdAt = options.createdAt ?? Date.now();
    if (typeof operationId !== 'string' || !operationId || operationId.length > 160 || !Number.isFinite(createdAt) || createdAt <= 0) throw new Error('Invalid operation identity.');
    if(type.startsWith('plan_')) {
        const confirmed=await getConfirmedAiAction(planId,user.uid,{type,args},operationId);
        if(confirmed)return confirmed;
        const approval=options.confirmation;
        if(!approval?.command || approval.request!==stableStringify({type,args}))throw Error('A reviewed planning preview is required.');
        if(approval.command.options?.timezone!==await planningTimezone(user))throw Error('Your timezone changed. Review a new preview.');
    }
    const result = await persistAiPlanAction(planId, user.uid, { type, args }, operationId, createdAt, plan => applyKairosAction(plan, type, args, options));
    window.dispatchEvent(new CustomEvent('kairos-data-changed'));
    return result;
}

function applyKairosAction(plan, type, args, options) {
    if(type.startsWith('plan_')) {
        const applied=applyPlanningCommand(plan.data,options.confirmation.command,options.confirmation.expected);
        Object.assign(plan.data,applied.next);
        if(type==='plan_conflicts')applied.result.remainingConflicts=planningConflicts(applied.next,args.from,args.to).length;
        return applied.result;
    }
    if (type === 'set_task_reminder' || type === 'remove_task_reminder') {
        const found = findTask(plan.data, args);
        found.task.reminderMinutes = type === 'remove_task_reminder' ? null : args.minutesBefore;
        if (found.task.recurrence?.exceptions) {
            for (const exception of Object.values(found.task.recurrence.exceptions)) {
                if (exception?.override) delete exception.override.reminderMinutes;
            }
        }
        return { type, task: found.task, board: found.board.title, section: found.section.title };
    }
    if (['delete_board', 'delete_section'].includes(type) || (['update_board', 'update_section'].includes(type) && args.archived === true)) {
        requireReviewedContents(plan.data, { type, args }, options.confirmation);
    }
    if (type === 'update_board' || type === 'delete_board') {
        const board = resolveBoard(plan.data, args), originalTitle = board.title;
        if (type === 'delete_board') {
            const affectedCount = (board.sections || []).reduce((n, section) => n + (section.tasks || []).length, 0);
            plan.data.boards = plan.data.boards.filter(item => item.id !== board.id);
            return { type, board, affectedCount };
        }
        if (args.newTitle !== undefined) {
            const name = clean(args.newTitle, 100);
            if ((plan.data.boards || []).some(item => item.id !== board.id && !item.archived && clean(item.title, 100).toLowerCase() === name.toLowerCase())) throw new Error('Another board already uses that name.');
            board.title = name;
        }
        if (args.archived !== undefined) board.archived = args.archived;
        return { type, board, ...(args.archived !== undefined ? { archiveChanged: args.archived } : {}), ...(args.newTitle !== undefined ? { originalTitle } : {}) };
    }
    if (type === 'create_section') {
        const board = resolveBoard(plan.data, args, false), title = clean(args.title, 100);
        if (!title) throw new Error('A section title is required.');
        const matches = (board.sections || []).filter(section => !section.archived && clean(section.title, 100).toLowerCase() === title.toLowerCase());
        if (matches.length > 1) throw new Error('Multiple sections match. Choose a unique name.');
        const section = matches[0] || { id: makeId('section'), title, archived: false, tasks: [] };
        if (!matches.length) board.sections = [...(board.sections || []), section];
        return { type, section, board: board.title, sectionCreated: !matches.length };
    }
    if (type === 'update_section' || type === 'delete_section') {
        const { board, section } = resolveSection(plan.data, args), originalTitle = section.title;
        if (type === 'delete_section') {
            board.sections = board.sections.filter(item => item.id !== section.id);
            return { type, section, board: board.title, affectedCount: (section.tasks || []).length };
        }
        if (args.newTitle !== undefined) {
            const name = clean(args.newTitle, 100);
            if ((board.sections || []).some(item => item.id !== section.id && !item.archived && clean(item.title, 100).toLowerCase() === name.toLowerCase())) throw new Error('Another section already uses that name.');
            section.title = name;
        }
        if (args.archived !== undefined) section.archived = args.archived;
        return { type, section, board: board.title, ...(args.archived !== undefined ? { archiveChanged: args.archived } : {}), ...(args.newTitle !== undefined ? { originalTitle } : {}) };
    }
    if (type === 'resize_task') {
        if (options.allowDurationChange !== true) throw new Error('An explicit duration change request is required.');
        const found = findTask(plan.data, args), task = found.task;
        if (task.scheduleLocked) throw new Error('This task schedule is locked.');
        if (task.recurrence?.enabled) throw new Error('Use the schedule to change recurring task occurrences.');
        const next = { ...task };
        for (const key of ['date', 'startTime', 'endTime']) if (args[key] !== undefined) next[key] = args[key];
        const scheduled = next.startTime != null && next.startTime !== '';
        let duration = args.durationMinutes;
        if (scheduled) {
            if (duration !== undefined) {
                const end = timeMinutes(next.startTime) + duration;
                if (end >= 1440) throw new Error('Invalid duration: the task must end on the same day.');
                const endTime = String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0');
                if (args.endTime !== undefined && args.endTime !== endTime) throw new Error('Invalid duration: end time and duration do not agree.');
                next.endTime = endTime;
            }
            validateTaskSchedule(next);
            duration = timeMinutes(next.endTime) - timeMinutes(next.startTime);
        } else if (args.endTime !== undefined || duration === undefined) throw new Error('Invalid duration: provide a start time or duration.');
        validateTaskSchedule(next);
        Object.assign(task, next, { estimatedMinutes: duration, lastScheduledMinutes: duration });
        return { type, task, board: found.board.title, section: found.section.title };
    }


    if (type === 'create_board') {
        // Resolve the task first when this is a "move task to a new board"
        // request. This lets us recover from malformed/low-quality board titles
        // returned by the model instead of silently creating a board like "he".
        const moveTaskId = clean(args.moveTaskId, 120);
        const requestedMoveTitle = clean(args.moveTaskTitle, 180);
        let found = null;
        if (moveTaskId || requestedMoveTitle) {
            found = findTask(plan.data, {
                taskId: moveTaskId,
                title: requestedMoveTitle
            });
        }

        let boardTitle = clean(args.title, 100);
        const weakBoardTitle = !boardTitle || boardTitle.length < 3 || /^(new|new board|board|hey|hi)$/i.test(boardTitle);
        if (found && weakBoardTitle) {
            boardTitle = clean(found.task.title, 80) + ' Board';
        }
        if (!boardTitle) throw new Error('A board title is required.');

    const boardCreated = !(plan.data.boards || []).some(board => !board.archived && clean(board.title, 100).toLowerCase() === boardTitle.toLowerCase());
    const board = createBoard(plan.data, boardTitle);

        // Move the existing task into the board's first section.
        if (found) {
            const { section } = findSection(plan.data, { boardId: board.id });
            found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
            section.tasks = Array.isArray(section.tasks) ? section.tasks : [];
            section.tasks.push(found.task);
        }

        return { type, board, boardCreated, movedTask: found?.task || null };
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
        return { type, task, board: board.title, section: section.title };
    }

    if (type === 'update_task') {
        const found = findTask(plan.data, args);
        const originalTitle = found.task.title;
        let finalLocation = found;
        if (['date', 'startTime', 'endTime'].some(key => args[key] !== undefined)) {
            if (found.task.scheduleLocked) throw new Error('This task schedule is locked.');
            if (found.task.recurrence?.enabled) throw new Error('Use the schedule to change recurring task occurrences.');
            const next = { ...found.task, ...args };
            if (args.startTime && args.endTime === undefined) {
                const end = timeMinutes(args.startTime) + taskDurationMinutes(found.task);
                if (end >= 1440) throw new Error('Invalid schedule duration: the task must end on the same day.');
                args = { ...args, endTime: String(Math.floor(end / 60)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0') };
                next.endTime = args.endTime;
            }
            validateTaskSchedule(next);
            if (next.startTime && next.endTime &&
                timeMinutes(next.endTime) - timeMinutes(next.startTime) !== taskDurationMinutes(found.task)) {
                throw new Error('The schedule must preserve the task duration.');
            }
        }
        if (args.newTitle !== undefined) found.task.title = clean(args.newTitle, 180);
        if (args.date !== undefined) found.task.date = clean(args.date, 20) || null;
        if (args.startTime !== undefined) found.task.startTime = clean(args.startTime, 5) || null;
        if (args.endTime !== undefined) found.task.endTime = clean(args.endTime, 5) || null;
        if (args.completed !== undefined) found.task.completed = Boolean(args.completed);
        if (args.archived !== undefined) found.task.archived = Boolean(args.archived);

        if (args.boardId !== undefined || args.sectionId !== undefined || args.board !== undefined || args.section !== undefined) {
            const destination = findSection(plan.data, {
                board: args.board,
                boardId: args.boardId !== undefined ? args.boardId : (args.board === undefined && args.sectionId === undefined ? found.board.id : undefined),
                sectionId: args.sectionId,
                section: args.section
            });
            finalLocation = destination;
            if (destination.board.id !== found.board.id || destination.section.id !== found.section.id) {
                found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
                destination.section.tasks = Array.isArray(destination.section.tasks) ? destination.section.tasks : [];
                destination.section.tasks.push(found.task);
            }
        }

        return {
            type,
            task: found.task,
            ...(args.newTitle !== undefined ? { originalTitle } : {}),
            board: finalLocation.board.title,
            section: finalLocation.section.title
        };
    }

    if (type === 'complete_task') {
        const found = findTask(plan.data, args);
        found.task.completed = true;
        return { type, task: found.task };
    }

    if (type === 'delete_task') {
        const found = findTask(plan.data, args);
        found.section.tasks = found.section.tasks.filter(task => task.id !== found.task.id);
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
        return { type, event };
    }

    if (type === 'update_schedule_event') {
        const event = findScheduleEvent(plan.data, args);
        if (args.newTitle !== undefined) event.title = clean(args.newTitle, 120);
        if (args.category !== undefined) event.category = clean(args.category, 30) || 'other';
        if (args.day !== undefined) event.day = Number(args.day);
        if (args.start !== undefined) event.start = clean(args.start, 10);
        if (args.end !== undefined) event.end = clean(args.end, 10);
        validateEvent(event);
        if (event.day < 0 || event.day > 6 || !event.start || !event.end) throw new Error('Invalid schedule event details.');
        return { type, event };
    }

    if (type === 'delete_schedule_event') {
        const event = findScheduleEvent(plan.data, args);
        plan.data.scheduleEvents = (plan.data.scheduleEvents || []).filter(item => item.id !== event.id);
        return { type, event };
    }

    throw new Error('Unsupported AI action: ' + type);
}

function timeMinutes(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid schedule time.');
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function validateTaskSchedule(args) {
    if (args.date != null && args.date !== '') {
        if (typeof args.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(args.date) ||
            Number.isNaN(Date.parse(args.date)) || new Date(args.date).toISOString().slice(0, 10) !== args.date) throw new Error('Invalid task date.');
    }
    const hasStart = args.startTime != null && args.startTime !== '';
    const hasEnd = args.endTime != null && args.endTime !== '';
    if (hasStart !== hasEnd || ((hasStart || hasEnd) && !args.date)) throw new Error('Invalid task schedule: date and both times are required.');
    if (hasStart && timeMinutes(args.endTime) <= timeMinutes(args.startTime)) throw new Error('Invalid task schedule duration.');
}
function validateEvent(args) {
    if (!Number.isInteger(Number(args.day)) || Number(args.day) < 0 || Number(args.day) > 6 || args.day === null || args.day === '') throw new Error('Invalid schedule event day.');
    if (timeMinutes(args.end) <= timeMinutes(args.start)) throw new Error('Invalid schedule event duration.');
}
function validateActionArgs(type, args) {
    validateActionShape({ type, args });
    if (args.newTitle !== undefined && !clean(args.newTitle)) throw new Error('Invalid task or event title.');
    if (type === 'create_section' && args.boardId === undefined && !clean(args.board, 100)) throw new Error('A board is required.');
    if (type === 'resize_task' && args.endTime === undefined && args.durationMinutes === undefined) throw new Error('Invalid duration change.');
    if (type === 'create_task') validateTaskSchedule(args);
    if (type === 'create_schedule_event') validateEvent(args);
}
