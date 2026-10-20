import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountSidebarIcons } from '../sidebar-icons.js';

const pages = ['home', 'ai', 'tasks', 'schedule', 'calendar', 'achievements', 'statistics', 'settings'];

function fixture() {
    return parseHTML(`<html><body><aside id="sidebar"><nav class="sidebar-nav">${pages.map(page =>
        `<a class="nav-item" data-target="${page}-page" href="app.html?page=${page}" title="${page}" aria-label="${page}"><span class="nav-label" data-i18n="nav_${page}">${page}</span></a>`
    ).join('')}<a class="nav-item" data-target="unknown-page">Other</a></nav></aside><a class="nav-item" data-target="home-page">Outside sidebar</a></body></html>`);
}

test('every sidebar destination receives a distinct themeable decorative SVG', () => {
    const { document } = fixture();
    mountSidebarIcons(document);
    const icons = [...document.querySelectorAll('#sidebar .nav-icon')];
    assert.equal(icons.length, 8);
    assert.equal(new Set(icons.map(icon => icon.getAttribute('data-sidebar-icon'))).size, 8);
    for (const icon of icons) {
        assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg');
        assert.equal(icon.getAttribute('stroke'), 'currentColor');
        assert.equal(icon.getAttribute('fill'), 'none');
        assert.equal(icon.getAttribute('aria-hidden'), 'true');
        assert.equal(icon.getAttribute('focusable'), 'false');
        assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
        assert.ok(icon.querySelector('path[d]'));
        assert.equal(icon.querySelector('script, use, image, foreignObject'), null);
        assert.equal(icon.parentElement.firstElementChild, icon);
    }
    assert.equal(document.querySelector('[data-target="unknown-page"] svg'), null);
    assert.equal(document.body.lastElementChild.querySelector('svg'), null);
});

test('mount is idempotent and preserves translated labels, link attributes and click handlers', () => {
    const { document } = fixture();
    const link = document.querySelector('[data-target="home-page"]');
    const label = link.querySelector('.nav-label');
    let clicks = 0;
    link.addEventListener('click', () => clicks++);
    const attributes = [...link.attributes].map(({ name, value }) => [name, value]);
    mountSidebarIcons(document);
    const icon = link.firstElementChild;
    label.textContent = 'Tableau de bord';
    mountSidebarIcons(document);
    assert.equal(document.querySelectorAll('.nav-icon').length, 8);
    assert.equal(link.firstElementChild, icon);
    assert.equal(link.querySelector('.nav-label'), label);
    assert.equal(label.textContent, 'Tableau de bord');
    assert.deepEqual([...link.attributes].map(({ name, value }) => [name, value]), attributes);
    link.click();
    assert.equal(clicks, 1);
});

test('an empty shell is safe to mount before the sidebar exists', () => {
    const { document } = parseHTML('<html><body></body></html>');
    assert.doesNotThrow(() => mountSidebarIcons(document));
});
