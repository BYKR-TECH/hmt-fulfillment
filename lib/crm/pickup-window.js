const INDIA_DATE_TIME_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** Default Delhivery pickup slot: 16:00 Asia/Kolkata. After 16:00 IST, use tomorrow 16:00. */
export function defaultPickupWindow(now = new Date()) {
  const parts = Object.fromEntries(INDIA_DATE_TIME_PARTS.formatToParts(now).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  let year = Number(parts.year);
  let month = Number(parts.month);
  let day = Number(parts.day);
  if (hour > 16 || (hour === 16 && minute > 0)) {
    const next = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: '16:00'
  };
}
