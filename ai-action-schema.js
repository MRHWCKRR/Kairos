export const ACTION_FIELDS = {
    plan_sessions: ['taskId', 'title', 'totalMinutes', 'sessionMinutes', 'from', 'to', 'dayStart', 'dayEnd', 'ordered'],
    plan_carryover: ['taskIds', 'week', 'from', 'to', 'dayStart', 'dayEnd'],
    plan_conflicts: ['from', 'to', 'dayStart', 'dayEnd'],
    create_board: ['title', 'moveTaskId', 'moveTaskTitle'],
    update_board: ['boardId', 'title', 'newTitle', 'archived'],
    delete_board: ['boardId', 'title'],
    create_section: ['title', 'boardId', 'board'],
    update_section: ['sectionId', 'title', 'boardId', 'board', 'newTitle', 'archived'],
    delete_section: ['sectionId', 'title', 'boardId', 'board'],
    create_task: ['title', 'boardId', 'board', 'sectionId', 'section', 'date', 'startTime', 'endTime'],
    update_task: ['taskId', 'title', 'newTitle', 'boardId', 'board', 'sectionId', 'section', 'date', 'startTime', 'endTime', 'completed', 'archived'],
    resize_task: ['taskId', 'title', 'date', 'startTime', 'endTime', 'durationMinutes'],
    complete_task: ['taskId', 'title'],
    delete_task: ['taskId', 'title'],
    set_task_reminder: ['taskId', 'title', 'minutesBefore'],
    remove_task_reminder: ['taskId', 'title'],
    create_schedule_event: ['title', 'category', 'day', 'start', 'end'],
    update_schedule_event: ['eventId', 'title', 'newTitle', 'category', 'day', 'start', 'end'],
    delete_schedule_event: ['eventId', 'title']
};
export const ACTION_TYPES = Object.keys(ACTION_FIELDS);

