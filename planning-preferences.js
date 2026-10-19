import {planningGapMinutes,planningDailyLimit} from './planning-slots.js?v=3';

// Stored beside weeklyAvailability in users/{uid}.settings.planning. Missing
// fields preserve the previous unlimited/back-to-back behavior; no migration.
export function normalisePlanningPreferences(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Review your saved planning defaults in Settings.');
 return {dailyLimitMinutes:planningDailyLimit(value),gapMinutes:planningGapMinutes(value)};
}
export function savedPlanningPreferences(userData){return normalisePlanningPreferences(userData?.settings?.planning??{})}
export function resolvePlanningPreferences(saved={},explicit={}){
 const defaults=normalisePlanningPreferences(saved);
 return normalisePlanningPreferences({dailyLimitMinutes:explicit.dailyLimitMinutes===undefined?defaults.dailyLimitMinutes:explicit.dailyLimitMinutes,gapMinutes:explicit.gapMinutes===undefined?defaults.gapMinutes:explicit.gapMinutes});
}
export function planningPreferencesText(saved,chosen=saved){
 const defaults=normalisePlanningPreferences(saved),actual=resolvePlanningPreferences(defaults,chosen),overrides=[];
 const limit=n=>n?n+' minutes per day':'no daily limit',gap=n=>n?n+'-minute gaps':'no added gap';
 if(actual.dailyLimitMinutes!==defaults.dailyLimitMinutes)overrides.push(limit(actual.dailyLimitMinutes));
 if(actual.gapMinutes!==defaults.gapMinutes)overrides.push(gap(actual.gapMinutes));
 return 'Saved planning defaults: '+limit(defaults.dailyLimitMinutes)+', '+gap(defaults.gapMinutes)+'. '+(overrides.length?'Overrides for this plan: '+overrides.join(', ')+'. ':'')+'Changes here apply only to this plan. Edit defaults in Settings → Personal → Planning defaults.';
}
