export function createTaskArchiveHandlers({findSection,restoreArchived,confirmAction,updatePlanInFirestore,renderApp}) {
    return async function handleClick(e) {
        const restoreTaskBtn = e.target.closest('.archive-restore-task-btn');
        if (restoreTaskBtn) {
            const found = findSection(restoreTaskBtn.getAttribute('data-section-id'));
            const task = found ? found.section.tasks.find(t => t.id === restoreTaskBtn.getAttribute('data-task-id')) : null;
            if (task) await restoreArchived({kind:'task',taskId:task.id,sectionId:found.section.id});
            return true;
        }

        const deleteTaskForeverBtn = e.target.closest('.archive-delete-task-btn');
        if (deleteTaskForeverBtn) {
            if (await confirmAction('Permanently delete this task? This cannot be undone.')) {
                const found = findSection(deleteTaskForeverBtn.getAttribute('data-section-id'));
                if (found) {
                    found.section.tasks = found.section.tasks.filter(t => t.id !== deleteTaskForeverBtn.getAttribute('data-task-id'));
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const taskDeleteBtn = e.target.closest('.task-delete-btn');
        if (taskDeleteBtn) {
            const sectionId = taskDeleteBtn.getAttribute('data-section');
            const taskId = taskDeleteBtn.getAttribute('data-task');
            const found = findSection(sectionId);
            if (found) {
                const task = found.section.tasks.find(t => t.id === taskId);
                if (task) task.archived = true;
                updatePlanInFirestore();
                renderApp();
            }
            return true;
        }
        return false;
    };
}
