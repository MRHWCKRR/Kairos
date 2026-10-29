import {cloneDeep} from './app-settings-model.js?v=1';
import {mountPlanningPreferencesEditor} from './planning-preferences-editor.js?v=9';
import {mountWeeklyAvailabilityEditor} from './weekly-availability-editor.js?v=4';
import {mountShortcutSettings} from './shortcut-settings.js?v=1';

/** Settings form lifecycle; all editor callbacks read the host's current draft. */
export function createSettingsForm({document,getDraft,setDraft,getApplied,getUser,settingsSync,onDirty,onControlsRefresh,onSaveBar,tr,getLocale,updateBrowserPushHint}) {
    document.getElementById('settings-reschedule-completed')?.addEventListener('change',event=>{const draft=getDraft();draft.planning={...(draft.planning||{}),rescheduleCompleted:event.target.checked};onDirty()});
    function enterSettingsPage() {
        const recovery = settingsSync.state().pending,user=getUser();
        setDraft(cloneDeep(recovery && user?.uid && recovery.ownerId === user.uid ? recovery.settings : getApplied()));
        populateSettingsForm();onControlsRefresh();onSaveBar(false);
    }

    function setActiveTile(containerId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.option-tile').forEach(el => {
            el.classList.toggle('active', el.dataset.value === String(value));
        });
    }

    function setActiveSwatch(containerId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.swatch').forEach(el => {
            el.classList.toggle('active', el.dataset.value === String(value));
        });
    }

    function updateYoutubeRowVisibility() {
        const row = document.getElementById('youtube-ambient-row');
        if (row) row.style.display = getDraft().appearance.ambientSound === 'custom' ? 'block' : 'none';
    }

    function populateTimezoneSelect() {
        const select = document.getElementById('settings-timezone');
        if (!select) return;
        if (!select.dataset.populated) {
            let zones = [];
            try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) {
                zones = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Berlin','Europe/Paris','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Australia/Sydney','Australia/Brisbane','Pacific/Auckland'];
            }
            select.innerHTML = zones.map(z => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`).join('');
            select.dataset.populated = 'true';
        }
        select.value = getDraft().profile.timezone;
    }

    let weeklyAvailabilityEditor=null,planningPreferencesEditor=null,shortcutSettingsEditor=null;
    function populateSettingsForm() {
        shortcutSettingsEditor ||= mountShortcutSettings({root:document.getElementById('shortcut-settings-editor'),getValue:()=>getDraft().accessibility.shortcuts,onChange:value=>{getDraft().accessibility.shortcuts=value;onDirty()}});
        shortcutSettingsEditor.refresh();
        planningPreferencesEditor ||= mountPlanningPreferencesEditor({root:document.getElementById('planning-preferences-editor'),getValue:()=>getDraft().planning||{},onChange:value=>{getDraft().planning={...(getDraft().planning||{}),...value};onDirty()}});
        planningPreferencesEditor?.refresh();
        weeklyAvailabilityEditor ||= mountWeeklyAvailabilityEditor({root:document.getElementById('weekly-availability-editor'),getValue:()=>getDraft().planning?.weeklyAvailability??null,onChange:value=>{getDraft().planning={...(getDraft().planning||{}),weeklyAvailability:value};onDirty()}});
        weeklyAvailabilityEditor?.refresh();
        const completedToggle=document.getElementById('settings-reschedule-completed');if(completedToggle)completedToggle.checked=getDraft().planning?.rescheduleCompleted===true;
        const user = getUser();

        const emailEl = document.getElementById('settings-current-email');
        if (emailEl) emailEl.textContent = user ? user.email : '—';

        const signinMethodEl = document.getElementById('settings-signin-method');
        if (signinMethodEl && user) {
            const providerId = user.providerData[0]?.providerId || 'password';
            const labels = { 'password': 'Email & Password', 'google.com': 'Google', 'github.com': 'GitHub', 'microsoft.com': 'Microsoft' };
            signinMethodEl.textContent = labels[providerId] || providerId;
        }

        const lastSigninEl = document.getElementById('security-last-signin');
        if (lastSigninEl && user?.metadata?.lastSignInTime) {
            const locale = getLocale(getApplied().accessibility.language || 'en');
            lastSigninEl.textContent = `${tr('last_signin')}: ${new Date(user.metadata.lastSignInTime).toLocaleString(locale)}`;
        }

        const displayNameEl = document.getElementById('settings-display-name');
        if (displayNameEl) displayNameEl.value = getDraft().profile.displayName || '';

        const birthdayEl = document.getElementById('settings-birthday');
        if (birthdayEl) birthdayEl.value = getDraft().profile.birthday || '';

        const avatarPreview = document.getElementById('settings-avatar-preview');
        if (avatarPreview) {
            avatarPreview.src = getDraft().profile.avatarURL || user?.photoURL || `https://ui-avatars.com/api/?name=User&background=a855f7&color=fff`;
        }
        const avatarUrlEl = document.getElementById('settings-avatar-url');
        if (avatarUrlEl) {
            avatarUrlEl.value = (getDraft().profile.avatarURL && !getDraft().profile.avatarURL.startsWith('data:')) ? getDraft().profile.avatarURL : '';
        }

        populateTimezoneSelect();

        setActiveTile('density-options', getDraft().accessibility.density);
        setActiveTile('time-format-options', getDraft().accessibility.timeFormat);
        setActiveTile('language-options', getDraft().accessibility.language || 'en');
        const reduceMotionEl = document.getElementById('settings-reduce-motion');
        if (reduceMotionEl) reduceMotionEl.checked = !!getDraft().accessibility.reduceMotion;

        setActiveTile('mode-options', getDraft().appearance.mode);
        setActiveSwatch('theme-options', getDraft().appearance.theme);
        setActiveSwatch('text-color-options', getDraft().appearance.textColor || 'default');
        setActiveTile('font-options', getDraft().appearance.font);
        setActiveSwatch('background-options', getDraft().appearance.background);
        setActiveSwatch('cursor-options', getDraft().appearance.cursor);
        setActiveTile('ambient-options', getDraft().appearance.ambientSound);

        const confettiEl = document.getElementById('settings-confetti-toggle');
        if (confettiEl) confettiEl.checked = !!getDraft().appearance.confetti;

        const notifEnabledEl = document.getElementById('settings-notif-enabled');
        if (notifEnabledEl) notifEnabledEl.checked = !!getDraft().notifications.enabled;

        const notifBoardCompletionEl = document.getElementById('settings-notif-board-completion');
        if (notifBoardCompletionEl) notifBoardCompletionEl.checked = !!getDraft().notifications.boardCompletion;

        const notifBedtimeEl = document.getElementById('settings-notif-bedtime');
        if (notifBedtimeEl) notifBedtimeEl.checked = !!getDraft().notifications.bedtimeReminders;

        const notifBrowserPushEl = document.getElementById('settings-notif-browser-push');
        if (notifBrowserPushEl) notifBrowserPushEl.checked = !!getDraft().notifications.browserPush;
        updateBrowserPushHint();

        const volumeEl = document.getElementById('ambient-volume');
        if (volumeEl) volumeEl.value = getDraft().appearance.ambientVolume ?? 35;

        const youtubeUrlEl = document.getElementById('settings-ambient-youtube-url');
        if (youtubeUrlEl) youtubeUrlEl.value = getDraft().appearance.customAmbientYoutubeUrl || '';
        updateYoutubeRowVisibility();
    }

    return {enter:enterSettingsPage,populate:populateSettingsForm,setActiveTile,setActiveSwatch,updateYoutubeRowVisibility};
}
