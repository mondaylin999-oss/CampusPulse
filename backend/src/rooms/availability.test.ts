// ===========================================================================
//  availability.test.ts — the rules that decide whether a room is free.
//
//      cd backend && npm test
//
//  These are the cases that are easy to get wrong and expensive to get wrong:
//  back-to-back classes, overlapping bookings, a class moved to another room,
//  a holiday, a closed room, and "free for at least two hours".
// ===========================================================================

import { describe, expect, it } from "vitest";
import {
  effectiveSessionsForDate,
  findTimetableConflicts,
  freeForWindow,
  nextClassBreak,
  roomAvailabilityAt,
  type BookingRow,
  type ExceptionRow,
  type WeeklyEntry,
} from "./availability.js";

const MONDAY = 1;
const DATE = "2026-09-14"; // a Monday

/** Room 325's Monday, as the worked example in the brief describes it. */
const entries: WeeklyEntry[] = [
  entry({ id: 1, roomId: 325, start: 9 * 60, end: 10 * 60, batchName: "First Year CS" }),
  entry({ id: 2, roomId: 325, start: 10 * 60, end: 11 * 60, batchName: "Second Year IT" }),
  entry({ id: 3, roomId: 325, start: 13 * 60, end: 14 * 60, batchName: "Third Year CS" }),
  entry({ id: 4, roomId: 326, start: 15 * 60, end: 16 * 60, batchName: "First Year IT" }),
];

function entry(input: { id: number; roomId: number; start: number; end: number; batchName: string; day?: number }): WeeklyEntry {
  return {
    id: input.id,
    roomId: input.roomId,
    dayOfWeek: input.day ?? MONDAY,
    startMinute: input.start,
    endMinute: input.end,
    title: null,
    teacher: "Daw Hla Hla",
    batchId: input.id,
    batchName: input.batchName,
    subjectId: null,
    subjectName: null,
    subjectCode: null,
    effectiveFrom: null,
    effectiveTo: null,
    active: true,
  };
}

function exception(input: Partial<ExceptionRow> & { kind: ExceptionRow["kind"]; id: number }): ExceptionRow {
  return {
    entryId: null,
    roomId: null,
    newRoomId: null,
    batchId: null,
    batchName: null,
    subjectId: null,
    subjectName: null,
    title: null,
    teacher: null,
    startMinute: null,
    endMinute: null,
    reason: null,
    ...input,
  };
}

const sessionsFor = (roomId: number, exceptions: ExceptionRow[] = []) =>
  effectiveSessionsForDate({ dateKey: DATE, dayOfWeek: MONDAY, entries, exceptions }).get(roomId) ?? [];

describe("the plain weekly timetable", () => {
  it("is occupied during a class, and names the class", () => {
    const status = roomAvailabilityAt(sessionsFor(325), 9 * 60 + 30);
    expect(status.status).toBe("occupied");
    expect(status.current?.batchName).toBe("First Year CS");
  });

  it("frees up at the end of a run of back-to-back classes, not at the end of the first", () => {
    // 09:00-10:00 then 10:00-11:00 with no gap: at 09:30 the room is not
    // usable until 11:00, even though the class running now ends at 10:00.
    const status = roomAvailabilityAt(sessionsFor(325), 9 * 60 + 30);
    expect(status.freeAtTime).toBe("11:00");
  });

  it("is available between classes and says how long for", () => {
    const status = roomAvailabilityAt(sessionsFor(325), 12 * 60);
    expect(status.status).toBe("available");
    expect(status.freeForMinutes).toBe(60);
    expect(status.freeForLabel).toBe("1 hour");
    expect(status.next?.batchName).toBe("Third Year CS");
  });

  it("stays free until the end of the teaching day when nothing else is booked", () => {
    const status = roomAvailabilityAt(sessionsFor(325), 14 * 60 + 25, { dayEndMinute: 16 * 60 });
    expect(status.status).toBe("available");
    expect(status.freeForLabel).toBe("1 hour 35 minutes");
  });

  it("treats a day with no classes as free all day", () => {
    const empty = effectiveSessionsForDate({ dateKey: DATE, dayOfWeek: 7, entries, exceptions: [] });
    expect(roomAvailabilityAt(empty.get(325) ?? [], 10 * 60).status).toBe("available");
  });
});