export function explicitDurationIntent(text) {
    const value = String(text || '').replaceAll('’', "'");
    if (/\b(?:do not|don't|never)\s+(?:\w+\s+){0,3}(?:resize|shorten|lengthen|extend|reduce|increase|decrease|make|set|end|finish|stop)\b/i.test(value)
        || /\b(?:do not|don't|never)\s+(?:\w+\s+){0,3}(?:change|alter)\b[^.!?;]{0,40}\b(?:duration|length|end time)\b/i.test(value)
        || /\b(?:keep|preserve|maintain)\b.{0,30}\b(?:duration|length)\b/i.test(value)
        || /\b(?:remind|reminder|notify|notification)\b/i.test(value)) return false;
    if (/\b(?:start|begin|starting)\b/i.test(value) && !/\b(?:end|finish|stop|duration|length|shorten|lengthen|resize)\b/i.test(value)) return false;
    return /\b(shorten|lengthen|resize)\b/i.test(value)
        || /\b(?:change|set|make|increase|decrease|extend|reduce)\b.{0,60}\b(?:duration|length|minutes?|mins?|hours?|hrs?)\b/i.test(value)
        || /\b(?:end|finish|stop)(?:\s+(?:it|the task|this task))?\s+at\s+(?:\d+(?::\d{2})?(?:\s*[ap]m)?|noon|midnight|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(value)
        || /\b(?:make|set)\b.{0,30}\b(?:last|take)\b.{0,30}\d/i.test(value);
}

export function validateActionShape(action) {
    const fields = ACTION_FIELDS[action?.type], args = action?.args;
    if (!fields || !args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !fields.includes(key))) throw new Error('Unsupported or invalid AI action fields.');
    for (const [key, value] of Object.entries(args)) {
        if (key === 'taskIds') {
            if (!Array.isArray(value) || !value.length || value.length > 40 || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 120)) throw new Error('Invalid task IDs.');
        } else if (['totalMinutes', 'sessionMinutes'].includes(key)) {
            if (!Number.isInteger(value) || value < 15 || value > (key === 'totalMinutes' ? 2400 : 120)) throw new Error('Invalid session effort.');
        } else if (['completed', 'archived', 'ordered'].includes(key)) {
            if (typeof value !== 'boolean') throw new Error('Invalid task status.');
        } else if (key === 'minutesBefore') {
            if (!Number.isInteger(value) || value < 1 || value > 10080) throw new Error('Invalid reminder lead time.');
        } else if (key === 'durationMinutes') {
            if (!Number.isInteger(value) || value < 1 || value >= 1440) throw new Error('Invalid task duration.');
        } else if (key.endsWith('Id')) {
            if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error('Invalid entity ID.');
        } else if (key === 'day') {
            if (!Number.isInteger(value) || value < 0 || value > 6) throw new Error('Invalid schedule event day.');
        } else if (value !== null && typeof value !== 'string') throw new Error('Invalid AI action value.');
    }
    if (action.type.startsWith('plan_')) {
        for (const key of ['from', 'to', ...(args.week !== undefined ? ['week'] : [])]) {
            const value=args[key];
            if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Invalid planning date range.');
        }
        if (args.to < args.from || (Date.parse(args.to)-Date.parse(args.from))/86400000 > 30) throw new Error('Invalid planning range: use at most 31 days.');
        for (const key of ['dayStart','dayEnd']) if (args[key] !== undefined && (typeof args[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(args[key]))) throw new Error('Invalid planning availability.');
        if (action.type === 'plan_sessions' && ((!args.taskId && !args.title?.trim()) || args.totalMinutes === undefined || args.sessionMinutes === undefined)) throw new Error('A task, total effort and session length are required.');
        if (action.type === 'plan_carryover' && args.taskIds === undefined && args.week === undefined) throw new Error('Task IDs or a source week are required.');
    }
    if (args.newTitle !== undefined && (typeof args.newTitle !== 'string' || !args.newTitle.trim())) throw new Error('Invalid entity title.');
    if (action.type === 'create_section' && args.boardId === undefined && !args.board?.trim()) throw new Error('A board is required.');
    if (action.type === 'resize_task' && args.endTime === undefined && args.durationMinutes === undefined) throw new Error('Invalid duration change.');
    if (action.type === 'set_task_reminder' && args.minutesBefore === undefined) throw new Error('A reminder lead time is required.');
    if (action.type === 'resize_task' && ['date','startTime','endTime'].some(key => args[key] !== undefined && (typeof args[key] !== 'string' || !args[key].trim()))) throw new Error('Invalid schedule values for resizing.');
    if (['update_board', 'update_section'].includes(action.type) && args.newTitle === undefined && args.archived === undefined) throw new Error('A name or archive status change is required.');
}

export const ACTION_INSTRUCTIONS = 'Supported actions and allowed args: ' +
    Object.entries(ACTION_FIELDS).map(([type, fields]) => type + ' {' + fields.join(',') + '}').join('; ') +
    '. For splitting an existing assignment use plan_sessions, never multiple create_task actions. Set ordered:true only when the user asks for a numbered sequence or prerequisites; otherwise leave sessions independent. Ordered sessions follow sessionIndex, and readiness depends on earlier active sessions being complete. For moving an ordered session use plan_carryover so affected later sessions are reviewed together; do not issue separate update_task actions to bypass the preview. Locked later sessions remain fixed; if order cannot be preserved, ask the user to review the lock or range. Supply taskId or exact title, totalMinutes and sessionMinutes. Ask for missing effort/session length; do not invent them. For unfinished work carry-over use plan_carryover with explicit taskIds or week (a date in the source week). For fixing clashes use plan_conflicts. These three planning actions ALWAYS require a reviewed preview before Apply, and never mean work is already saved. Use from/to dates (inclusive, at most 31 days) in the profile timezone. Omitted dayStart/dayEnd use 07:00/22:00; state these defaults if relevant. Locks, recurring commitments, preferences and deadlines remain in force. If a deadline is already overdue, explain that the user must review it before a future placement can be made. For "am I on track" and deadline feasibility questions use assignmentFeasibility in the current planning summary with actions: []. State the daily availability assumptions and that assignments are checked separately and may compete for time. A fits result means a complete candidate plan exists, not that saved times are on track or completion is guaranteed. shortfallMinutes is a lower bound; needs-review is not proof of impossibility. No-deadline, outside-range, omitted assignments and no-work must not be described as on track. Suggest plan_carryover with the unfinished unlocked session IDs for a reviewed reschedule; never move work just because the user asked a status question. Questions about deadlines or weekly progress use the current planning summary with actions: []; distinguish dated-work status from historical completion dates. Do not mark a parent assignment complete when its sessions finish. ' +
    'IDs identify exact supplied entities. Omit unknown IDs rather than guessing. Board/section names must match unambiguously. ' +
    'For update_board or delete_board, title selects the existing board; newTitle renames it. For update_section or delete_section, title selects the section, optionally within boardId/board; newTitle renames it. ' +
    'For create_section, title is the new section name and boardId/board is required. Archive/restore a board or section through its update action with archived true/false. Permanent deletions use delete actions and require a preview and confirmation. ' +
    'Ordinary task moves use update_task and preserve duration. Only use resize_task when the user explicitly changes the duration or end time, such as "end at 5pm" or "make it 90 minutes". ' +
    'resize_task requires endTime or durationMinutes (a positive whole number), and may provide date/startTime. An unscheduled task can have its duration set without inventing a schedule. Locked or recurring task schedules cannot be edited in chat. ' +
    'Task reminders use set_task_reminder with minutesBefore (whole minutes, 1 to 10080) or remove_task_reminder. When the last confirmed target kind is reminder, its ID is a taskId: implicit remove/delete/cancel requests remove the reminder, never the task. They use the task start time in the profile timezone and follow task rescheduling; do not create a separate event. For recurring tasks this changes the series reminder. Absolute reminder dates/times, unrelated standalone reminders, email/SMS and background delivery are unsupported; explain that and offer a relative task reminder. If the target or lead time is missing, ask a clarification with actions: []. Saving does not grant browser notification permission. ' +
    'If a target is unclear, ask a specific clarification with actions: []. Do not silently substitute a different entity.';
