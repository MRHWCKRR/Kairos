import {applyAiTaskMutation} from './ai-task-commands.js?v=5';
import {plannerChangeRows} from './planner-changes.js?v=2';
import {applyTaskListCommand} from './task-list-model.js?v=23';
import {planningUndoPreview} from './planning-undo.js?v=5';
import {savedPlanningPreferences,planningPreferencesText} from './planning-preferences.js?v=5';
import {savedWeeklyAvailability} from './weekly-availability.js?v=1';
import { auth, db } from './firebase.js?v=1';
import { persistAiPlanAction, getConfirmedAiAction, applyStoredPlanningUndo } from './plan-store.js?v=23';
import { validateActionShape } from './ai-action-schema.js?v=11';
import { stableStringify, planState } from './plan-merge.js?v=1';
import {previewAiPlanning,resolveAiPlanningTimezone} from './ai-planning.js?v=15';
import {planningConflicts,planningGapText,planningDailyLimitText} from './planning-slots.js?v=6';
import {applyPlanningCommand} from './planning-commands.js?v=11';
import {
    collection, getDocs, query, where, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ACTIONS_REQUIRING_CONFIRMATION = new Set(['delete_task', 'delete_schedule_event', 'delete_board', 'delete_section']);

const aiActionResult=(type,result)=>result&&type==='plan_assignments'?{...result,combinedPlan:true}:result;

const clean = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const makeId = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

async function planningPreferences(user) {
    const snapshot=await getDoc(doc(db,'users',user.uid));
    if(auth.currentUser?.uid!==user.uid)throw Error('The signed-in account changed.');
    return {timezone:resolveAiPlanningTimezone(snapshot.data(),user.uid),weeklyAvailability:savedWeeklyAvailability(snapshot.data()),planningPreferences:savedPlanningPreferences(snapshot.data())};
}

async function planningTimezone(user){return (await planningPreferences(user)).timezone}

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
    const id = clean(args.eventId, 160);
    const title = clean(args.title, 120).toLowerCase();
    const matches = events.filter(ev =>
        id ? String(ev.id) === id :
        (title && clean(ev.title, 120).toLowerCase() === title)
    );
    if (matches.length !== 1) throw new Error(matches.length ? 'Multiple schedule events match. Please specify the event name more precisely.' : 'Schedule event not found.');
    if(matches[0].readOnly===true||matches[0].calendarSourceId)throw new Error('Imported calendar events are read-only. Refresh or remove their calendar source.');
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
        const preferences=await planningPreferences(user),timezone=preferences.timezone;
        if(action.type==='plan_undo'){const proposal=planningUndoPreview(data,null,timezone);return {action,approval:{request:stableStringify(action),command:proposal.command,expected:proposal.expected},summary:{kind:'planning-undo',title:'Undo last planning change',rows:proposal.rows,timezone,notice:proposal.notice}}}
        const proposal=previewAiPlanning(planState(data),action,preferences);
        return {action,approval:proposal.command?{request:stableStringify(action),command:proposal.command,expected:proposal.expected}:null,summary:{kind:'planning',title:action.type==='plan_sessions'?'New work sessions':action.type==='plan_assignments'?'Combined assignment plan':'Schedule changes',rows:proposal.rows,timezone,options:proposal.command?.options||proposal.options,...(proposal.capacity?{capacity:proposal.capacity}:{}),remainingConflicts:proposal.remainingConflicts||0,notice:[proposal.notice,planningPreferencesText(preferences.planningPreferences,proposal.command?.options||proposal.options),proposal.command?planningDailyLimitText(proposal.command.options)+' '+planningGapText(proposal.command.options):'',proposal.command?.ordered!==undefined?'Session order: '+(proposal.command.ordered?'numbered sequence (earlier work first).':'independent placement.'):''].filter(Boolean).join(' ')}};
    }
    const before=planState(data),next=structuredClone(before);
    const detailed=['delete_task','delete_schedule_event','delete_board','delete_section'].includes(action.type)||(['update_board','update_section'].includes(action.type)&&action.args.archived===true);
    const base=detailed?actionPreview(before,action):null,pinned=base?.action||structuredClone(action);
    let allowCompleted=false;
    if(['update_task','resize_task'].includes(pinned.type)){
        const userSnapshot=await getDoc(doc(db,'users',user.uid));
        if(auth.currentUser?.uid!==user.uid)throw Error('The signed-in account changed.');
        allowCompleted=userSnapshot.data()?.settings?.planning?.rescheduleCompleted===true;
    }
    const simulated=applyKairosAction({data:next,allowCompleted},pinned.type,pinned.args,{...options,confirmation:base?.approval});
    const rows=plannerChangeRows(before,next);
    return {action:pinned,approval:{...base?.approval,reviewedState:stableStringify(before)},summary:{...(base?.summary||{kind:'changes',title:simulated.task?.title||simulated.event?.title||simulated.section?.title||simulated.board?.title||action.type.replace(/_/g,' ')}),rows}};
}

