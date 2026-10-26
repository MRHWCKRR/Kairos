import {mountCalendarImport} from '../../calendar-import.js';
import {eventSegmentsForDate} from '../../schedule-events.js';

export async function runCalendarImportJourney({document,window,getState,getIdentity,commit,session,lostResponse,wait,check}){
 let start='090000',end='100000';
 const feed=()=>['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kairos browser fixture//EN','X-WR-CALNAME:School','BEGIN:VEVENT','UID:class@example.test','DTSTART:20261026T'+start+'Z','DTEND:20261026T'+end+'Z','SUMMARY:Science <lab>','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const ui=mountCalendarImport({document,window,getIdentity,getState,getTimezone:()=> 'UTC',getToday:()=> '2026-10-25',ensurePlan:async()=>getIdentity().planId,commit:(...args)=>session.submit(...args),session,confirmRemove:async()=>true,fetchFeed:async()=>({calendar:feed(),url:'https://calendar.google.com/calendar/ical/fixture/public/basic.ics'})});
 const find=selector=>document.querySelector('.calendar-import-dialog '+selector);
 const field=(name,value)=>{const input=find('[name="'+name+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 try{
  check(await ui.open(),'Calendars should open');field('url','https://calendar.google.com/calendar/ical/fixture/public/basic.ics');find('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>!find('[data-calendar-preview-section]').hidden&&!find('[data-calendar-apply]').disabled);
  check(!find('lab'),'Calendar titles must be escaped in preview');check(!(getState().calendarSources||[]).length,'Preview must not import automatically');
  lostResponse();find('[data-calendar-apply]').click();await wait(()=>session.state().pending&&!session.state().busy);
  check(getState().calendarSources.length===1,'Lost acknowledgement still commits the source once');
  find('[data-calendar-retry]').click();await wait(()=>!session.state().pending&&!find('[data-calendar-refresh]')?.disabled);
  const source=getState().calendarSources[0],imported=()=>getState().scheduleEvents.filter(event=>event.calendarSourceId===source.id);
  check(imported().length===1,'Retry must not duplicate imported events');
  check(eventSegmentsForDate(imported(),'2026-10-26',{busyOnly:true}).length===1,'Busy calendar event must block its exact date');
  check(eventSegmentsForDate(imported(),'2026-11-02',{busyOnly:true}).length===0,'Imported event must not repeat weekly');
  start='103000';end='113000';find('[data-calendar-refresh]').click();
  await wait(()=>!find('[data-calendar-preview-section]').hidden&&!find('[data-calendar-apply]').disabled);
  check(imported()[0].start==='09:00','Refresh must wait for confirmation');find('[data-calendar-apply]').click();await wait(()=>imported()[0]?.start==='10:30'&&!find('[data-calendar-refresh]').disabled);
  check(imported().length===1,'Refresh must replace source events without duplicates');
  find('[data-calendar-remove]').click();await wait(()=>getState().calendarSources.length===0&&!getState().scheduleEvents.some(event=>event.calendarSourceId===source.id));
  check(getState().boards.length>0,'Removing a calendar must preserve tasks');
 }finally{ui.dispose();}
}
