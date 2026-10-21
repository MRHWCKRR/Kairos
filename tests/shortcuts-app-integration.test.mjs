import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {TRANSLATIONS,applyTranslations} from '../i18n.js';
import {mountSidebarIcons} from '../sidebar-icons.js';
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
test('Accessibility owns shortcuts, Planning owns defaults and Personal keeps account details',()=>{
 const {document}=parseHTML(html),accessibility=document.getElementById('settings-accessibility'),personal=document.getElementById('settings-personal');
 for(const id of ['shortcut-settings-editor']){assert.ok(accessibility.contains(document.getElementById(id)),id);assert.equal(personal.contains(document.getElementById(id)),false);assert.equal(document.querySelectorAll('#'+id).length,1);}
 for(const id of ['planning-preferences-editor','weekly-availability-editor'])assert.ok(document.getElementById('settings-planning').contains(document.getElementById(id)));
 assert.ok(personal.querySelector('#settings-account-plan'));assert.equal(document.querySelector('.settings-version').textContent,'Kairos v0.4.3-Development Beta');
});
test('real sidebar labels translate without erasing decorative icons or changing destinations',()=>{
 const {document}=parseHTML(html),prior=globalThis.document;globalThis.document=document;
 try{mountSidebarIcons(document);const links=[...document.querySelectorAll('#sidebar .sidebar-nav .nav-item')],hrefs=links.map(link=>link.getAttribute('href'));applyTranslations('fr');
 assert.equal(links.length,7);for(const link of links){assert.ok(link.querySelector('svg[data-sidebar-icon]'));const label=link.querySelector('.nav-label[data-i18n]');assert.ok(label);assert.equal(link.hasAttribute('data-i18n'),false);assert.equal(link.title,label.textContent);assert.equal(link.getAttribute('aria-label'),label.textContent);}
 assert.deepEqual(links.map(link=>link.getAttribute('href')),hrefs);assert.equal(links[0].querySelector('.nav-label').textContent,TRANSLATIONS.fr.nav_dashboard);
 }finally{globalThis.document=prior;}
});
test('four notification labels have no decorative prefix in every language',()=>{
 const {document}=parseHTML(html);for(const key of ['notif_enabled_label','notif_board_completion_label','notif_bedtime_label','notif_browser_push_label']){
 assert.doesNotMatch(document.querySelector('[data-i18n="'+key+'"]').textContent,/^[?\p{Extended_Pictographic}]/u);
 for(const [language,values] of Object.entries(TRANSLATIONS))assert.doesNotMatch(values[key],/^(?:\?{1,2}\s|\p{Extended_Pictographic})/u,language+' '+key);
 }
});