export async function confirmedKairosAction(action, options) {
    const user = auth.currentUser;
    if (!user || options.ownerId !== user.uid) throw new Error('The signed-in account changed.');
    return aiActionResult(action.type,await getConfirmedAiAction(options.planId, user.uid, action, options.operationId));
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
    return typeof action?.type==='string';
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
    if(type==='plan_assignments'&&(args.checkOnly||args.compareAlternatives))throw Error('A check-only request cannot save planning changes.');
    if(type.startsWith('plan_')) {
        const confirmed=await getConfirmedAiAction(planId,user.uid,{type,args},operationId);
        if(confirmed)return aiActionResult(type,confirmed);
        const approval=options.confirmation;
        if(!approval?.command || approval.request!==stableStringify({type,args}))throw Error('A reviewed planning preview is required.');
        if(approval.command.options?.timezone!==await planningTimezone(user))throw Error('Your timezone changed. Review a new preview.');
    }
    const result = await persistAiPlanAction(planId, user.uid, { type, args }, operationId, createdAt, plan => applyKairosAction(plan, type, args, options),{manualScheduling:['update_task','resize_task'].includes(type),planningOptions:type.startsWith('plan_')?options.confirmation?.command?.options:null,...(type==='plan_undo'?{undoSourceOperationId:options.confirmation?.command?.sourceOperationId,undoTimezone:options.confirmation?.command?.options?.timezone}:{})});
    window.dispatchEvent(new CustomEvent('kairos-data-changed'));
    return aiActionResult(type,result);
}

function applyKairosAction(plan, type, args, options) {
    if(options.confirmation?.reviewedState&&options.confirmation.reviewedState!==stableStringify(plan.data))throw Error('The planner changed after this preview. Review a fresh preview.');
    if(type==='plan_undo')return applyStoredPlanningUndo(plan,options.confirmation.command,options.confirmation.expected);
    if(type.startsWith('plan_')) {
        const applied=applyPlanningCommand(plan.data,options.confirmation.command,options.confirmation.expected);
        Object.assign(plan.data,applied.next);
        if(type==='plan_conflicts')applied.result.remainingConflicts=planningConflicts(applied.next,args.from,args.to).length;
        return applied.result;
    }
    if(['update_task','resize_task','set_task_reminder','remove_task_reminder'].includes(type)){
        const found=findTask(plan.data,args);
        let destination;
        if(type==='update_task'&&['boardId','sectionId','board','section'].some(key=>args[key]!==undefined)){
            const dest=findSection(plan.data,{board:args.board,boardId:args.boardId!==undefined?args.boardId:args.board===undefined&&args.sectionId===undefined?found.board.id:undefined,sectionId:args.sectionId,section:args.section});
            destination={boardId:dest.board.id,sectionId:dest.section.id};
        }
        const applied=applyAiTaskMutation(plan.data,{type,args,target:{taskId:found.task.id},destination},{allowDurationChange:options.allowDurationChange===true,allowCompleted:plan.allowCompleted===true});
        Object.assign(plan.data,applied.next);return applied.result;
    }
    if (['delete_board', 'delete_section'].includes(type) || (['update_board', 'update_section'].includes(type) && args.archived === true)) {
        requireReviewedContents(plan.data, { type, args }, options.confirmation);
    }
    if (type === 'update_board' || type === 'delete_board') {
        const board = resolveBoard(plan.data, args), originalTitle = board.title;
        if (type === 'delete_board') {
            const affectedCount = (board.sections || []).reduce((n, section) => n + (section.tasks || []).length, 0);
            board.archived = true;
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
            section.archived = true;
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

        let movedTask=null;
        if(found){
            const {section}=findSection(plan.data,{boardId:board.id});
            const applied=applyAiTaskMutation(plan.data,{type:'move_task',args:{},target:{taskId:found.task.id},destination:{boardId:board.id,sectionId:section.id}});
            Object.assign(plan.data,applied.next);movedTask=applied.result.task;
        }
        return {type,board:plan.data.boards.find(item=>item.id===board.id),boardCreated,movedTask};
    }

    if (type === 'create_task') {
        const {board,section}=findSection(plan.data,args),task={id:makeId('task'),title:clean(args.title,180)};
        for(const key of ['date','startTime','endTime'])if(args[key]!=null&&args[key]!=='')task[key]=args[key];
        const applied=applyTaskListCommand(plan.data,{type:'create_task',target:{boardId:board.id,sectionId:section.id},task},{boardId:board.id,sectionId:section.id});
        Object.assign(plan.data,applied.next);return applied.result;
    }

    if (type === 'complete_task' || type === 'delete_task') {
        const found=findTask(plan.data,args),archiving=type==='delete_task',command={type:archiving?'archive_task':'complete_task',target:{taskId:found.task.id},value:true};
        const applied=applyTaskListCommand(plan.data,command,{boardId:found.board.id,sectionId:found.section.id,value:found.task[archiving?'archived':'completed']===true});
        Object.assign(plan.data,applied.next);return {...applied.result,type};
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
