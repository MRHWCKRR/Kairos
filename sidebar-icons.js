/*
MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Tabler Icons (MIT), copyright (c) 2020-2026 Paweł Kuna.
// Source: https://github.com/tabler/tabler-icons/tree/main/icons/outline
// Full license and source file hashes: docs/licenses/tabler-icons-LICENSE.txt.
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDEBAR_ICONS = {
    'home-page': {
        name: 'layout-dashboard',
        paths: [
            "M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1",
            "M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1",
            "M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1",
            "M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1"
        ]
    },
    'ai-page': {
        name: 'sparkles',
        paths: [
            "M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"
        ]
    },
    'tasks-page': {
        name: 'list-check',
        paths: [
            "M3.5 5.5l1.5 1.5l2.5 -2.5",
            "M3.5 11.5l1.5 1.5l2.5 -2.5",
            "M3.5 17.5l1.5 1.5l2.5 -2.5",
            "M11 6l9 0",
            "M11 12l9 0",
            "M11 18l9 0"
        ]
    },
    'schedule-page': {
        name: 'calendar-time',
        paths: [
            "M11.795 21h-6.795a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4",
            "M14 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
            "M15 3v4",
            "M7 3v4",
            "M3 11h16",
            "M18 16.496v1.504l1 1"
        ]
    },
    'calendar-page': {
        name: 'calendar',
        paths: [
            "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12",
            "M16 3v4",
            "M8 3v4",
            "M4 11h16",
            "M11 15h1",
            "M12 15v3"
        ]
    },
    'achievements-page': {
        name: 'trophy',
        paths: [
            "M8 21l8 0",
            "M12 17l0 4",
            "M7 4l10 0",
            "M17 4v8a5 5 0 0 1 -10 0v-8",
            "M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            "M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
        ]
    },
    'statistics-page': {
        name: 'chart-bar',
        paths: [
            "M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6",
            "M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10",
            "M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14",
            "M4 20h14"
        ]
    },
    'settings-page': {
        name: 'settings',
        paths: [
            "M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065",
            "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"
        ]
    },
};

/** Add local, decorative icons without replacing navigation labels or handlers. */
export function mountSidebarIcons(document) {
    for (const link of document.querySelectorAll('#sidebar .sidebar-nav .nav-item[data-target]')) {
        const definition = SIDEBAR_ICONS[link.getAttribute('data-target')];
        if (!definition || link.querySelector('[data-sidebar-icon]')) continue;
        const icon = document.createElementNS(SVG_NS, 'svg');
        const attributes = {
            class: 'nav-icon',
            'data-sidebar-icon': definition.name,
            width: '20',
            height: '20',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'aria-hidden': 'true',
            focusable: 'false'
        };
        for (const [name, value] of Object.entries(attributes)) icon.setAttribute(name, value);
        for (const data of definition.paths) {
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', data);
            icon.append(path);
        }
        link.prepend(icon);
    }
}
