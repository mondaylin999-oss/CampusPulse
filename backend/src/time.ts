// ===========================================================================
//  time.ts — the university's own clock and calendar.
//
//  EVERY time decision in this platform is taken in the university's local
//  timezone (CAMPUS_TIMEZONE in .env, Asia/Yangon by default) — never in the
//  server's timezone and never in UTC. A room is "occupied at 09:30" because
//  it is 09:30 ON CAMPUS, whatever the machine hosting the API thinks.
//
//  The month helpers were written for the school-bus module (a seat is sold by
//  the calendar month) and are used unchanged; the day/minute helpers below
//  them are what the room availability calculator runs on.
// ===========================================================================

import { ENV } from "./env.js";

export const CAMPUS_TIMEZONE = ENV.timezone;

/** Kept for the bus module, which was written against this name. */
export const MYANMAR_TIMEZONE = CAMPUS_TIMEZONE;

// --- reading the campus clock ----------------------------------------------

function parts(now: Date) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => formatted.find(part => part.type === type)?.value ?? "";
  return value;
}

/** Hour of day 0–23 on campus. */
export function campusHour(now = new Date()) {
  return Number(parts(now)("hour"));
}

/** "YYYY-MM-DD" on campus. */
export function campusDateKey(now = new Date()) {
  const value = parts(now);
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Minutes since local midnight on campus: 09:30 -> 570. */
export function campusMinuteOfDay(now = new Date()) {
  const value = parts(now);
  return Number(value("hour")) * 60 + Number(value("minute"));
}

/**
 * ISO-8601 weekday on campus: 1 = Monday … 7 = Sunday.
 * Derived from the date key rather than from Date#getDay so it cannot be
 * thrown off by the server sitting on the other side of midnight.
 */
export function campusDayOfWeek(now = new Date()) {
  return isoDayOfWeek(campusDateKey(now));
}

/** ISO-8601 weekday of a "YYYY-MM-DD" date key. */
export function isoDayOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1)).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 7 : weekday;
}

/** Is this a real "YYYY-MM-DD"? */
export function isDateKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
}

/** A readable campus timestamp for logs and the site header. */
export function campusTimeLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAMPUS_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** Everything the availability calculator needs about "now", in one read. */
export function campusNow(now = new Date()) {
  const dateKey = campusDateKey(now);
  return {
    iso: now.toISOString(),
    dateKey,
    dayOfWeek: isoDayOfWeek(dateKey),
    minuteOfDay: campusMinuteOfDay(now),
    label: campusTimeLabel(now),
    timezone: CAMPUS_TIMEZONE,
  };
}

// --- minutes <-> "HH:MM" ---------------------------------------------------

/** 540 -> "09:00". 1440 (end of day) -> "24:00". */
export function minutesToClock(minutes: number) {
  const safe = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** "09:00" -> 540. Returns null when the text is not a time. */
export function clockToMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]|24):([0-5]\d)$/.exec(clock.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes > 1440 ? null : minutes;
}

/** "1 hour 35 minutes", "45 minutes", "2 hours" — for the "available for" line. */
export function humanDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} minute${rest === 1 ? "" : "s"}`;
  if (!rest) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${rest} minute${rest === 1 ? "" : "s"}`;
}

/** "2026-09-14" -> "Monday 14 September 2026". */
export function dateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The date key `count` days after `dateKey`. */
export function addDays(dateKey: string, count: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const moved = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + count));
  return moved.toISOString().slice(0, 10);
}

// ===========================================================================
//  Month helpers — used by the school-bus module, where a seat is sold for a
//  whole calendar month. Unchanged in behaviour from the original bus system.
// ===========================================================================

/** "YYYY-MM" on campus — the month a bus seat is sold for. */
export function campusMonthKey(now = new Date()) {
  return campusDateKey(now).slice(0, 7);
}

/** The month `count` months after `month` ("2026-08" + 2 -> "2026-10"). */
export function addMonths(month: string, count: number) {
  const [year, index] = month.split("-").map(Number);
  const zeroBased = (year ?? 1970) * 12 + ((index ?? 1) - 1) + count;
  return `${String(Math.floor(zeroBased / 12)).padStart(4, "0")}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/** Is this a real "YYYY-MM"? */
export function isMonthKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** How many days that month has. */
export function daysInMonth(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, index ?? 1, 0)).getUTCDate();
}

/** A readable month name: "2026-09" -> "September 2026". */
export function monthLabel(month: string) {
  if (!isMonthKey(month)) return month;
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, index! - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The instant a departure happens, from a campus wall-clock date and time.
 * Myanmar is UTC+06:30 all year — the country has never used daylight saving —
 * so the conversion is a fixed offset rather than a timezone lookup.
 */
export const MYANMAR_UTC_OFFSET_MINUTES = 6 * 60 + 30;

export function campusWallClockToDate(month: string, day: number, time: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year!, monthIndex! - 1, day, hour ?? 0, minute ?? 0) - MYANMAR_UTC_OFFSET_MINUTES * 60_000);
}

// --- names the bus module was written against ------------------------------
// Kept so backend/src/transport.ts continues to work exactly as it did.
export const yangonDateKey = campusDateKey;
export const yangonHour = campusHour;
export const yangonMonthKey = campusMonthKey;
export const yangonTimeLabel = campusTimeLabel;
export const yangonWallClockToDate = campusWallClockToDate;
