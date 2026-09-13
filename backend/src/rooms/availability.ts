// ===========================================================================
//  availability.ts — THE CORE RULE OF THE PLATFORM.
//
//  A room's status is NEVER stored and NEVER switched by hand. It is worked
//  out, every time it is asked for, from three things:
//
//        the current day  +  the current time  +  the room's timetable
//
//  and the timetable itself is the weekly grid (`timetable_entries`) with that
//  date's exceptions (`schedule_exceptions`) layered on top.
//
//  Everything in this file is a PURE FUNCTION over plain data: no database, no
//  clock, no HTTP. That is deliberate — the rules can be read, reasoned about
//  and tested on their own, and the same functions serve the public room board,
//  the "find me a room" search and the admin screens.
//
//  TIME UNITS
//  ----------
//  Minutes since local midnight, everywhere. 09:00 is 540; a day ends at 1440.
//  Two sessions overlap when  aStart < bEnd  &&  bStart < aEnd  — touching ends
//  (10:00-11:00 after 09:00-10:00) do NOT overlap, which is what a university
//  timetable means by back-to-back.
// ===========================================================================

import { humanDuration, minutesToClock } from "../time.js";

// --- the shapes this module works on ---------------------------------------

/** One weekly timetable row, already flattened for the calculator. */
export type WeeklyEntry = {
  id: number;
  roomId: number;
  dayOfWeek: number; // 1 = Monday … 7 = Sunday
  startMinute: number;
  endMinute: number;
  title: string | null;
  teacher: string | null;
  batchId: number | null;
  batchName: string | null;
  subjectId: number | null;
  subjectName: string | null;
  subjectCode: string | null;
  effectiveFrom: string | null; // "YYYY-MM-DD"
  effectiveTo: string | null;
  active: boolean;
};

/** One exception row for the date being calculated. */
export type ExceptionRow = {
  id: number;
  kind: "cancel" | "move_room" | "retime" | "extra" | "holiday" | "room_closed";
  entryId: number | null;
  roomId: number | null;
  newRoomId: number | null;
  batchId: number | null;
  batchName: string | null;
  subjectId: number | null;
  subjectName: string | null;
  title: string | null;
  teacher: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
};

/**
 * One session that really occupies a room on the date asked about.
 * `origin` says why it is there, so the UI can mark a moved or added class.
 */
export type EffectiveSession = {
  entryId: number | null;
  exceptionId: number | null;
  roomId: number;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
  label: string;
  batchName: string | null;
  subjectName: string | null;
  teacher: string | null;
  origin: "timetable" | "moved_in" | "retimed" | "extra" | "closure";
  note: string | null;
};

export type RoomStatus = "available" | "occupied" | "closed";

export type RoomAvailability = {
  status: RoomStatus;
  /** The session happening right now, if any. */
  current: EffectiveSession | null;
  /** The next session after now, if any. */
  next: EffectiveSession | null;
  /** Occupied: the minute the room frees up (end of the back-to-back run). */
  freeAtMinute: number | null;
  freeAtTime: string | null;
  /** Available: how long it stays free, in minutes, and in words. */
  freeForMinutes: number;
  freeForLabel: string;
  /** True when the room is free but a class starts within `soonMinutes`. */
  endingSoon: boolean;
  /** Every session on this room for the whole date, in order. */
  sessions: EffectiveSession[];
};

const DAY_END_DEFAULT = 20 * 60; // 20:00
const SOON_MINUTES = 15;

// --- small helpers ---------------------------------------------------------

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/** Is `dateKey` inside this entry's term? NULL on either side means no limit. */
function withinTerm(entry: WeeklyEntry, dateKey: string) {
  if (entry.effectiveFrom && dateKey < entry.effectiveFrom) return false;
  if (entry.effectiveTo && dateKey > entry.effectiveTo) return false;
  return true;
}

function labelFor(input: { batchName: string | null; subjectName: string | null; title: string | null }) {
  // "First Year CS — Programming I", or whichever halves exist.
  const parts = [input.batchName, input.subjectName ?? input.title].filter(Boolean);
  return parts.length ? parts.join(" — ") : "Reserved";
}

function toSession(input: Omit<EffectiveSession, "startTime" | "endTime" | "label"> & { label?: string }): EffectiveSession {
  return {
    ...input,
    startTime: minutesToClock(input.startMinute),
    endTime: minutesToClock(input.endMinute),
    label: input.label ?? labelFor({ batchName: input.batchName, subjectName: input.subjectName, title: null }),
  };
}

// ===========================================================================
//  1. THE WEEKLY GRID + THAT DATE'S EXCEPTIONS  ->  what really happens
// ===========================================================================

