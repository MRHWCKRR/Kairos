export const ACTION_FIELDS = {
    plan_undo: [],
    plan_assignments: ['assignmentIds', 'from', 'to', 'dayStart', 'dayEnd', 'gapMinutes', 'dailyLimitMinutes', 'checkOnly', 'compareAlternatives', 'alternative', 'focusAssignmentIds'],
    plan_sessions: ['taskId', 'title', 'totalMinutes', 'sessionMinutes', 'from', 'to', 'dayStart', 'dayEnd', 'gapMinutes', 'dailyLimitMinutes', 'ordered'],
    plan_carryover: ['taskIds', 'week', 'from', 'to', 'dayStart', 'dayEnd', 'gapMinutes', 'dailyLimitMinutes'],
    plan_conflicts: ['from', 'to', 'dayStart', 'dayEnd', 'gapMinutes', 'dailyLimitMinutes'],
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
    create_schedule_event: ['intervalWeeks','anchorDate','startDate','endDate','title', 'category', 'date', 'day', 'start', 'end', 'allDay', 'transparent'],
    update_schedule_event: ['intervalWeeks','anchorDate','startDate','endDate','occurrenceDate','restoreOccurrence','eventId', 'title', 'newTitle', 'category', 'date', 'day', 'start', 'end', 'allDay', 'transparent'],
    delete_schedule_event: ['occurrenceDate','eventId', 'title']
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
        if (key === 'taskIds' || key === 'assignmentIds' || key === 'focusAssignmentIds') {
            if (!Array.isArray(value) || !value.length || value.length > (key !== 'taskIds' ? 10 : 40) || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 120)) throw new Error('Invalid task or assignment IDs.');
        } else if (key === 'alternative') {
            if (!['daily-limit','gap','hours','focus'].includes(value)) throw new Error('Invalid planning alternative.');
        } else if (key === 'dailyLimitMinutes') {
            if (!Number.isInteger(value) || value !== 0 && (value < 15 || value > 1440)) throw new Error('Invalid daily assignment-work limit.');
        } else if (key === 'gapMinutes') {
            if (!Number.isInteger(value) || ![0,5,10,15].includes(value)) throw new Error('Invalid session gap.');
        } else if (['totalMinutes', 'sessionMinutes'].includes(key)) {
            if (!Number.isInteger(value) || value < 15 || value > (key === 'totalMinutes' ? 2400 : 120)) throw new Error('Invalid session effort.');
        } else if (['completed', 'archived', 'ordered', 'checkOnly', 'compareAlternatives', 'allDay', 'transparent','restoreOccurrence'].includes(key)) {
            if (typeof value !== 'boolean') throw new Error('Invalid task status.');
        } else if (key === 'minutesBefore') {
            if (!Number.isInteger(value) || value < 1 || value > 10080) throw new Error('Invalid reminder lead time.');
        } else if (key === 'durationMinutes') {
            if (!Number.isInteger(value) || value < 1 || value >= 1440) throw new Error('Invalid task duration.');
        } else if (key.endsWith('Id')) {
            if (typeof value !== 'string' || !value.trim() || value.length > (key==='eventId'?160:120)) throw new Error('Invalid entity ID.');
        } else if (key === 'intervalWeeks') {
            if (![1,2].includes(value)) throw Error('Choose a repeat interval of 1 or 2 weeks.');
        } else if (key === 'day') {
            if (!Number.isInteger(value) || value < 0 || value > 6) throw new Error('Invalid schedule event day.');
        } else if (value !== null && typeof value !== 'string') throw new Error('Invalid AI action value.');
    }
    if(['create_schedule_event','update_schedule_event','delete_schedule_event'].includes(action.type)){
        const creating=action.type==='create_schedule_event';
        if(['intervalWeeks','anchorDate'].some(k=>args[k]!==undefined)&&(args.date!==undefined||args.occurrenceDate!==undefined))throw Error('Repeat interval and reference date apply to an entire series only.');
        if(args.anchorDate!==undefined&&(typeof args.anchorDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(args.anchorDate)||!Number.isFinite(Date.parse(args.anchorDate+'T12:00:00Z'))||new Date(args.anchorDate+'T12:00:00Z').toISOString().slice(0,10)!==args.anchorDate))throw Error('Choose a real reference occurrence date.');
        if(creating&&args.intervalWeeks===2&&!args.anchorDate)throw Error('Every 2 weeks requires a reference occurrence date.');
        if(args.date!==undefined&&args.day!==undefined)throw Error('Choose a single event date or a weekly weekday, not both.');
        for(const value of [args.date,args.occurrenceDate,...[args.startDate,args.endDate].filter(v=>v!==null)].filter(v=>v!==undefined))if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid event date.');
        if(['startDate','endDate'].some(k=>args[k]!==undefined)&&(args.date!==undefined||args.occurrenceDate!==undefined))throw Error('First and last dates apply to the entire weekly series only.');if(args.startDate&&args.endDate&&args.startDate>args.endDate)throw Error('The last date must follow the first date.');
        if(args.occurrenceDate!==undefined&&args.day!==undefined)throw Error('A single occurrence uses a date, not a weekday.');
        if(args.restoreOccurrence!==undefined&&(args.restoreOccurrence!==true||!args.occurrenceDate||['newTitle','category','date','day','start','end','allDay','transparent'].some(k=>args[k]!==undefined)))throw Error('Restore needs only the original occurrence date and event identity.');
        for(const key of ['start','end'])if(args[key]!==undefined&&(typeof args[key]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(args[key])))throw Error('Invalid event time.');
        for(const key of ['title','newTitle','category'])if(args[key]!==undefined&&(typeof args[key]!=='string'||!args[key].trim()||args[key].length>(key==='category'?30:180)))throw Error('Invalid event title or category.');
        if(args.allDay===true&&['start','end'].some(key=>args[key]!==undefined&&args[key]!=='00:00'))throw Error('All-day events use midnight boundaries.');
        if(creating&&(!args.title||args.date===undefined&&args.day===undefined||args.allDay!==true&&(!args.start||!args.end)))throw Error('A title, date or weekday, and both times (or All day) are required.');
        if(!creating&&!args.eventId&&!args.title)throw Error('An exact event ID or title is required.');
        if(action.type==='update_schedule_event'&&!['intervalWeeks','anchorDate','startDate','endDate','newTitle','category','date','day','start','end','allDay','transparent','restoreOccurrence'].some(key=>args[key]!==undefined))throw Error('Choose the event fields to change.');
    }
    if (action.type.startsWith('plan_') && action.type !== 'plan_undo') {
        for (const key of ['from', 'to', ...(args.week !== undefined ? ['week'] : [])]) {
            const value=args[key];
            if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) throw new Error('Invalid planning date range.');
        }
        if (args.to < args.from || (Date.parse(args.to)-Date.parse(args.from))/86400000 > 30) throw new Error('Invalid planning range: use at most 31 days.');
        for (const key of ['dayStart','dayEnd']) if (args[key] !== undefined && (typeof args[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(args[key]))) throw new Error('Invalid planning availability.');
        if (action.type === 'plan_sessions' && ((!args.taskId && !args.title?.trim()) || args.totalMinutes === undefined || args.sessionMinutes === undefined)) throw new Error('A task, total effort and session length are required.');
        if (action.type === 'plan_carryover' && args.taskIds === undefined && args.week === undefined) throw new Error('Task IDs or a source week are required.');
        if (action.type === 'plan_assignments' && args.assignmentIds === undefined) throw new Error('Assignment IDs are required.');
    }
    if (action.type==='plan_assignments') {
        if(args.compareAlternatives&&(args.alternative!==undefined||args.checkOnly===false))throw new Error('Compare alternatives is a read-only check, not a selected plan.');
        if(args.focusAssignmentIds&&(args.focusAssignmentIds.some(id=>!args.assignmentIds.includes(id))||!(args.compareAlternatives||args.alternative==='focus')))throw new Error('Choose priority assignments from the selected comparison.');
        if(args.alternative==='focus'&&!args.focusAssignmentIds)throw new Error('Choose the assignments to prioritise.');
    }
    if (args.newTitle !== undefined && (typeof args.newTitle !== 'string' || !args.newTitle.trim())) throw new Error('Invalid entity title.');
    if (action.type === 'create_section' && args.boardId === undefined && !args.board?.trim()) throw new Error('A board is required.');
    if (action.type === 'resize_task' && args.endTime === undefined && args.durationMinutes === undefined) throw new Error('Invalid duration change.');
    if (action.type === 'set_task_reminder' && args.minutesBefore === undefined) throw new Error('A reminder lead time is required.');
    if (action.type === 'resize_task' && ['date','startTime','endTime'].some(key => args[key] !== undefined && (typeof args[key] !== 'string' || !args[key].trim()))) throw new Error('Invalid schedule values for resizing.');
    if (['update_board', 'update_section'].includes(action.type) && args.newTitle === undefined && args.archived === undefined) throw new Error('A name or archive status change is required.');
}

