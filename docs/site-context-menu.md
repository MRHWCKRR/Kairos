# Site context menu

The desktop shared UI bootstrap installs the themed page context menu on all eleven public HTML pages. Task and section action menus retain priority. Selecting or deselecting a task uses the same menu-item appearance, including focus and hover styles, for the accessible checkbox role.

Right-click elsewhere for Copy, Paste, Select all, Back, Forward, Reload, Copy page link and Print. Text fields also offer Cut. Links and images add safe open-in-new-tab and copy-address actions. Availability follows the clicked target, selection, editability and browser Clipboard API support. Password text is never exposed through Copy/Cut. Controls without text selection APIs retain their native menu.

Clipboard reads happen only when Paste is invoked. Cut removes text only after a successful clipboard write. A canceled operation, removed/changed field, page change, readonly state or changed editor contents prevents a delayed paste. Clipboard failures retain the menu with keyboard/native-menu guidance. Input events continue through existing editors; no planner persistence path is added.

Inspect and Browser menu explain how to invoke the actual browser tools; a webpage cannot directly open DevTools or synthesize the browser context menu. Hold Shift while right-clicking anywhere, including tasks, for the native menu. Menu keyboard access uses the Context Menu key or Shift+F10; arrows/Home/End navigate, Enter/Space activates, Escape restores focus and Tab exits. Outside clicks, scrolling, resize, window blur, browser navigation and pagehide dismiss it. Task and page menus coordinate so only one is open.

Implementation: `ui-context-menu.js`, loaded once through `ui-bootstrap.js`, uses the shared menu positioning helper and UI theme tokens. Versioned bootstrap/styles and task loader assets prevent mixed old/new styling.

Verification: regression tests cover checkbox styling, copy/cut/paste, stale/canceled clipboard requests, denial, readonly/password/unsupported inputs, keyboard/dismissal, specialized menu priority, native bypass, safe link handling and upgrading an older shared stylesheet. Local Workers runtime startup still fails in this environment; hosted CI is the runtime gate. Browser appearance and real OS clipboard permission prompts require a live manual check.

Independent review reproduced two Important issues in Chrome: the browser editing-command path bypassed beforeinput cancellation, and delayed Paste could enter an editor after contenteditable was disabled. Both now have RED/GREEN regression tests. The same editability guard respects noneditable descendants and plaintext-only editors. No Critical finding was reported. Opening a menu on a task title with an unsaved trailing space can still trigger existing blur trimming; the first Paste then safely rejects the changed value and asks to reopen the menu. That minor interaction remains deferred.
