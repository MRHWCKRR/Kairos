# Task Action Menus — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered secondary task controls with one accessible menu opened by the three-dot button, right-click or keyboard in both Tasks views.

**Architecture:** A shared action registry resolves exact task IDs and determines action availability. One menu component owns positioning and keyboard/focus behaviour, while existing task interactions continue owning mutations, pending receipts, previews and Undo. Row rendering and host callbacks supply small integration points; no new persistence path is introduced.

**Tech Stack:** Vanilla JavaScript modules, existing CSS theme tokens, Node test runner, linkedom, Firebase/Firestore through the current host queue.

**Spec:** `docs/superpowers/specs/2026-10-15-task-actions-selection-design.md` — implement Stage 1 only. Stages 2–4 need separate implementation plans.

## Global Constraints

- Keep completion, drag grip, title and date editing directly accessible; consolidate up/down, move, archive and details into the menu.
- Minimum menu-button target: 36 by 36 CSS pixels. SVG icons: 18 pixels.
- Preserve existing Enter/F2 task details and Alt+Up/Down ordering shortcuts.
- Native menus remain available inside inputs, textareas, editable content and links.
- One menu instance per mounted Tasks workspace; no duplicate global listeners.
- Preserve display-only completion/reorder previews, canonical planner separation, exact Retry identity, confirmed-only Undo and completion rewards.
- No bulk mutations, selection changes, duplication, permanent deletion, framework or dependency additions.
- Use current account/planner identity and exact task IDs; never task titles or row indices.

## Review Focus

1. A save, reorder or remote deletion occurs while a menu is open: invocation must re-resolve the original task, never another row. Task 1 and Task 3 tests.
2. Account/planner changes while a confirmation or clipboard request is awaiting: no stale mutation, success notice or focus transfer enters the new session. Task 1 and Task 3 tests.
3. A menu opens near an edge at zoom or after layout changes: every action remains reachable and scroll/resize cannot leave a detached popup. Task 2 tests and Task 5 browser checks.
4. A nested SVG is right-clicked or clicked while editing a task: event delegation reaches the correct action, native text editing survives, and no completion/drag handler also runs. Task 2 and Task 4 tests.
5. A completed or recurring task is mixed with a pending save: labels and disabled reasons stay current and cannot bypass existing guards. Task 1 and Task 3 tests.

---

### Task 1: shared action definitions and identity validation

**Files:** Create `task-actions.js`; create `tests/task-actions.test.mjs`.

**Interfaces:**
- Produce `createTaskActions({resolveTarget,getIdentity,getInteractionState,runTaskAction,openDetails,openSchedule,copyText,reportError,translate}) -> {items,invoke}`.
- `TaskContext = {taskIds:string[],ownerId:string,planId:string|null}`. Stage 1 requires exactly one ID.
- `items(context) -> Array<{id,label,enabled,disabledReason,group}>`; `invoke(actionId,context,sourceElement) -> Promise<boolean>`.
- `getIdentity() -> {ownerId,planId}`; `getInteractionState(target) -> {busy,pending,sorted,canMoveUp,canMoveDown}`.
- `resolveTarget({taskId}) -> {board,section,task}` or throws for missing, archived or ambiguous targets.
- `runTaskAction(actionId,{taskId},sourceElement) -> Promise<boolean>` consumes Task 3's adapter. Details callbacks accept `openDetails({taskId},sourceElement,{focusField:'title'|null})`; Schedule callback accepts `openSchedule({taskId})`.

