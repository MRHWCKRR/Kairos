const SCHEDULE_SHELL=`<!-- Schedule Page: Schedule 3.0 calendar-first workspace -->
            <div id="schedule-page" class="page-view schedule-page">
                <div id="schedule-toolbar" class="schedule-toolbar" aria-label="Schedule controls"></div>
                <div class="schedule-workspace-shell">
                    <aside id="schedule-backlog" class="schedule-backlog" aria-label="Unscheduled tasks"></aside>
                    <section id="schedule-calendar" class="schedule-calendar" aria-label="Schedule calendar"></section>
                    <aside id="schedule-inspector" class="schedule-inspector" aria-label="Selected schedule item" hidden></aside>
                </div>
                <div id="schedule-ai-review" class="schedule-ai-review" hidden></div>
            </div>

             <!-- Calendar and Routines -->`;

const BRIDGE=`
    // Schedule 3.0 bridge: exposes existing in-memory plan state without moving Firebase ownership.
    window.__kairosScheduleBridge = {
        getBoards: () => boardsData,
        getScheduleEvents: () => scheduleData,
        getScheduleCategories: () => SCHEDULE_CATEGORIES,
        getLocale: () => getLocale(userSettings.accessibility.language || 'en'),
        getTimeFormat: () => userSettings.accessibility.timeFormat,
        persistPlan: async () => {
            if (!auth.currentUser) throw new Error('You must be signed in.');
            if (!currentPlanDocId) {
                await savePlanToFirestore(boardsData);
                if (!currentPlanDocId) throw new Error('Could not create a plan document.');
                return;
            }
            await updateDoc(doc(db, 'study_plans', currentPlanDocId), {
                boards: boardsData,
                dayInsights: dayInsights,
                scheduleEvents: scheduleData
            });
        },
        openRecurringEventEditor: (eventId = null) => openScheduleModal(eventId),
        refreshAppViews: () => {
            renderBoardsGrid();
            renderFocusMode();
            renderCalendar();
            updateRoutineStats();
            updateWhatsNextWidget();
        }
    };
    window.dispatchEvent(new CustomEvent('kairos-schedule-bridge-ready'));

`;

export function injectScheduleShell(html){
  return html.replace(/<!-- Schedule Page:[\s\S]*?<!-- Calendar and Routines -->/,SCHEDULE_SHELL);
}

export function injectScheduleAssets(html){
  let out=html;
  if(!out.includes('schedule-workspace.css')) out=out.replace('</head>','    <link rel="stylesheet" href="schedule-workspace.css?v=1">\n</head>');
  if(!out.includes('schedule-workspace.js')) out=out.replace('</body>','    <script type="module" src="schedule-workspace.js?v=1"></script>\n</body>');
  return out;
}

export function injectScheduleBridge(js){
  if(js.includes('window.__kairosScheduleBridge =')) return js;
  return js.replace('    // --- 14 Bedtime Reminder Engine ---',BRIDGE+'    // --- 14 Bedtime Reminder Engine ---');
}

export function rewriteRelaySource(source){
  return source.replaceAll('https://kairos.kirosapp.workers.dev','/api/ai');
}
