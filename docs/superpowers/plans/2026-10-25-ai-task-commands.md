# AI task command consolidation
User approved deployment verification, live checks, and consolidation after PR #121.
Base: merged main 9eceabec2942edafd7d3c19cbc72bf87f04fb51c. The local source matches that tree except documentation whitespace. Sources/ stays read-only.
- [ ] Verify live public assets and anonymous API protection. Existing production ab43a118-e0df-43cf-891d-d7a1f3d54637 already contains PR #121; do not redeploy identical code.
- [ ] Add ai-task-commands.js as a pure adapter for existing AI update/resize/move/reminder semantics. Apply edit_task, complete_task, archive_task and move_task on an isolated draft, returning only after the full request validates. Preserve AI-only lock, recurrence and explicit-resize guards.
- [ ] Route these AI actions and create-board task moves through the adapter. Read the saved completed-task rescheduling setting in preview and in the transaction; never trust a caller/model override.
- [ ] Prove manual/AI field validation parity, no partial writes, archived-parent rejection, completed scheduling policy, duration preservation, explicit resizing, recurring reminder cleanup, receipt retries and undo.
- [ ] Run the full regression suite, browser journeys and Cloudflare build. Use independent review before integrating this refactor.
- [ ] Publish the reviewed changes in a PR and verify CI. Live Stripe setup remains deferred.
Constraints: no new dependency, Firestore schema migration, duplicate planner listeners, or edits to unrelated billing/settings.
Live authenticated acceptance remains dependent on a connected signed-in browser; its current connection timed out. Continue all independent code and public checks.


Independent review: no new Important or Critical findings. Full local regression: 1,335 passed, one skipped; Cloudflare build and diff checks passed. The deployed PR #121 modules passed a real-browser journey using isolated test data.
Inherited nonblocking behavior: unscheduling a 60-minute task with a stale 20-minute estimate falls back to the 20-minute estimate; this refactor deliberately follows the existing shared manual behavior. Treat duration preservation on unschedule as a separate follow-up.