/**
 * Works out every session that really occupies a room on one date.
 *
 * The layering, in order:
 *   holiday      — the whole weekly grid for that date is dropped. Anything an
 *                  administrator deliberately ADDED for the date (an `extra`)
 *                  still stands, because adding it on a holiday was a choice.
 *   cancel       — that one class does not happen.
 *   move_room    — the class happens, in a different room.
 *   retime       — the class happens, at different hours.
 *                  (move_room and retime can both apply to the same class.)
 *   extra        — a class that is not in the weekly grid at all.
 *   room_closed  — the room itself is out of use; it blocks the room exactly
 *                  like a class does, with no start/end meaning the whole day.
 *
 * Returns a Map keyed by room id, each list sorted by start time.
 */
export function effectiveSessionsForDate(input: {
  dateKey: string;
  dayOfWeek: number;
  entries: WeeklyEntry[];
  exceptions: ExceptionRow[];
}): Map<number, EffectiveSession[]> {
  const { dateKey, dayOfWeek, entries, exceptions } = input;

  const isHoliday = exceptions.some(row => row.kind === "holiday");

  // Exceptions that target one weekly entry, indexed so the loop below is a
  // lookup rather than a scan. A class can be both moved and retimed, so each
  // kind gets its own index instead of one "the exception" per entry.
  const cancelled = new Set<number>();
  const movedTo = new Map<number, ExceptionRow>();
  const retimed = new Map<number, ExceptionRow>();

  for (const row of exceptions) {
    if (row.entryId === null) continue;
    if (row.kind === "cancel") cancelled.add(row.entryId);
    else if (row.kind === "move_room") movedTo.set(row.entryId, row);
    else if (row.kind === "retime") retimed.set(row.entryId, row);
  }

  const byRoom = new Map<number, EffectiveSession[]>();
  const push = (session: EffectiveSession) => {
    const list = byRoom.get(session.roomId);
    if (list) list.push(session);
    else byRoom.set(session.roomId, [session]);
  };

  // ---- the weekly grid ----------------------------------------------------
  if (!isHoliday) {
    for (const entry of entries) {
      if (!entry.active) continue;
      if (entry.dayOfWeek !== dayOfWeek) continue;
      if (!withinTerm(entry, dateKey)) continue;
      if (cancelled.has(entry.id)) continue;

      const move = movedTo.get(entry.id);
      const time = retimed.get(entry.id);

      const roomId = move?.newRoomId ?? entry.roomId;
      const startMinute = time?.startMinute ?? entry.startMinute;
      const endMinute = time?.endMinute ?? entry.endMinute;

      const origin: EffectiveSession["origin"] = move ? "moved_in" : time ? "retimed" : "timetable";
      const note = move
        ? `Moved here today${move.reason ? ` — ${move.reason}` : ""}`
        : time
          ? `Time changed today${time.reason ? ` — ${time.reason}` : ""}`
          : null;

      push(
        toSession({
          entryId: entry.id,
          exceptionId: move?.id ?? time?.id ?? null,
          roomId,
          startMinute,
          endMinute,
          batchName: entry.batchName,
          subjectName: entry.subjectName ?? entry.title,
          teacher: entry.teacher,
          origin,
          note,
          label: labelFor({ batchName: entry.batchName, subjectName: entry.subjectName, title: entry.title }),
        }),
      );
    }
  }

  // ---- one-off additions and closures -------------------------------------
  for (const row of exceptions) {
    if (row.kind === "extra" && row.roomId !== null && row.startMinute !== null && row.endMinute !== null) {
      push(
        toSession({
          entryId: null,
          exceptionId: row.id,
          roomId: row.roomId,
          startMinute: row.startMinute,
          endMinute: row.endMinute,
          batchName: row.batchName,
          subjectName: row.subjectName ?? row.title,
          teacher: row.teacher,
          origin: "extra",
          note: row.reason ? `Special class — ${row.reason}` : "Special class added today",
          label: labelFor({ batchName: row.batchName, subjectName: row.subjectName, title: row.title }),
        }),
      );
    }

    if (row.kind === "room_closed" && row.roomId !== null) {
      // No hours given = shut for the whole day.
      push(
        toSession({
          entryId: null,
          exceptionId: row.id,
          roomId: row.roomId,
          startMinute: row.startMinute ?? 0,
          endMinute: row.endMinute ?? 1440,
          batchName: null,
          subjectName: null,
          teacher: null,
          origin: "closure",
          note: row.reason ?? "Room temporarily unavailable",
          label: row.title ?? "Room closed",
        }),
      );
    }
  }

  for (const list of byRoom.values()) list.sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  return byRoom;
}

// ===========================================================================
//  2. THE SESSIONS OF ONE ROOM  +  THE CLOCK  ->  available or occupied
// ===========================================================================

/**
 * How one room stands at one minute of the day.
 *
 * Occupied → when does it free up? Not simply "when this class ends": if the
 * next class starts the moment this one finishes, the room is not usable in
 * between, so the back-to-back run is followed to its end.
 *
 * Available → for how long? Until the next session starts, or until the end of
 * the teaching day when nothing else is booked. That is the number a student
 * actually needs: "will it stay free long enough for me to use it?"
 */