- [ ] **Step 1: Write failing registry tests.** Use fake callbacks with recorded calls and mutable identity/state. Assert action IDs are `details`, `rename`, `schedule`, `complete`, `up`, `down`, `move`, `copy-title`, `archive`; Rename passes `focusField:'title'`; complete labels switch with canonical completion; copy receives plain current title. Assert zero callbacks for two targets, unknown actions, stale identities and deleted targets. Recurring completion and blocked reorder return disabled explanations; busy/pending disables mutations while valid read-only actions remain available. After an awaited copy rejects or identity changes, do not emit stale success/error feedback.
- [ ] **Step 2: Run** `node --test tests/task-actions.test.mjs`. Expected: failure because the module is missing.
- [ ] **Step 3: Implement the exact registry interface.** Use text labels from injected translations, fixed action groups, live eligibility rechecks on invocation, and the existing callbacks. Resolve again at invocation, not from captured task objects. Store no DOM-derived task metadata or mutation state in this module.
- [ ] **Step 4: Run** `node --test tests/task-actions.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** the registry and its tests as `feat: define shared task actions with live eligibility checks`.

### Task 2: accessible popup menu component

**Files:** Create `task-action-menu.js`; create `tests/task-action-menu.test.mjs`; modify `task-list.css`.

**Interfaces:**
- Produce `mountTaskActionMenu({root,actions,getIdentity,resolveRow,document,window,onError}) -> {open,close,sync,dispose}`.
- Consume Task 1's `actions.items(context)` and `actions.invoke(id,context,sourceElement)`.
- `resolveRow(element) -> {taskId,row}|null`; `open({context,sourceElement,point?:{x,y}}) -> boolean`; `close({restoreFocus?:boolean}={}) -> void`; `sync() -> void` checks live identity/target validity.
- Export `positionTaskMenu({anchorRect,point,menuSize,viewport,padding:8}) -> {left,top,maxHeight}` as a pure geometry helper. Viewport includes visual-viewport offsets when available.

- [ ] **Step 1: Write failing component tests.** Assert only one menu opens; task labels are escaped through textContent; proper menu/menuitem names and expanded state; disabled actions cannot execute; SVG descendants resolve through their button. Check button anchoring, pointer anchoring and all four viewport edges with an 8-pixel inset. Up/Down, Home/End, Enter/Space, Escape and Tab have the spec's focus behaviour. Right-click inside text inputs, textarea, contenteditable or links stays native; Shift+F10 in a text editor stays native. Menu events never reach task mutation/drag handlers. Outside pointer-down, workspace scroll, resize and changed identity close it; its own internal scrolling does not. Dispose removes overlay and listeners.
- [ ] **Step 2: Run** `node --test tests/task-action-menu.test.mjs`. Expected: missing module failure.
- [ ] **Step 3: Implement the component and scoped CSS.** Append one fixed overlay to document.body to escape clipping. Build labels with DOM APIs. Use readable themed surfaces and 18-pixel icons; use a minimum 36-pixel item height. Keep items keyboard-focusable including disabled explanations, with `aria-disabled` preventing execution. For Tab, close and return focus to the invoker before normal traversal; do not trap Tab in the popup. Escape restores the connected invoker or its connected row. For action-triggered editor/dialog navigation, leave restoration to that action. Guard delayed invocation errors by captured identity.
- [ ] **Step 4: Run** `node --test tests/task-actions.test.mjs tests/task-action-menu.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** as `feat: add accessible task context menu`.

### Task 3: existing-command adapter and host integration

**Files:** Modify `task-list-interactions.js`, `task-detail-pane.js`, `app.js`; extend `tests/task-list-interactions.test.mjs`, `tests/task-detail-pane.test.mjs`, `tests/task-detail-host.test.mjs`.

**Interfaces:**
- Expose `getActionState({taskId}) -> {busy,pending,sorted,canMoveUp,canMoveDown}` from task interactions using canonical data and the existing visible-to-full-order mapping.
- Expose `runTaskAction(id,{taskId},sourceElement) -> Promise<boolean>` for `complete`, `up`, `down`, `move`, `archive`. Existing button handlers also call this adapter during migration.
- Extend detail `open(target,sourceElement,options={focusField:null})`; focus title only after the existing open/draft guards succeed. Existing two-argument callers remain valid.
- Host constructs the registry with exact-ID resolution, current identity, the interaction adapter, existing details/Schedule callbacks and `navigator.clipboard.writeText`. Feature modules must not import Firebase.

- [ ] **Step 1: Write failing integration tests.** Invoke each adapter action and assert its original command/expected fields, operation ID and destination identity. Assert a menu-triggered action dispatches once, a pending operation disables it, recurring completion fails, stale owner/planner changes cannot mutate, Rename preserves dirty-draft confirmation, and new title focus does not affect ordinary details opening. Exercise a failed menu reorder followed by exact Retry, confirmed-only Undo/rewards, and account changes while Archive awaits confirmation. Verify a right-click-opened action still targets the same ID after rows reorder.
- [ ] **Step 2: Run** `node --test tests/task-list-interactions.test.mjs tests/task-detail-pane.test.mjs tests/task-detail-host.test.mjs`. Expected: failures for the missing adapter/options.
- [ ] **Step 3: Implement the adapter and callbacks.** Reuse existing orderedAction, execute, confirmation and move-dialog functions. Extract only the minimal reusable dispatch; do not duplicate commands or optimistic logic. Ensure action closures always re-resolve the explicit ID and capture the invoking identity. A first-plan creation remains the existing explicitly permitted transition inside execute; a later planner switch is never accepted. Reuse the host's status reporting for unavailable clipboard access; do not use a deprecated clipboard fallback.
- [ ] **Step 4: Run** the Task 3 command plus `node --test tests/task-actions.test.mjs tests/task-action-menu.test.mjs`. Expected: all pass, including existing retry and instant-preview tests.
- [ ] **Step 5: Commit** as `feat: connect task menus to existing save and navigation paths`.

### Task 4: row controls, menu mounting and lifecycle

**Files:** Modify `task-list-workspace.js`, `task-list.css`, `page-loader.js`, `app.js`, `app-bootstrap.js`, `i18n.js`, `cloudflare/public-assets.json`; extend `tests/task-list-workspace.test.mjs`, `tests/task-list-overview.test.mjs`, `tests/page-loading.test.mjs`, `tests/cloudflare-build.test.mjs`.

