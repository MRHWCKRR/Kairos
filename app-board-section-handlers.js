export function createBoardSectionHandlers({getBoards,setBoards,getPlanId,findBoard,findSection,confirmAction,requestName,tr,restoreArchived,savePlanToFirestore,updatePlanInFirestore,renderApp}) {
    return async function handleClick(e) {
        const restoreBoardBtn = e.target.closest('.archive-restore-board-btn');
        if (restoreBoardBtn) {
            const board = findBoard(restoreBoardBtn.getAttribute('data-board-id'));
            if (board) await restoreArchived({kind:'board',boardId:board.id});
            return true;
        }

        const deleteBoardForeverBtn = e.target.closest('.archive-delete-board-btn');
        if (deleteBoardForeverBtn) {
            if (await confirmAction('Permanently delete this board and everything in it? This cannot be undone.')) {
                const boardId = deleteBoardForeverBtn.getAttribute('data-board-id');
                setBoards(getBoards().filter(b => b.id !== boardId));
                updatePlanInFirestore();
                renderApp();
            }
            return true;
        }

        const restoreSectionBtn = e.target.closest('.archive-restore-section-btn');
        if (restoreSectionBtn) {
            const found = findSection(restoreSectionBtn.getAttribute('data-section-id'));
            if (found) await restoreArchived({kind:'section',boardId:found.board.id,sectionId:found.section.id});
            return true;
        }

        const deleteSectionForeverBtn = e.target.closest('.archive-delete-section-btn');
        if (deleteSectionForeverBtn) {
            if (await confirmAction('Permanently delete this section and its tasks? This cannot be undone.')) {
                const boardId = deleteSectionForeverBtn.getAttribute('data-board-id');
                const sectionId = deleteSectionForeverBtn.getAttribute('data-section-id');
                const board = findBoard(boardId);
                if (board) {
                    board.sections = board.sections.filter(s => s.id !== sectionId);
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const sectionDeleteBtn = e.target.closest('.section-delete-btn');
        if (sectionDeleteBtn) {
            const block = sectionDeleteBtn.closest('.board-section-block');
            const boardId = block.getAttribute('data-board-id');
            const sectionId = block.getAttribute('data-section-id');
            if (await confirmAction('Archive this section? Its tasks will stay visible on the Calendar and can be restored from the Archive.')) {
                const board = findBoard(boardId);
                if (board) {
                    const section = board.sections.find(s => s.id === sectionId);
                    if (section) section.archived = true;
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const addSectionBtn = e.target.closest('.add-section-btn');
        if (addSectionBtn) {
            const boardId = addSectionBtn.getAttribute('data-board-id');
            let board = findBoard(boardId);
            if (board) {
                const title = await requestName(tr('new_section_prompt'));
                board = findBoard(boardId);
                if (!board) return true;
                if (title && title.trim()) {
                    board.sections.push({ id: 'sec-' + Date.now(), title: title.trim(), tasks: [], archived: false });
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const sectionRenameBtn = e.target.closest('.section-rename-btn');
        if (sectionRenameBtn) {
            const block = sectionRenameBtn.closest('.board-section-block');
            let found = findSection(block.getAttribute('data-section-id'));
            if (found) {
                const title = await requestName(tr('rename_section_prompt'), found.section.title);
                found = findSection(block.getAttribute('data-section-id'));
                if (!found) return true;
                if (title && title.trim()) {
                    found.section.title = title.trim();
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const boardRenameBtn = e.target.closest('.board-rename-btn');
        if (boardRenameBtn) {
            const card = boardRenameBtn.closest('.board-card');
            let board = findBoard(card.getAttribute('data-board-id'));
            if (board) {
                const title = await requestName(tr('rename_board_prompt'), board.title);
                board = findBoard(card.getAttribute('data-board-id'));
                if (!board) return true;
                if (title && title.trim()) {
                    board.title = title.trim();
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const boardDeleteBtn = e.target.closest('.board-delete-btn');
        if (boardDeleteBtn) {
            const card = boardDeleteBtn.closest('.board-card');
            const boardId = card.getAttribute('data-board-id');
            if (await confirmAction('Archive this board? Its tasks will stay visible on the Calendar and can be restored from the Archive.')) {
                const board = findBoard(boardId);
                if (board) {
                    board.archived = true;
                    updatePlanInFirestore();
                    renderApp();
                }
            }
            return true;
        }

        const addBoardBtn = e.target.closest('#add-board-btn');
        if (addBoardBtn) {
            const title = await requestName(tr('new_board_prompt'));
            if (title && title.trim()) {
                getBoards().push({ id: 'board-' + Date.now(), title: title.trim(), sections: [], archived: false });
                if (!getPlanId()) { savePlanToFirestore(getBoards()); } else { updatePlanInFirestore(); }
                renderApp();
            }
            return true;
        }
        return false;
    };
}
