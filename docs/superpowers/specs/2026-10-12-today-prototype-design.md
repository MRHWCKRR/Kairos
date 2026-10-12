# Kairos Today prototype

## Approved direction and scope

The user approved proceeding after the 22-page Kairos product and design study. Build the recommended next step: an interactive prototype of capture → choose what fits → begin → interrupt → revise → resume. Target students and adults. The prototype tests a product hypothesis; it is not a production replacement or a claim of validated retention.

Preserve vanilla HTML/CSS/JavaScript, Kairos's two-stroke mark and purple action colour. Keep the production application, authentication, payment system, mobile block, data schema and public asset manifest unchanged. All prototype data is fictional, isolated browser-local data. Host an owner-private review copy. Keep the source in this repository under `prototypes/today/` and offer a draft PR.

## Experience

Three real views: Today, Plan, Lists. Today foregrounds one recommended task and its concrete fit explanation, with the rest of today's work and fixed commitments visible. Plan shows a chronological agenda and editable available window. Lists exposes every task, including unscheduled and tomorrow work, with creation, editing, completion and reopening.

Right now uses remaining duration, due day and priority against contiguous free slots. Fixed commitments and breaks are protected. It never invents a shorter task or hides a task that does not fit. Due date and planned day are separate. Explanations come from this deterministic model, not an AI response.

Make room is user-initiated. Enter lost time; review feasible alternatives, explicit moved work and finish times, then apply or cancel. Defer only work whose deadline permits tomorrow and whose full remaining duration fits tomorrow's actual free slots. Finish later is an explicit alternative. If neither works, show why and let the user edit the plan. Preview is mutation-free; applying a proposal is reversible. A proposal cannot apply after the underlying state changes.

Pick up here: Begin opens a task-linked, elapsed-time session. Pause/Stop preserves elapsed work and offers an optional short resume note. Completion is a separate explicit action, with undo. Remaining duration is editable and is not silently inferred from elapsed time. Notes survive navigation and reload.

## Craft and states

**User revision, 12 October:** The first light/minimal prototype removed too much Kairos identity. The user selected a **polished hybrid**. Default to original Kairos's charcoal layers, retain the original gradient two-stroke mark and familiar sidebar proportions, and refine the task rows, controls and focused-task surface. Provide a light toggle. Show a compact time ribbon derived from real sample free slots/commitments/breaks, never an invented progress metric. Keep the calmer hierarchy and working interactions. Sidebar list shortcuts lead to the actual list content.

Quiet neutral surfaces, readable system typography, purposeful purple, compact row interactions and modest motion. No invented metrics, gradient cards, automatic confetti or chat imitation. Clear overdue, no-fit, completed, all-done, empty-list and storage-failure states. Long text wraps. Dialogs use native focus containment, Escape and labelled controls; focus returns to the invoking control. Keyboard operation and reduced motion are required. Reset and scenario switching use confirmation. Local storage failure leaves a usable in-memory session with a visible notice.

## Scenarios and evaluation

Adult: 14:00–16:00, 80 minutes flexible work, 30-minute call and two five-minute breaks. At 14:30, 50 flexible minutes remain. Student: parallel revision/assignment scenario with a protected ride. Tomorrow contains a declared available window and an existing task. Both are clearly labelled sample days, not today's real date/time.

Review capture, selecting a task, cancellation, repeated actions, delay alternatives, deadline protection, fragmentation, undo, pause/resume, reload, corrupt storage, empty/completed states, long content and desktop layouts. Compare against a good conventional checklist; do not infer success from appearance alone.
