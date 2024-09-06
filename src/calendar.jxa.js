#!/usr/bin/env osascript -l JavaScript
/*
 * Find Next Calendar Meeting (within 5 minutes) and print as JSON.
 *
 * Huge credit to:
 * https://bru6.de/jxa/introduction-to-jxa
 * for making this in any way intelligble, since Apple's documentation is awful.
 *
 * Docs for EventKit:
 * https://developer.apple.com/documentation/eventkit
 */
ObjC.import("EventKit");
ObjC.import("Foundation");

// Today starts 3 hours ago
const today = new Date(Date.now());
today.setHours(today.getHours()-3);

// Tomorrow is 1 day from now
const tomorrow = new Date(Date.now());
tomorrow.setDate(tomorrow.getDate()+1);

// Get our calendar events from EventKit (ObjC bridge is much faster).
const store = $.EKEventStore.alloc.initWithAccessToEntityTypes($.EKEntityMaskEvent);
store.requestFullAccessToEventsWithCompletion(((granted, err) => {
  if (!granted) {
    console.log("WARN: Need access to Calendar. Check your privacy settings to ensure access was granted.")
  }
  if (err) {
    console.log("ERROR: ", err);
  }
}));
const calendars = store.calendarsForEntityType($.EKEntityTypeEvent);
const predicate = store.predicateForEventsWithStartDateEndDateCalendars(today, tomorrow, calendars);
const allEvents = store.eventsMatchingPredicate(predicate).js;

const now = new Date(Date.now());
// Soon is 5 minutes from now
const soon = new Date(now.getTime());
soon.setMinutes(soon.getMinutes()+5);

const greenHouseRegexp = /https:\/\/samsara.greenhouse.io[^\s"']+/;
const nameRegexp = /^Virtual Interview (?<name>[\w\s]+) for (?<position>[^-]+)/;
const entryToInterview = (entry) => {
  const interview = {};
  let match = false;

  const ghLink = greenHouseRegexp.exec(entry.notes);
  if (ghLink) {
    match = true;
    interview.link = ghLink[0];
    interview.scorecard = ghLink[0] + "#scorecard";
    interview.guide = ghLink[0] + "#interview_guide";
  }

  const nameMatch = nameRegexp.exec(entry.title);
  if (match && nameMatch) {
    interview.name = nameMatch.groups.name;
    interview.position = nameMatch.groups.position;
  }

  return interview;
};

const zoomRegexp = /https:\/\/(?<host>[^\s"'<]*.zoom.us)\/j\/(?<id>\w+)(?<params>[^\s"'<]*)/;
const pwdRegexp = /pwd=(?<pwd>[\w\.]+)/;

const findZoomLink = (str) => {
  const zoomMatch = zoomRegexp.exec(str);
  if (!zoomMatch) {
    return "";
  }

  const pwdMatch = pwdRegexp.exec(zoomMatch.groups.params || "");
  zoomMatch.groups.pwd = pwdMatch ? pwdMatch.groups.pwd : "";

  const { host, id, pwd } = zoomMatch.groups;
  return `zoommtg://${host}/join?confno=${id}&pwd=${pwd}`;
};

const entryToZoomLink = (entry) => {
  let link = findZoomLink(entry.location);
  if (!link) {
    link = findZoomLink(entry.notes);
  }
  return link;
};

const humanTime = (time) => {
  switch (typeof time) {
    case 'number':
      break;
    case 'string':
      time = +new Date(time);
      break;
    case 'object':
      if (time.constructor === Date) time = time.getTime();
      break;
    default:
      time = +new Date();
  }
  var time_formats = [
    [60, 'sec', 1], // 60
    [120, '1 min ago', '1 min from now'], // 60*2
    [3600, 'mins', 60], // 60*60, 60
    [7200, '1 hr ago', '1 hr from now'], // 60*60*2
    [86400, 'hrs', 3600], // 60*60*24, 60*60
  ];
  var seconds = (+new Date() - time) / 1000,
    token = 'ago',
    list_choice = 1;

  if (seconds == 0) {
    return 'Just now'
  }
  if (seconds < 0) {
    seconds = Math.abs(seconds);
    token = 'from now';
    list_choice = 2;
  }
  var i = 0,
    format;
  while (format = time_formats[i++])
    if (seconds < format[0]) {
      if (typeof format[2] == 'string')
        return format[list_choice];
      else
        return Math.floor(seconds / format[2]) + ' ' + format[1] + ' ' + token;
    }
  return time;
};

const events = allEvents
  .filter((event) => event.startDate.js < soon && now < event.endDate.js)
  .filter((event) => !event.isAllDay)
  .sort((a, b) => b.startDate.js.getTime() - a.startDate.js.getTime())
  .map((event) => ({
    title: event.title.js,
    location: event.location.js,
    startDate: event.startDate.js,
    endDate: event.endDate.js,
    notes: event.notes.js,
  })).map((event) => {
    event.zoom_link = entryToZoomLink(event);
    event.interview = entryToInterview(event);
    event.start_relative = humanTime(event.startDate);
    return event;
  });

JSON.stringify(events);
