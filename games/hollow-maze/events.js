// Hollow Maze holiday calendar. Each event is active from 7 days before through 7 days after
// its day, by the player's local date. Overlaps go to the closest event day; ties go to the
// upcoming one. ?event=<id> (or ?event=none) in the URL forces an event for testing.

export const WINDOW_DAYS = 7;

// Anonymous Gregorian algorithm.
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

// Fourth Thursday of November.
export function thanksgiving(year) {
  const firstWeekday = new Date(year, 10, 1).getDay();
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7);
  return [10, firstThursday + 21];
}

const fixed = (month, day) => () => [month - 1, day];

// The `day` function returns [monthIndex, dayOfMonth] for a given year.
export const EVENTS = [
  { id: 'newyear', name: 'New Year', day: fixed(1, 1) },
  { id: 'valentine', name: 'Valentine’s Day', day: fixed(2, 14) },
  { id: 'stpatricks', name: 'St. Patrick’s Day', day: fixed(3, 17) },
  { id: 'easter', name: 'Easter', day: easter },
  { id: 'solstice', name: 'Summer Solstice', day: fixed(6, 21) },
  { id: 'july4', name: 'Independence Day', day: fixed(7, 4) },
  { id: 'halloween', name: 'Halloween', day: fixed(10, 31) },
  { id: 'thanksgiving', name: 'Thanksgiving', day: thanksgiving },
  { id: 'winter', name: 'Winter Holidays', day: fixed(12, 25) },
];

// Whole-day number for a local calendar date (immune to daylight-saving shifts).
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);

export function activeEvent(now = new Date()) {
  const today = dayNumber(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    for (const ev of EVENTS) {
      const [m, d] = ev.day(year);
      const diff = today - dayNumber(year, m, d); // negative = the event is still coming
      if (Math.abs(diff) > WINDOW_DAYS) continue;
      const closer = !best || Math.abs(diff) < Math.abs(best.diff) || (Math.abs(diff) === Math.abs(best.diff) && diff < best.diff);
      if (closer) best = { id: ev.id, name: ev.name, diff };
    }
  }
  return best ? best.id : 'none';
}

export function chooseEvent(search = location.search, now = new Date()) {
  const forced = new URLSearchParams(search).get('event');
  if (forced && (forced === 'none' || EVENTS.some((e) => e.id === forced))) return forced;
  return activeEvent(now);
}
