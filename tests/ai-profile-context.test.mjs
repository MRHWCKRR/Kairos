import {savedWeeklyAvailability} from '../weekly-availability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {ACTION_INSTRUCTIONS} from '../ai-action-schema.js';
import {aiPlanningSummary,resolveAiPlanningTimezone} from '../ai-planning.js';
import {createSettingsRecovery} from '../settings-recovery.js';

const source = await readFile(new URL('../ai-context.js', import.meta.url), 'utf8');

test('Kairos AI treats the current profile name as authoritative over stale chat memory', () => {
  assert.match(
    source,
    /Current profile values override any older or conflicting profile values in conversation history, summaries, or memory\./
  );
});

function fixture({ owner = 'one', name = 'Local name', cloudName = 'Cloud name' } = {}) {
  const storage = new Map([
    ['kairos_settings_cache_uid', owner],
    ['kairos_settings_cache', JSON.stringify({ profile: { displayName: name } })]
  ]);
  const auth = { currentUser: { uid: 'one', displayName: 'Auth name' } };
  let reads = 0;
  const context = vm.createContext({savedWeeklyAvailability, aiPlanningSummary,resolveAiPlanningTimezone,ACTION_INSTRUCTIONS,auth, db: {}, console,
    localStorage: { getItem: key => storage.get(key) ?? null },
    doc: (...args) => args, collection: (...args) => args, query: (...args) => args, where: (...args) => args,
    getDoc: async () => { reads++; return { exists: () => true, data: () => ({ settings: { profile: { displayName: cloudName } } }) }; },
    getDocs: async () => ({ docs: [] })
  });
  vm.runInContext(source.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, ''), context);
  return { context, auth, storage, reads: () => reads };
}

test('saved name changes are used during the context cache lifetime without extra cloud reads', async () => {
  const f = fixture();
  assert.match(await f.context.getKairosContext(), /User name: Local name/);
  f.storage.set('kairos_settings_cache', JSON.stringify({ profile: { displayName: 'New name' } }));
  assert.match(await f.context.getKairosContext(), /User name: New name/);
  assert.equal(f.reads(), 1);
  f.context.invalidateKairosContext();
  assert.match(await f.context.getKairosContext(), /User name: New name/);
});

test('another account or unowned legacy cache cannot override the current cloud profile', async () => {
  for (const owner of ['other', null]) {
    const f = fixture({ owner, name: 'Previous user' });
    assert.match(await f.context.getKairosContext(), /User name: Cloud name/);
    assert.doesNotMatch(await f.context.getKairosContext(), /Previous user/);
  }
});

test('malformed local settings fall back to the cloud profile', async () => {
  const f = fixture();
  f.storage.set('kairos_settings_cache', '{');
  assert.match(await f.context.getKairosContext(), /User name: Cloud name/);
});

test('clearing the saved name uses the auth fallback instead of stale cloud identity', async () => {
  const f = fixture({ name: '' });
  assert.match(await f.context.getKairosContext(), /User name: Auth name/);
});

test('chat requests retain old memory but supply the new authoritative profile', async () => {
  const f = fixture({ name: 'New name' });
  f.context.document = { readyState: 'loading', documentElement: { lang: 'en' }, addEventListener() {} };
  f.context.aiConversationMessages = messages => messages;
  const workspace = await readFile(new URL('../ai-workspace.js', import.meta.url), 'utf8');
  vm.runInContext(workspace.replace(/^import[^\n]*\n/gm, ''), f.context);
  const chat = { summary: 'User name: Old name', autoSummary: 'User name: Old name', messages: [] };
  const messages = await f.context.apiMessages(chat);
  assert.match(messages[0].content, /Current profile values override/);
  assert.match(messages[0].content, /User name: New name/);
  assert.equal(chat.summary, 'User name: Old name');
});

test('settings loading binds its cache to the account and invalidates AI context', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const helpers = app.slice(app.indexOf('function cloneDeep('), app.indexOf('function defaultAchievementsData('));
  const loader = app.slice(app.indexOf('    function cacheAppliedSettings('), app.indexOf('    async function saveUserSettingsToFirestore('));
  for (const owner of ['one', 'other']) for(const offline of [false,true]) {
    const storage = new Map([['kairos_settings_cache_uid', owner], ['kairos_settings_cache', JSON.stringify({ profile: { displayName: 'Saved name' } })]]);
    let invalidated = 0;
    const context = vm.createContext({ db: {}, console: {error(){}}, document: { dispatchEvent() {} }, Event, structuredClone,createSettingsRecovery,
      auth:{currentUser:{uid:'one'}},updateSaveBarVisibility(){},
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      doc: (...args) => args, getDoc: async () => {if(offline)throw Error('Offline');return { exists: () => false };},
      invalidateKairosContext: () => invalidated++, applyAllSettings() {}, populateSettingsForm() {},
      renderUserProfileMenu() {}, setupNotificationBell() {}, markInitialLoadComplete() {}
    });
    vm.runInContext(helpers + 'let userSettings=defaultSettings(),pendingSettings,settingsCloudSnapshot,settingsPendingRecord,settingsLoadRevision=0;const settingsRecovery=createSettingsRecovery(localStorage);\n' + loader, context);
    await context.loadUserSettingsFromFirestore({ uid: 'one' });
    assert.equal(JSON.parse(storage.get('kairos_settings_cache')).profile.displayName, offline&&owner === 'one' ? 'Saved name' : '');
    assert.equal(storage.get('kairos_settings_cache_uid'), 'one');
    assert.equal(invalidated, 1);
  }
});