**Interfaces:**
- Rows retain `[data-task-action="drag"]`, `[data-task-list-complete]`, `.task-text`, `.task-date-input`, and `[data-detail-row]`; add `[data-task-menu]` with the exact task ID.
- Remove standalone up/down/move/archive/details controls from the shared Tasks row renderer once the menu integration passes. Retain Alt+Up/Down and Enter/F2 at their current entry points.
- The existing lazy Tasks setup mounts one menu after its action callbacks are available. Call menu.sync on current data/account/planner refresh and close on section navigation; dispose it with its owner.
- Include new modules in the explicit public asset manifest and increment affected bootstrap/app/page-loader/feature URLs from fresh main values when implementing.

- [ ] **Step 1: Write failing renderer/lifecycle tests.** Assert both Tasks views expose only the grip and menu among secondary controls, completion/title/date remain functional, button names include escaped task titles, and the menu invoker retains a stable, labelled control. The same menu instance must survive repeated page preparation without listener duplication. A focused menu invoker survives unrelated overview reconciliation; removing its task closes the menu cleanly. Assert the production build includes both new modules and excludes backend files. Verify read-only menu opening never requests Schedule assets or writes planner data.
- [ ] **Step 2: Run** `node --test tests/task-list-workspace.test.mjs tests/task-list-overview.test.mjs tests/page-loading.test.mjs tests/cloudflare-build.test.mjs`. Expected: new assertions fail before integration; record unrelated environment failures separately.
- [ ] **Step 3: Implement renderer, layout, translations and lazy wiring.** Keep the current title/date geometry and adapt secondary-control grid positions in board cards. Keep direct completion and grip accessibility. Match both wide and narrow desktop containers; preserve hover-versus-keyboard-visible-focus behaviour. Add only real Stage 1 actions and disabled reasons to translations. Reconcile transient menu controls without storing open-menu state in Firestore.
- [ ] **Step 4: Run** the Task 4 command and all Task 1–3 tests. Expected: all pass except independently identified environment-only build/runtime restrictions, which hosted CI must resolve.
- [ ] **Step 5: Commit** as `feat: consolidate Tasks row controls into shared menus`.

### Task 5: full verification, documentation and review

**Files:** Modify `docs/task-details.md`; use the existing relevant test files for any fixes. Browser smoke fixtures and screenshots are temporary workspace material, not public app assets.

**Interfaces:** Consume the complete Stage 1 menu through real production feature modules and host callbacks. No new feature API is introduced.

- [ ] **Step 1: Run** `npm test`, `npm run build:cloudflare`, `npm run test:runtime`, `npx wrangler deploy --dry-run --env preview`, and `git diff --check`. Expected: all applicable checks pass; use hosted CI for environment restrictions. Do not weaken a check to obtain success.
- [ ] **Step 2: Perform browser smoke checks** at 1366x768, 1920x1080 and 3440x1440 and 200% zoom. Exercise menu button/right-click/keyboard entry, all edges, long labels, theme contrast, native text menus, submenu-free keyboard navigation, outside click/scroll dismissal, readable disabled reasons and logical focus after move/archive. Measure the menu-button target at a minimum 36 by 36 CSS pixels. Confirm one action per activation and no console errors. If no browser is available, record this as unverified rather than claiming visual success.
- [ ] **Step 3: Perform verified-account preview checks** for completion/reorder preview, lost-response Retry, dirty details and Rename, archived/missing targets, reload after uncertain save, account switch and exact Schedule task targeting. Preserve billing, Home and Schedule controls. Record any unavailable checks explicitly.
- [ ] **Step 4: Update documentation** with the shipped entry points/actions and actual verification evidence. Record that selection, bulk mutation and Duplicate remain later stages. Reproduce and fix any observed regression with a focused failing test before the fix.
- [ ] **Step 5: Request one fresh whole-branch review** against the current base, supplying this plan and the spec. Resolve Critical/Important findings with regression tests. Publish a reviewable PR with passing hosted CI; do not merge or deploy without the user's release instruction.

## Plan self-review and execution handoff

Coverage: Tasks 1–4 cover every Stage 1 spec requirement; Task 5 covers browser, verified-account and hosted-release checks. The five Review Focus conditions are assigned to explicit tests above. New interface names and ID values are consistent across tasks. No product dependency or independent persistence path is added.

Recommended execution: **Native** — one implementer executes these dependent tasks in this session, followed by one fresh whole-branch reviewer. The shared registry, menu and adapter interfaces are tightly connected, so this avoids passing partly integrated state between implementers.

Before execution, the user reviews this plan and confirms Native execution or chooses subagent-driven execution. The approved design remains the source of truth; this plan does not authorise Stages 2–4 implementation.
