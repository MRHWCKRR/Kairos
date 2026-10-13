# Kairos controls

The shared UI bootstrap enhances single-value selects on public/authentication pages and the workspace. It leaves the original select in the form, preserving its name, value, native validation and input/change events. Dynamic forms are observed; multi-selects and `data-native-select` retain native controls. The workspace mobile gate remains intact.

Menus use opaque theme surfaces, visible focus, labelled combobox/listbox semantics, disabled options, type-ahead, arrow/Home/End navigation, Enter/Tab selection and Escape cancellation. Popup placement avoids container clipping; fallback placement stays inside modal dialogs.

Authentication failures appear inline, with field associations for invalid credentials. Login persistence, email verification, Firebase App Check, signup anti-abuse checks and Google popup invocation remain in their existing flows. Form validation errors appear beside fields.

Owned browser alerts, confirmations and name prompts use shared modal dialogs. Cancellation never accepts a destructive action. App mutations recheck the account and current plan after awaiting a dialog; task/board references are reacquired where necessary. Dialog text and options use textContent rather than HTML.

Tests cover confirmation/prompt cancellation and queueing, escaped content, keyboard selection/cancellation, disabled controls, preserved change events, cleanup, auth field feedback, incorrect-password handling and Google popup failures. Full authenticated browser and screen-reader checks remain manual. Google sign-in windows and browser/OS permission prompts are supplied by their providers and retain provider styling.

Reference: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/