describe("overlapping sessions", () => {
  it("is busy until the later of two overlapping bookings ends", () => {
    const overlapping = [
      entry({ id: 10, roomId: 500, start: 9 * 60, end: 11 * 60, batchName: "A" }),
      entry({ id: 11, roomId: 500, start: 10 * 60, end: 12 * 60, batchName: "B" }),
    ];
    const sessions = effectiveSessionsForDate({ dateKey: DATE, dayOfWeek: MONDAY, entries: overlapping, exceptions: [] }).get(500) ?? [];
    expect(roomAvailabilityAt(sessions, 10 * 60 + 30).freeAtTime).toBe("12:00");
  });
});

describe("exceptions", () => {
  it("a cancelled class leaves the room free", () => {
    const sessions = sessionsFor(325, [exception({ id: 1, kind: "cancel", entryId: 1 })]);
    const status = roomAvailabilityAt(sessions, 9 * 60 + 30);
    expect(status.status).toBe("available");
    // It is only free until the next class at 10:00 — the rest of the day is unchanged.
    expect(status.freeForMinutes).toBe(30);
  });

  it("a moved class empties the old room and fills the new one", () => {
    const moved = [exception({ id: 2, kind: "move_room", entryId: 1, newRoomId: 326, reason: "Projector broken" })];
    expect(roomAvailabilityAt(sessionsFor(325, moved), 9 * 60 + 30).status).toBe("available");

    const arrived = roomAvailabilityAt(sessionsFor(326, moved), 9 * 60 + 30);
    expect(arrived.status).toBe("occupied");
    expect(arrived.current?.origin).toBe("moved_in");
  });

  it("a retimed class occupies its new hours and not its old ones", () => {
    const retimed = [exception({ id: 3, kind: "retime", entryId: 3, startMinute: 15 * 60, endMinute: 16 * 60 })];
    const sessions = sessionsFor(325, retimed);
    expect(roomAvailabilityAt(sessions, 13 * 60 + 30).status).toBe("available");
    expect(roomAvailabilityAt(sessions, 15 * 60 + 30).status).toBe("occupied");
  });

  it("a special class added for one date occupies the room", () => {
    const extra = [exception({ id: 4, kind: "extra", roomId: 325, startMinute: 16 * 60, endMinute: 17 * 60, title: "Revision class" })];
    const status = roomAvailabilityAt(sessionsFor(325, extra), 16 * 60 + 10);
    expect(status.status).toBe("occupied");
    expect(status.current?.origin).toBe("extra");
  });

  it("a holiday clears the whole weekly grid for that date", () => {
    const holiday = [exception({ id: 5, kind: "holiday", reason: "Thadingyut" })];
    expect(sessionsFor(325, holiday)).toHaveLength(0);
    expect(roomAvailabilityAt(sessionsFor(325, holiday), 9 * 60 + 30).status).toBe("available");
  });

  it("a closed room reads as closed, not merely occupied", () => {
    const closed = [exception({ id: 6, kind: "room_closed", roomId: 326, reason: "Water leak" })];
    const status = roomAvailabilityAt(sessionsFor(326, closed), 11 * 60);
    expect(status.status).toBe("closed");
    expect(status.current?.note).toBe("Water leak");
  });
});

describe("campus-level insights", () => {
  it("finds the next cluster of rooms that will be free together", () => {
    const rooms = [
      { availability: { status: "occupied", freeAtMinute: 10 * 60 + 40 } },
      { availability: { status: "occupied", freeAtMinute: 10 * 60 + 40 } },
      { availability: { status: "occupied", freeAtMinute: 11 * 60 } },
      { availability: { status: "available", freeAtMinute: null } },
    ] as any[];

    expect(nextClassBreak(rooms, 10 * 60)).toEqual({
      count: 2,
      freeAtTime: "10:40",
    });
  });
});

