# Getting started

The existing profile setup wizard ends with Start guide or Skip guide instead of a pretend completed task. Setup saves nested profile/accessibility settings with the shared onboardingCompleted flag. Failed saves retain inputs for retry; late responses cannot open a guide for a different account. Back navigation retains entered and hydrated values.

The guide uses the existing page router and task, Schedule, AI, and notification controls. Opening a destination minimises the guide so users can work. Next/Back only navigate guide instructions; they do not claim a task was created, saved, or completed. It never creates sample planner data, sends an AI message, or requests notification permission.

Use example fills an empty, visible AI composer for review. Existing drafts and hidden project/All chats composers are left untouched. Reminders link to Settings → Appearance and explain that Kairos must remain open.

Getting started in the sidebar reopens the guide. Progress, expansion, and dismissal are stored per account on the current device; no new Firestore listener or schema field is introduced. Existing users are not automatically shown a new tour. Storage failure does not block use or dismissal.

Verification: tests/getting-started.test.mjs covers guide lifecycle, storage failure, navigation errors, account races, prompt safety, notification navigation, and profile-save handoff. The test is included in both builds through test:pages. Chrome checks exercised the actual guide/router/wizard code with simulated Firebase persistence, at 1366×768, 960×768, and 3440×1440 in light and dark themes. Authenticated live Firestore writes were not exercised.
