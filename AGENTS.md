# AGENTS.md

## Scope

This repository is the Kairos web application.

Kairos is a desktop-first productivity app with AI-assisted planning, scheduling, boards, tasks, reminders, analytics, and persistent AI chat. The current application is intentionally built with vanilla HTML, CSS, and JavaScript, with Firebase for authentication/data and Vercel/server-side endpoints for backend and AI relay work.

These instructions apply to the whole repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Preserve the Existing Architecture

- Keep the web app in vanilla JavaScript, HTML, and CSS unless the user explicitly requests a framework migration.
- Do not introduce React, Next.js, Vue, Svelte, Angular, or another frontend framework just to implement a feature.
- Do not rewrite working features simply to make them match a preferred framework or coding style.
- Reuse the existing Firebase authentication, Firestore data model, App Check, analytics, and Vercel API structure.
- Do not move secrets or privileged server logic into client-side code.
- Prefer small, targeted changes over broad rewrites.

## Current Areas of the Codebase

Important existing modules include, among others:

- `app.html` — main application markup and shell
- `app.css` — main application styling
- `app.js` — legacy/main application logic
- `firebase.js` — Firebase initialization and auth-related setup
- `ai-workspace.js` — AI chat workspace and persistent chat behaviour
- `ai-actions.js` — AI-triggered application actions
- `ai-context.js` — Kairos/user/project context sent to the AI
- `ai-markdown.js` — safe markdown rendering for AI messages
- `analytics-*` — analytics tracking and dashboards
- `api/` — server-side/Vercel endpoints
- `build.js` — deployment/build-time configuration work

Before changing a feature, inspect the relevant existing module rather than adding parallel logic elsewhere.

## Modularity

`app.js` and `app.css` are already large. Do not make them the default destination for every new feature.

For substantial new work:

- Prefer a focused feature module when the feature has independent state, rendering, or actions.
- Prefer a focused stylesheet when a feature has a meaningful amount of dedicated styling.
- Reuse existing helpers before creating new ones.
- Avoid duplicate Firebase listeners, duplicate global state, and multiple competing render paths for the same UI.
- Avoid creating a second implementation of an existing feature during refactors; migrate cleanly.

Refactors should be incremental and should preserve behaviour unless the task explicitly changes it.

## Kairos Product and Design Direction

Kairos should feel like a deliberate productivity product, not a generic AI-generated dashboard.

Design goals:

- Calm, fast, focused, and practical.
- Desktop productivity density where useful.
- Clear information hierarchy.
- Minimal chrome around the actual work.
- Distinct Kairos identity without decorative clutter.
- Interfaces should feel intentionally designed for the feature rather than assembled from generic components.

Avoid common AI-generated UI patterns unless they are genuinely appropriate:

- Do not put every section inside a floating card.
- Do not use excessive rounded rectangles or pill controls.
- Do not add gradients merely to make a screen look "modern".
- Do not add giant marketing-style headings inside the application shell.
- Do not invent dashboard metrics, progress rings, or statistics to fill space.
- Do not overuse shadows, blur, glassmorphism, or glowing effects.
- Do not create large amounts of empty whitespace that reduce productivity density.
- Do not redesign unrelated areas while implementing one feature.

Use spacing, alignment, typography, separators, state, and interaction to create hierarchy before adding decoration.

## Visual Consistency

When modifying UI:

- Inspect neighbouring Kairos UI first and preserve its established language unless the task is a deliberate redesign.
- Reuse existing colours, typography, controls, menus, dialogs, and layout conventions where practical.
- Do not create a new design system inside one feature.
- If a new reusable visual token or primitive is needed, implement it in a way that can be reused elsewhere.
- Keep iconography consistent. Prefer the icon family already used by the application rather than mixing styles.
- Keep border radius, control sizing, spacing, and surface treatment consistent across related views.

For major redesigns, treat approved design references or Figma designs as the visual source of truth.

## Schedule and Planning UX

The schedule is a core Kairos feature and should not be treated as a decorative calendar.

When working on schedule/planning features:

- Prioritise useful actions: creating, moving, resizing, completing, rescheduling, and understanding tasks/events.
- Preserve connections between tasks, boards, sections, reminders, and AI actions.
- Avoid a purely cosmetic redesign that reduces function.
- Prefer direct manipulation where it is clear and safe.
- Surface useful context without overwhelming the primary schedule.
- Desktop layouts may use multiple panes when that improves planning efficiency.

## AI Workspace

The AI workspace supports multiple persistent chats and concurrent requests.

When changing AI chat behaviour:

- Do not reintroduce behaviour where switching chats cancels an unrelated pending response.
- Preserve per-chat pending/request state.
- Preserve chat persistence across reloads.
- Preserve safe markdown rendering and sanitisation.
- Avoid creating duplicate blank chats when repeatedly opening or creating a new chat.
- Keep AI responses natural; do not force the assistant to repeatedly announce that it is using "Kairos context".

