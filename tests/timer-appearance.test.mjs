import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {defaultSettings} from '../app-settings-model.js';
import {mountFocusTimer} from '../focus-timer.js';

test('timer appearance defaults and renders as data attributes', () => {
    const appearance = defaultSettings().appearance;
    assert.deepEqual(
        [appearance.timerType, appearance.timerTheme, appearance.timerBorder],
        ['digital', 'violet', 'glow']
    );
    const {document, window} = parseHTML('<html><body><div id="focus-timer-container"></div></body></html>');
    const timer = mountFocusTimer({
        document, window, getIdentity: () => ({}), persist: async () => ({}),
        getAppearance: () => ({timerType: 'nuclear', timerTheme: 'amber', timerBorder: 'hazard'}),
        setInterval: () => 1, clearInterval() {}
    });
    const card = document.getElementById('focus-timer-container');
    assert.equal(card.dataset.timerType, 'nuclear');
    assert.equal(card.dataset.timerTheme, 'amber');
    assert.equal(card.dataset.timerBorder, 'hazard');
    timer.dispose();
});