describe("rooms held by agent", () => {
  const booking = (over: Partial<BookingRow> & { id: number; roomId: number; startMinute: number; endMinute: number }): BookingRow => ({
    purpose: "Agent meeting",
    bookedByName: "Daw Khin",
    ...over,
  });

  const withBooking = (roomId: number, bookings: BookingRow[], exceptions: ExceptionRow[] = []) =>
    effectiveSessionsForDate({ dateKey: DATE, dayOfWeek: MONDAY, entries, exceptions, bookings }).get(roomId) ?? [];

  it("a booking makes the room occupied, like a class does", () => {
    const sessions = withBooking(325, [booking({ id: 1, roomId: 325, startMinute: 11 * 60, endMinute: 12 * 60 })]);
    const status = roomAvailabilityAt(sessions, 11 * 60 + 20);
    expect(status.status).toBe("occupied");
    expect(status.current?.origin).toBe("booking");
    expect(status.current?.label).toBe("Agent meeting");
  });

  it("a booking butting onto a class extends when the room frees up", () => {
    // 325 teaches 09:00-10:00 then 10:00-11:00; a booking 11:00-12:00 means a
    // student at 09:30 must wait until 12:00, not 11:00.
    const sessions = withBooking(325, [booking({ id: 2, roomId: 325, startMinute: 11 * 60, endMinute: 12 * 60 })]);
    expect(roomAvailabilityAt(sessions, 9 * 60 + 30).freeAtTime).toBe("12:00");
  });

  it("a booking still holds the room on a university holiday", () => {
    // The weekly grid is cleared, but somebody deliberately booked that date.
    const holiday = [exception({ id: 9, kind: "holiday", reason: "Thadingyut" })];
    const sessions = withBooking(325, [booking({ id: 3, roomId: 325, startMinute: 9 * 60, endMinute: 10 * 60 })], holiday);
    expect(sessions).toHaveLength(1);
    expect(roomAvailabilityAt(sessions, 9 * 60 + 30).status).toBe("occupied");
  });

  it("a booked window is not offered to the next booker", () => {
    const sessions = withBooking(321, [booking({ id: 4, roomId: 321, startMinute: 14 * 60, endMinute: 16 * 60 })]);
    expect(freeForWindow(sessions, 15 * 60, 60)).toBe(false);
    expect(freeForWindow(sessions, 16 * 60, 60)).toBe(true); // butting up is allowed
  });
});

describe("find a room free for at least N minutes", () => {
  it("rejects a room that frees up part way through the window", () => {
    // At 12:00 room 325 is free, but only for an hour — not enough for two.
    expect(freeForWindow(sessionsFor(325), 12 * 60, 60)).toBe(true);
    expect(freeForWindow(sessionsFor(325), 12 * 60, 120)).toBe(false);
  });

  it("accepts a room with nothing at all in the window", () => {
    expect(freeForWindow(sessionsFor(325), 14 * 60, 180)).toBe(true);
  });
});

describe("conflict prevention", () => {
  const existing = entries.map(row => ({
    id: row.id,
    roomId: row.roomId,
    batchId: row.batchId,
    dayOfWeek: row.dayOfWeek,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    active: row.active,
  }));

  const proposed = (over: Partial<(typeof existing)[number]>) => ({
    roomId: 325,
    batchId: 99,
    dayOfWeek: MONDAY,
    startMinute: 9 * 60 + 30,
    endMinute: 10 * 60 + 30,
    effectiveFrom: null,
    effectiveTo: null,
    ...over,
  });

  it("refuses a second class in the same room at the same time", () => {
    expect(findTimetableConflicts({ proposed: proposed({}), existing }).clash).toBe(true);
  });

  it("allows a class that starts exactly when the last one ends", () => {
    expect(findTimetableConflicts({ proposed: proposed({ startMinute: 11 * 60, endMinute: 12 * 60 }), existing }).clash).toBe(false);
  });

  it("refuses to put one batch in two rooms at once", () => {
    const clash = findTimetableConflicts({ proposed: proposed({ roomId: 326, batchId: 1 }), existing });
    expect(clash.batch).toHaveLength(1);
  });

  it("does not let an entry clash with itself while being edited", () => {
    // Entry 1 is room 325, 09:00-10:00. Shortening it to 09:00-09:30 touches
    // only itself, so ignoring it must leave no conflict at all.
    const shortened = proposed({ batchId: 1, startMinute: 9 * 60, endMinute: 9 * 60 + 30 });
    expect(findTimetableConflicts({ proposed: shortened, existing }).room).toHaveLength(1);
    expect(findTimetableConflicts({ proposed: shortened, existing, ignoreId: 1 }).clash).toBe(false);
  });

  it("ignores entries from another term", () => {
    const lastTerm = existing.map(row => ({ ...row, effectiveTo: "2026-01-31" }));
    const clash = findTimetableConflicts({ proposed: proposed({ effectiveFrom: "2026-06-01" }), existing: lastTerm });
    expect(clash.clash).toBe(false);
  });
});
