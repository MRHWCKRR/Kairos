# Build and code checks

Run `npm ci`, `npm run check`, `npm test`, `npm run test:planner-browser`, and `npm run build:cloudflare` before release. Chrome must be available as `google-chrome` or supplied through `CHROME_BIN`. `npm run build` and `npm run build:cloudflare` both package public assets into `dist` without editing source. The public manifest remains an allowlist; server code, tests, tooling, and environment files must never be added to it.

## Asset versions

The packager computes a deterministic SHA-256 digest over sorted public source contents, ignoring legacy `v` query parameters on declared local JS/CSS references. It rewrites those references to one 16-character release version, including HTML, static imports, dynamic imports, and stylesheet URLs. External CDN URLs are untouched. Query parameters and fragments are retained.

One release-wide version deliberately invalidates the public JS/CSS graph together. This trades finer cache reuse for correctness with circular dependencies and singleton modules such as Firebase initialization. Editing a leaf changes importing entrypoint URLs without manual version bumps. Existing numeric counters in source are compatibility references, not release inputs; future changes do not need to increment them.

Schedule markup and the shell bridge now live explicitly in `app.html` and `app.js`. The old transformation helpers remain for compatibility tests, but the production packager no longer injects application JavaScript, replaces the Schedule shell, rewrites recurrence imports, or substitutes relay URLs. Analytics script insertion remains a packaging operation.

## Static checks

`npm run lint` uses the explicitly pinned esbuild dependency to parse application entrypoints and resolve local exports, including source imports with legacy version queries. Remote Firebase/CDN modules and installed packages remain external. This checks syntax and module linkage; it is not a formatting or full-project undefined-variable checker.

`npm run typecheck` uses pinned TypeScript 5.9.3 to check JSDoc contracts in the three extracted application boundary modules. Compiler-only negative fixtures fail if invalid inputs stop producing errors. Existing untyped application modules are migrated gradually; legacy arbitrary settings merges and planner snapshots retain their existing flexible shape.

## Shell ownership

- `app-settings-model.js`: settings defaults and cloning/merge functions; each default is independent. UI drafts and cloud settings still belong to the existing settings controller.
- `app-auth-session.js`: verification, redirects, loading fallback, independent initial loaders, and stale-session guards. The shell clears private views synchronously before invoking it.
- `app-planner-writes.js`: one queue, cloud baseline, and edit/load revisions for ordinary saves, task commands, and focus logging. The shell continues to own live planner arrays.

The release browser journey uses real editor, mutation-session, event-command, AI-preview, and Undo modules with isolated serialized storage. It covers failure before save, reload recovery, legacy task defaults, lost acknowledgement after an AI reminder edit, one-use recovery, reviewed Undo, and account-switch cleanup. It does not replace live Firebase token-renewal or operating-system notification checks.
