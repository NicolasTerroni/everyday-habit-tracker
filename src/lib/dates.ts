import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function todayIn(timezone: string) {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

export function dayBounds(date: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  const localStart = `${date}T00:00:00`;
  const nextLabel = format(addDays(new Date(`${date}T12:00:00Z`), 1), "yyyy-MM-dd");
  return {
    start: fromZonedTime(localStart, timezone),
    end: fromZonedTime(`${nextLabel}T00:00:00`, timezone)
  };
}

export function dateIn(timestamp: Date, timezone: string) {
  return formatInTimeZone(timestamp, timezone, "yyyy-MM-dd");
}

export function minuteIn(timestamp: Date, timezone: string) {
  return formatInTimeZone(timestamp, timezone, "HH:mm");
}

export function dateAtLocalTime(date: string, time: string, timezone: string) {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}
