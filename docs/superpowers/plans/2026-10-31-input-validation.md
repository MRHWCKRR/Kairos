# Planner input validation plan

> Use superpowers:executing-plans for native implementation and fresh final review.

Goal: reject malformed task fields and AI proposals before preview/save, and identify malformed calendar entries without partially changing existing data.

Architecture: extend existing pure validators and use existing UI error/status paths. Preserve read-time recurrence normalization for old data; validate supplied write fields before normalization. Keep calendar imports atomic because skipping invalid entries during a source refresh could delete previously imported events.

Constraints: vanilla JavaScript, no dependencies, no Firebase schema/auth/security changes, no unrelated styling. Current main9599d6212f0ac78b4831e112b5da75a45f5e8895. Existing isolated checkout, read-only local Git metadata; publish only explicit byte-verified files against the remote base tree.

Tasks:
- [ ] Task1: add failing real task command tests for coerced dates/colors, invalid raw recurrence, explicit undefined, estimate boundary; implement field-specific checks while preserving legacy read compatibility.
- [ ] Task2: add failing AI schema and real preview/execute tests for impossible dates, invalid times, missing required values and inherited action names; reject before reads/writes/approval. Preserve null/empty unscheduling semantics.
- [ ] Task3: add failing real calendar parser/UI tests identifying bad entry ordinal/title/field and leaving saved source/events unchanged on a failed refresh. Add bounded, plain-text contextual errors without partial import.
- [ ] Task4: run full regression, type/syntax checks, real browser journeys and packaged persistence checks in hosted CI; fresh independent review; fix blocking findings with RED/GREEN tests; PR ready only, merge separately.

Review focus: unaffected legacy task fields; recurrence normalization accepting malformed writes; AI null/empty clearing; private calendar URLs and markup in errors; refresh atomicity with valid and malformed entries. Test each at the owning boundary.

Live verification: Browser connector tools are absent in this session, so live Firebase renewal and OS notification delivery remain unverified.
