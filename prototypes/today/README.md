# Kairos Today product prototype

An isolated interactive implementation of the direction in the Kairos product and design study. It is a review and usability-testing surface, not a production feature rollout.

The revised **polished hybrid** defaults to Kairos's charcoal surfaces and original gradient mark. It retains a familiar sidebar, adds real list shortcuts, refines the task and focus surfaces, and visualises available time between protected commitments. Light appearance remains available.

## Try it

Private review copy: https://kairos-today-prototype.cheeryfairy8.chatgpt.site

Or serve the repository over HTTP and open `/prototypes/today/`. Native ES modules require HTTP rather than opening the HTML directly as a file. No dependency installation or AI credentials are needed to run the prototype.

1. Inspect **Today**, **Plan**, and **Lists**. Try both Work & life and School & life samples; switching samples asks before clearing your prototype edits.
2. Add a task with a duration and a separate planned day/deadline. Capture unscheduled work and find it in Lists.
3. Use **Day changed?**, lose 30 minutes, and review the two feasible alternatives. Check the specific moved task, verified tomorrow slot, and later finish. Apply, then Undo.
4. Begin a task, pause, leave a resume note, reload, and resume. Mark complete separately; elapsed time never silently reduces the remaining estimate.
5. Adjust a task to be longer than any available gap. It remains visible with a no-fit explanation. Complete all today's tasks and inspect the empty state.

## Boundaries

- Fictional sample days, with a manually controlled sample planning clock and a separate real elapsed session timer.
- Browser-local storage under `kairos-today-prototype-v1`; no server data writes, Firebase, payment APIs, AI model calls, or analytics.
- Uses existing vanilla architecture and mark. No changes to production app entry points, public assets, authentication, billing, or mobile blocking.
- No production scheduling engine replacement. The pure prototype model explores the interaction contract; production integration must adapt the established schedule utilities/review/apply pipeline rather than maintaining a competing scheduler.
- Today’s sample has 80 minutes of flexible work, a 30-minute fixed commitment and 10 minutes of protected breaks. Four tasks (15, 25, 35 and 5 minutes) make the initial non-split schedule actually feasible. A 30-minute delay leaves 50 flexible minutes. Later-finish options reflect real contiguous gaps, not just aggregate arithmetic.
- A single undo restores the preceding edit/proposal/completion. Starting or pausing a session clears older undo to avoid reviving unrelated task state.
- Prototype storage is per browser, with no multi-device/multi-tab synchronisation. Theme choice is temporary.

## Verification

`node --test tests/today-prototype*.test.mjs` passes 21 model/DOM behavior checks, including deadlines, fragmented time, mutation-free preview, verified tomorrow capacity, stale proposals, idempotent completion/session accounting, capture/edit/undo, literal-text rendering, reload and storage failure. Independent code review found rapid completion reversal and focus loss in filter/day switches; both were reproduced in failing tests and fixed.

`npm run build:cloudflare` passes. The full regression run before the final two review tests ran 299 checks: 297 passed, one was skipped, and the existing real Workers runtime check failed because this container reports `uv_interface_addresses returned Unknown system error 1`. A later full-suite attempt was blocked by npm-registry network policy during runtime startup. The runtime check needs a normal runtime/CI environment; it was not changed or weakened.

After the review fixes and visual revision, the regression suite excluding only that unavailable runtime test passes **299 checks**, with **one existing skip**. The current prototype checks are included in that total.

The private deployment succeeds. The cloud browser reaches the expected ChatGPT sign-in wall; authenticated visual, keyboard/focus and viewport QA has not been completed in that browser. DOM tests do not substitute for this review. Check the private link in the owner's browser before production integration.

Deferred scenario: overdue deadlines from prior days are not yet represented in the static sample model; current samples cover today/future deadlines and blocked deferral.

## Next decision

Test this complete flow with students and adults against an excellent manual checklist. Judge whether people understand the recommendations and trade-offs and whether resume notes materially reduce the effort of returning. Validate the behavior before integrating Today into the live app or designing paid packaging around it.
