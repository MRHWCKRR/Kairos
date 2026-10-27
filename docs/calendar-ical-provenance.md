# ICAL.js vendor provenance

`calendar-ical.js` bundles unmodified ICAL.js2.2.1 source from
https://github.com/kewisch/ical.js/tree/277d52c8db379f133a88957793e03997a65307f4/lib/ical
under MPL2.0. `calendar-ical-LICENSE.txt` supplies the complete upstream license
and corresponding-source link. All21library modules and the upstream LICENSE
were checked against their GitHub blob hashes before bundling.

Build: esbuild entry`lib/ical/module.js`, bundletrue, formatesm, platformbrowser,
minifytrue, legalCommentsinline. No external runtime dependencies/CDN requests.
The parser adapter uses ICAL's recurrence/timezone/event APIs; known IANA zones
without VTIMEZONE definitions use isolated Intl-backed timezone instances.

The adapter deliberately rejects sub-minute scheduled event times, SECONDLY,
MINUTELY and HOURLY rules, EXRULE, RDATE periods, RANGE=THISANDFUTURE and advanced
BY* forms outside the explicitly validated subset. Unsupported constructs fail
the preview instead of importing a partial/shifted calendar. Provider metadata
such as DTSTAMP and LAST-MODIFIED may contain seconds. Imported ranges support
up to366inclusive dates,1MiB input,1000dated segments and20000search steps.