export function roomAvailabilityAt(
  sessions: EffectiveSession[],
  minuteOfDay: number,
  options: { dayEndMinute?: number; soonMinutes?: number } = {},
): RoomAvailability {
  const dayEnd = options.dayEndMinute ?? DAY_END_DEFAULT;
  const soon = options.soonMinutes ?? SOON_MINUTES;
  const ordered = [...sessions].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  // The session covering "now". Overlapping bookings can mean more than one —
  // the one that runs latest is what actually keeps the room busy.
  const covering = ordered.filter(session => session.startMinute <= minuteOfDay && minuteOfDay < session.endMinute);
  const next = ordered.find(session => session.startMinute > minuteOfDay) ?? null;

  if (covering.length) {
    const current = covering.reduce((latest, session) => (session.endMinute > latest.endMinute ? session : latest));

    // Follow the chain: a run of sessions that touch or overlap is one block of
    // busy time, and the room is only free when the whole run has ended.
    let freeAt = current.endMinute;
    let grew = true;
    while (grew) {
      grew = false;
      for (const session of ordered) {
        if (session.startMinute <= freeAt && session.endMinute > freeAt) {
          freeAt = session.endMinute;
          grew = true;
        }
      }
    }

    const closed = covering.some(session => session.origin === "closure");
    return {
      status: closed ? "closed" : "occupied",
      current,
      next: ordered.find(session => session.startMinute >= freeAt) ?? null,
      freeAtMinute: freeAt,
      freeAtTime: minutesToClock(freeAt),
      freeForMinutes: 0,
      freeForLabel: "0 minutes",
      endingSoon: freeAt - minuteOfDay <= soon,
      sessions: ordered,
    };
  }

  // Free right now — until the next class, or until the day ends.
  const freeUntil = next ? next.startMinute : Math.max(minuteOfDay, dayEnd);
  const freeFor = Math.max(0, freeUntil - minuteOfDay);

  return {
    status: "available",
    current: null,
    next,
    freeAtMinute: null,
    freeAtTime: null,
    freeForMinutes: freeFor,
    freeForLabel: humanDuration(freeFor),
    endingSoon: freeFor <= soon,
    sessions: ordered,
  };
}

/**
 * Will this room be free for the WHOLE of the next `minutes`, starting now?
 * Used by "I need a room for at least 2 hours" — a room that frees up in ten
 * minutes is not an answer to that question, so the window is checked against
 * every session rather than just the next one.
 */
export function freeForWindow(sessions: EffectiveSession[], fromMinute: number, minutes: number) {
  const until = fromMinute + minutes;
  return !sessions.some(session => overlaps(fromMinute, until, session.startMinute, session.endMinute));
}

// ===========================================================================
//  3. CONFLICTS — stopping two classes being put in one room
// ===========================================================================

export type ConflictCandidate = {
  id: number;
  roomId: number;
  batchId: number | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  active: boolean;
};

/** Do two term ranges share any date at all? NULL means open-ended. */
function termsOverlap(a: { effectiveFrom: string | null; effectiveTo: string | null }, b: { effectiveFrom: string | null; effectiveTo: string | null }) {
  if (a.effectiveTo && b.effectiveFrom && a.effectiveTo < b.effectiveFrom) return false;
  if (b.effectiveTo && a.effectiveFrom && b.effectiveTo < a.effectiveFrom) return false;
  return true;
}

/**
 * Finds every existing entry that would clash with a proposed one. Two kinds
 * of clash matter, and both are real mistakes rather than warnings:
 *
 *   room  — the same room is already teaching something at that hour
 *   batch — the same year/class is already somewhere else at that hour
 *
 * `ignoreId` is the entry being edited, which must not clash with itself.
 */
export function findTimetableConflicts(input: {
  proposed: { roomId: number; batchId: number | null; dayOfWeek: number; startMinute: number; endMinute: number; effectiveFrom: string | null; effectiveTo: string | null };
  existing: ConflictCandidate[];
  ignoreId?: number;
}) {
  const { proposed, existing, ignoreId } = input;
  const room: ConflictCandidate[] = [];
  const batch: ConflictCandidate[] = [];

  for (const candidate of existing) {
    if (!candidate.active) continue;
    if (ignoreId !== undefined && candidate.id === ignoreId) continue;
    if (candidate.dayOfWeek !== proposed.dayOfWeek) continue;
    if (!overlaps(proposed.startMinute, proposed.endMinute, candidate.startMinute, candidate.endMinute)) continue;
    if (!termsOverlap(proposed, candidate)) continue;

    if (candidate.roomId === proposed.roomId) room.push(candidate);
    else if (proposed.batchId !== null && candidate.batchId === proposed.batchId) batch.push(candidate);
  }

  return { room, batch, clash: room.length > 0 || batch.length > 0 };
}

export { overlaps, DAY_END_DEFAULT, SOON_MINUTES };
