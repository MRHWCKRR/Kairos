# Kairos AI provider

Cloudflare production, owner preview and automatic branch previews use OpenRouter with the server-owned `AI_MODEL` setting, initially `openai/gpt-oss-120b`. Set the `OPENROUTER_API_KEY` secret separately on each Worker that needs AI. Never commit it or put it in browser code. Upload it before deploying this configuration. Automatic branch previews may need their own secret configuration; missing credentials fail closed.

`AI_PROVIDER=openrouter` selects the fixed OpenRouter HTTPS endpoint. The key cannot fall back to the legacy relay. An absent provider setting retains the old Hack Club integration only for existing deployment compatibility; do not use that integration for paid/resold AI. Changing `AI_MODEL` is an operator setting, not a browser-request option, and does not implement paid tiers.

OpenRouter requests have a 2,048-token output cap, low reasoning effort for GPT-OSS, a provider-price filter of US$0.40/million input and US$3/million output, and `data_collection=deny`. These filters can make a request unavailable when no provider qualifies. They are not a total account spending cap or a guarantee about all OpenRouter logging. Set an appropriate account/key spending cap separately. Requests are not retried by the server. Existing planner format recovery can issue one additional protected request and counts toward the daily allowance.

Verified Firebase login, App Check, rate limiting, request/response size limits and the current 100/account/day and 1,000/site/day allowances remain required. Subscription entitlements and rewarded ads are not implemented by this change.

Chat actions must have an explicit supported type and arguments. The application checks argument fields and values, exact task/event identity, and locked schedules before writing. When an ID is supplied it is authoritative; partial title matching is disallowed. Existing destructive confirmations remain in place. Success replies are generated after successful mutation, not taken from the model. Planner previous-schedule values come from workspace state.

Verify preview login, task create/rename/move, advice-only responses, schedule proposals, reload persistence and chat switching before production promotion. Check actual Firebase writes and failure behavior. Unit fixtures do not replace these live acceptance checks.

Rollback: revert the code/configuration deployment, preserving Firebase data. Do not silently send commercial traffic back to Hack Club. If OpenRouter is unavailable, keep AI unavailable until a permitted provider is configured.

Provider reference: [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
