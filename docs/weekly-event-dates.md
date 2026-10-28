# Weekly event dates

Choose Entire series in a weekly event editor, then set optional First date and Last date. Both are inclusive and use your profile calendar dates. Leave a field blank for no limit. Existing weekly events stay unlimited.

Limits follow the original weekly date. A moved occurrence with an original date inside the range still appears at its destination, even outside the range; an overnight event on the final date still finishes the following morning. One-off events and single-occurrence edits do not accept series limits.

Shortening does not delete saved exceptions. Review lists original and destination dates becoming inactive. Extending/clearing limits lists reactivated exceptions; skipped exceptions remain skipped. The exception picker can remove a dormant exception with Restore occurrence, while its original date remains inactive. Undo restores the prior series with its limits and exceptions, subject to existing stale-edit and one-use guards.

AI create/update_schedule_event accept startDate/endDate on weekly series. Explicit null clears a limit. Previews disclose limits and affected exceptions; context and planning signatures include them. Schedule, Month, Today, task planning and sleep reminders use the shared original-date projection. Imported events remain read-only. No tasks are moved by saving a series.

Automated checks use isolated persistence/model responses and production browser components; no live model inference or authenticated production Firebase writes are claimed.
