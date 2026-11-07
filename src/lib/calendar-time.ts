import { DateTime, IANAZone } from "luxon";
export function validZone(zone: string) { return IANAZone.isValidZone(zone); }
export function wallOptions(wall: string, zone: string): { iso: string; offset: string }[] {
  if (!validZone(zone) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(wall)) return [];
  const date = DateTime.fromISO(wall, { zone });
  if (!date.isValid || date.toFormat("yyyy-MM-dd'T'HH:mm") !== wall) return [];
  return date.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis()).map(value => ({ iso: value.toISO()!, offset: value.toFormat("ZZ") }));
}
export function instant(value: string) {
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const date = DateTime.fromISO(value, { setZone: true });
  return date.isValid ? date : null;
}
export function validSchedule(value: { startAt: string; endAt: string; timeZone: string }) {
  const start = instant(value.startAt), end = instant(value.endAt);
  return validZone(value.timeZone) && !!start && !!end && end.toMillis() > start.toMillis() && [start, end].every(date => date.setZone(value.timeZone).offset === date.offset);
}
export function calendarRange(day: string, zone: string, week: boolean) {
  const start = DateTime.fromISO(day, { zone }).startOf(week ? "week" : "day");
  return { start: start.toISO()!, end: start.plus(week ? { weeks: 1 } : { days: 1 }).toISO()! };
}