export const ACTION_INSTRUCTIONS = 'Supported actions and allowed args: ' +
    'Native repeating events accept intervalWeeks:1 (weekly, also the omitted default) or 2 (fortnightly). Every 2 weeks requires anchorDate:YYYY-MM-DD on the event weekday: a known occurrence that fixes alternating weeks, independent of startDate/endDate. Ask for the reference occurrence date if missing or ambiguous; do not invent the phase. Reference dates are not lower bounds; earlier matching weeks occur unless startDate limits them. Preserve cadence on ordinary updates. Only entire series accept intervalWeeks/anchorDate; restore saved exceptions before changing cadence, reference or weekday. ' +
    Object.entries(ACTION_FIELDS).map(([type, fields]) => type + ' {' + fields.join(',') + '}').join('; ') +
    '. Weekly series accept optional inclusive startDate/endDate; null explicitly clears a limit. Limits follow original occurrence dates, including moved exceptions; shortening retains out-of-range exceptions as inactive and expansion reactivates them. Set bounds only for an entire weekly series, never an occurrence or one-off. Review discloses affected exceptions; do not claim they are deleted. For a single weekly event change supply occurrenceDate as its ORIGINAL weekly date; date is the new display date for a move. delete_schedule_event with occurrenceDate skips only that occurrence; without it deletes the entire series. update_schedule_event with occurrenceDate and restoreOccurrence:true restores the series occurrence and accepts no other changes. For requests such as this Friday or just this week, resolve the original date from profile-local context; ask if missing or ambiguous. Never substitute a moved display date for the original date. Series edits preserve individual exceptions; weekday or cadence changes require restoring exceptions first. For questions like what would make this fit, use one plan_assignments action with compareAlternatives:true and checkOnly:true. This compares bounded validated choices without changing anything. Never invent alternative results or claim they are optimal. To review a user-chosen comparison option, use plan_assignments with alternative set to daily-limit, gap, hours, or focus, using the same original IDs/range/base settings. The app computes the changed settings; do not pre-apply a suggested change to the base arguments. For focus, supply focusAssignmentIds only from assignments the user explicitly chooses, as a subset of assignmentIds. Never choose priorities for the user. Extra hours are hypothetical availability requiring review and Apply. Saved defaults and deadlines stay unchanged. Comparison reports finish without Apply; ask which option to review. Planning actions accept optional dailyLimitMinutes: integer 0 (no limit) or 15-1440. Omit dailyLimitMinutes to inherit the saved planning default from the current planning summary; use explicit 0 only when the user requests no daily limit. This per-plan limit counts dated assignment sessions across all assignments, including completed and locked work; gaps do not count. Other tasks still block time but do not consume the assignment budget. Never infer assignment work from titles. Explain when a daily limit prevents work fitting. Planning actions accept optional gapMinutes: 0, 5, 10 or 15. Omit gapMinutes to inherit the saved planning default; use explicit 0 only when the user requests no added gap. Never invent a gap. Gaps apply before or after neighbouring scheduled commitments and use elapsed minutes across timezone transitions. They stay as free time and do not create break tasks. Explain when requested spacing prevents sessions from fitting; free-minute totals are an upper bound before spacing. For planning several assignments together, use exactly one plan_assignments action with 1-10 exact parent assignmentIds, from/to (at most 31 days), and optionally explicit daily hours. Use checkOnly:true for capacity or feasibility questions; omit it or use false only when the user asks for a reviewed schedule. Reuse existing unfinished sessions; never invent effort or create duplicate sessions to fill missing data. If assignment IDs are missing or ambiguous in the current context, ask for clarification. If sessions are missing, explain that they must be created/reviewed first. The shared check respects deadlines, session order, locks and saved work hours. Never infer that several assignments fit together from their separate capacity results. Partial plans disclose assignments left unchanged and require review before Apply; not placed is not proof that no alternative arrangement fits. Do not split a combined request into multiple carry-over, plan_sessions or update_task actions. For splitting an existing assignment use plan_sessions, never multiple create_task actions. Set ordered:true only when the user asks for a numbered sequence or prerequisites; otherwise leave sessions independent. Ordered sessions follow sessionIndex, and readiness depends on earlier active sessions being complete. For moving an ordered session use plan_carryover so affected later sessions are reviewed together; do not issue separate update_task actions to bypass the preview. Locked later sessions remain fixed; if order cannot be preserved, ask the user to review the lock or range. Supply taskId or exact title, totalMinutes and sessionMinutes. Ask for missing effort/session length; do not invent them. For unfinished work carry-over use plan_carryover with explicit taskIds or week (a date in the source week). For fixing clashes use plan_conflicts. Session, carry-over and conflict scheduling actions ALWAYS require a reviewed preview before Apply, and never mean work is already saved. Use from/to dates (inclusive, at most 31 days) in the profile timezone. Omit dayStart/dayEnd to use saved weekly availability from the planning summary; without saved hours the fallback is 07:00/22:00. Supply explicit daily hours only when the user requests an override. State the actual availability used, including unavailable days and separate windows; never invent hours or alter saved settings through a planning action. Locks, recurring commitments, preferences and deadlines remain in force. If a deadline is already overdue, explain that the user must review it before a future placement can be made. For a capacity/status question with a requested daily limit, gap, custom work hours or custom date range, use plan_assignments with checkOnly:true, even for one assignment; never reuse a default-capacity summary with different assumptions. For on-track or deadline feasibility questions about a single assignment using the saved default assumptions, use assignmentFeasibility in the current planning summary with actions: []. State the daily availability assumptions and that assignments are checked separately and may compete for time. A fits result means a complete candidate plan exists, not that saved times are on track or completion is guaranteed. shortfallMinutes is a lower bound; needs-review is not proof of impossibility. No-deadline, outside-range, omitted assignments and no-work must not be described as on track. Suggest plan_carryover with the unfinished unlocked session IDs for a reviewed reschedule; never move work just because the user asked a status question. Lists of upcoming deadlines and dated-week progress use the current planning summary with actions: []; distinguish dated-work status from historical completion dates. Do not mark a parent assignment complete when its sessions finish. ' +
    'For an explicit request to undo the last applied planning change, use plan_undo with args: {}. The app resolves its saved receipt and always requires a reviewed Undo preview. Never invent a source ID or inverse fields. Undo preserves notes, checklists and completion; completed newly created sessions require manual review. Older changes without retained Undo history cannot be reconstructed. ' +
    'IDs identify exact supplied entities. Omit unknown IDs rather than guessing. Board/section names must match unambiguously. ' +
    'For update_board or delete_board, title selects the existing board; newTitle renames it. For update_section or delete_section, title selects the section, optionally within boardId/board; newTitle renames it. ' +
    'For create_section, title is the new section name and boardId/board is required. Archive/restore a board or section through its update action with archived true/false. Permanent deletions use delete actions and require a preview and confirmation. ' +
    'Ordinary task moves use update_task and preserve duration. Only use resize_task when the user explicitly changes the duration or end time, such as "end at 5pm" or "make it 90 minutes". ' +
    'resize_task requires endTime or durationMinutes (a positive whole number), and may provide date/startTime. An unscheduled task can have its duration set without inventing a schedule. Locked or recurring task schedules cannot be edited in chat. ' +
    'Task reminders use set_task_reminder with minutesBefore (whole minutes, 1 to 10080) or remove_task_reminder. When the last confirmed target kind is reminder, its ID is a taskId: implicit remove/delete/cancel requests remove the reminder, never the task. They use the task start time in the profile timezone and follow task rescheduling; do not create a separate event. For recurring tasks this changes the series reminder. Absolute reminder dates/times, unrelated standalone reminders, email/SMS and background delivery are unsupported; explain that and offer a relative task reminder. If the target or lead time is missing, ask a clarification with actions: []. Saving does not grant browser notification permission. ' +
    'Native calendar events use create_schedule_event, update_schedule_event or delete_schedule_event and always require review. For a one-off appointment supply date: YYYY-MM-DD; for weekly commitments supply day: integer Sunday=0 through Saturday=6. Never supply both or default a missing date/weekday. Resolve relative dates from the current profile-local date/time supplied in context, never older conversation dates. Ask if the date or target is ambiguous. New timed events require both start and end in HH:MM; ask for the missing end time instead of inventing duration. All-day events use allDay:true and omit times (or use 00:00 for both). Timed ends earlier than starts mean next day; equal timed boundaries are invalid. transparent:true marks free time, false busy. Do not invent unrelated event fields. For updates, use exact eventId or an unambiguous full current title; newTitle renames it. A date-only move preserves times; a start-only timed move preserves duration including overnight. Supply an explicit end only when the user asks to resize. Changing all-day to timed requires allDay:false and both times. Supplying date converts to a one-off event; supplying day converts to weekly only on an explicit repeat request. Imported/read-only calendar events cannot be edited or deleted; explain how to refresh or remove their source in Calendars. Task overlaps are shown in the event preview; saving does not move tasks. Never claim success before confirmation and execution. ' +
    'If a target is unclear, ask a specific clarification with actions: []. Do not silently substitute a different entity.';

// Scope is explicit: moved dates never replace original weekly identity.