Before modifying chat state logic, inspect `ai-workspace.js`, `ai-context.js`, and related helpers together.

## AI Actions and Application Control

Kairos AI is intended to manipulate app data through explicit, validated actions rather than vague text-side effects.

When extending AI control:

- Prefer structured actions such as task create/update/delete, board create/update/delete, section changes, schedule moves, and reminders.
- Validate all AI-produced action payloads before applying them.
- Never trust arbitrary model-generated field names or document paths.
- Reuse the same underlying application/data functions that normal UI interactions use where possible.
- Keep destructive actions constrained and intentional.
- Ensure UI feedback reflects whether the requested action actually succeeded.

Do not report an action as completed when the underlying Firebase/data mutation failed or never ran.

## Firebase and Data Integrity

- Preserve email verification requirements.
- Preserve account deletion behaviour and associated user-data cleanup.
- Preserve App Check and anti-abuse protections.
- Do not weaken authentication or Firestore security to make development easier.
- Do not change Firestore collection/document structure casually.
- If a schema change is required, document the migration implications and maintain backward compatibility where practical.
- Do not create orphaned account data when users delete and later recreate an account with the same email.

## Mobile Behaviour of the Web App

The Kairos web app is desktop/laptop oriented.

- Preserve the existing mobile-device blocking/download experience unless the task explicitly changes product strategy.
- Do not attempt to make the full desktop web app responsive for phones as an incidental part of another change.
- iOS and Android have separate native clients; do not force native-mobile UX into the desktop web UI.

## Accessibility

All new or changed interactive UI should support:

- Keyboard access where applicable.
- Visible focus states.
- Semantic labels or accessible names.
- Appropriate contrast.
- Meaningful disabled/loading/error states.
- Reduced-motion-friendly behaviour for nonessential animation when practical.

Do not rely on colour alone to communicate status.

## Interaction Quality

Every meaningful feature should consider:

- Loading state
- Empty state
- Error state
- Success feedback
- Disabled state
- Keyboard behaviour
- Focus behaviour
- Long content / overflow
- Slow network behaviour
- Repeated clicks/submits

Do not stop at the ideal happy path if the surrounding states are part of the same feature.

## Performance

- Avoid unnecessary Firestore listeners and repeated reads.
- Clean up event listeners, observers, timers, and subscriptions when they are no longer needed.
- Avoid re-rendering large sections of the DOM when a targeted update is sufficient.
- Do not load large assets or dependencies for small UI conveniences.
- Keep startup/authentication paths reliable and avoid changes that can leave the application stuck indefinitely on the loading screen.

## Dependencies

- Do not add a dependency without a concrete reason.
- Prefer existing browser APIs or existing project libraries for small tasks.
- Before upgrading an existing dependency, check for compatibility with current Kairos behaviour.
- Do not introduce a large UI framework for one component.

## Security

- Never expose backend secrets in browser code.
- Sanitize any user-controlled or model-generated HTML.
- Treat AI output as untrusted input.
- Validate server-side requests and authenticated user identity where required.
- Preserve CAPTCHA/App Check/rate-limit or anti-abuse protections already in place.
- Avoid dangerous use of `innerHTML`; use the existing safe markdown/sanitisation path where AI-rendered rich content is required.

## Testing and Verification

After implementation, verify the feature rather than assuming generated code works.

At minimum, where relevant:

- Check the browser console for new errors.
- Test the normal user path manually.
- Test authentication-sensitive behaviour with a verified user.
- Test persistence across reloads when the feature stores data.
- Test switching between AI chats when chat logic is touched.
- Test Firestore mutations actually occurred when AI or UI claims an action succeeded.
- Test loading, empty, and error states.
- Test at typical desktop/laptop viewport sizes.

For visual changes, compare the rendered UI to the approved design/reference rather than judging from code alone.

## Git and Change Scope

- Keep commits focused on the requested task.
- Do not bundle unrelated cleanup into a small feature fix unless necessary for correctness.
- For small fixes, direct changes to `main` are acceptable when requested by the project owner.
- For risky, broad, or architectural work, prefer an isolated branch/PR unless the project owner explicitly asks otherwise.
- Do not modify generated assets or unrelated files unnecessarily.

## Comments and Documentation

- Write comments for non-obvious behaviour, invariants, or compatibility constraints.
- Do not add comments that merely restate straightforward code.
- Update documentation when changing setup, architecture, security requirements, or external configuration.

## Decision Rule

When there are several valid implementation paths, prefer the one that:

1. Preserves working Kairos behaviour.
2. Fits the existing architecture.
3. Produces the clearest user experience.
4. Minimises duplicate state and logic.
5. Keeps the code understandable for future contributors and coding agents.
6. Avoids making Kairos look or behave like a generic AI-generated app.
