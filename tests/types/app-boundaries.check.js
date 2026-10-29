// @ts-check
import {createAuthSession} from '../../app-auth-session.js';
import {createPlannerWrites} from '../../app-planner-writes.js';
import {defaultSettings,cloneDeep} from '../../app-settings-model.js';

// Compiler assertions: an unused expect-error fails CI if a boundary loses its type.
const writes=createPlannerWrites();
writes.enqueue(async()=>({saved:true})).then(result=>result.saved);
// @ts-expect-error writes must be asynchronous
writes.enqueue(()=>123);
// @ts-expect-error load revision tickets require both revisions
writes.isCurrentLoad({load:1});
const settings=defaultSettings();
// @ts-expect-error reminder preferences are booleans
settings.notifications.browserPush='enabled';
// @ts-expect-error timezones are strings
settings.profile.timezone=10;
const copy=cloneDeep({operationId:'save-1'});
// @ts-expect-error cloning preserves field types
copy.operationId=1;
// @ts-expect-error auth lifecycle requires the complete security/loading host
createAuthSession({getUser:()=>null});
