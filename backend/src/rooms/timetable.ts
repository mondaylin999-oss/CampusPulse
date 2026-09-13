// ===========================================================================
//  timetable.ts — the administrator's side of the timetable.
//
//  Two things live here:
//
//    1. The WEEKLY GRID (`timetable_entries`): create / edit / delete / search.
//       Nothing is written without first asking availability.ts whether it
//       would clash — the same room at the same hour, or the same batch in two
//       places at once. A clash is refused, with the clashing rows named.
//
//    2. The EXCEPTIONS (`schedule_exceptions`): the one-date changes. These
//       never touch the weekly grid, so cancelling Monday's 9am class does not
//       cancel it for the rest of the term.
// ===========================================================================

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../database.js";
import { batches, rooms, scheduleExceptions, subjects, timetableEntries, type ExceptionKind } from "../../drizzle/schema.js";
import { badRequest, notFound } from "../http.js";
import { minutesToClock } from "../time.js";
import { findTimetableConflicts, type ConflictCandidate } from "./availability.js";

const movedRoom = alias(rooms, "moved_room");

export type EntryInput = {
  roomId: number;
  batchId?: number | null;
  subjectId?: number | null;
  title?: string | null;
  teacher?: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  active?: boolean;
};

// --- reading ----------------------------------------------------------------

export type EntryFilter = { roomId?: number; batchId?: number; subjectId?: number; dayOfWeek?: number; search?: string };

export async function listEntries(filter: EntryFilter = {}) {
  const conditions = [];
  if (filter.roomId) conditions.push(eq(timetableEntries.roomId, filter.roomId));
  if (filter.batchId) conditions.push(eq(timetableEntries.batchId, filter.batchId));
  if (filter.subjectId) conditions.push(eq(timetableEntries.subjectId, filter.subjectId));
  if (filter.dayOfWeek) conditions.push(eq(timetableEntries.dayOfWeek, filter.dayOfWeek));
  if (filter.search?.trim()) {
    // One box searches everything an administrator is likely to type: a room
    // number, a batch, a subject, a teacher's name.
    const term = `%${filter.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(${rooms.roomNumber}) LIKE ${term}
        OR lower(coalesce(${batches.name}, '')) LIKE ${term}
        OR lower(coalesce(${batches.code}, '')) LIKE ${term}
        OR lower(coalesce(${subjects.name}, '')) LIKE ${term}
        OR lower(coalesce(${subjects.code}, '')) LIKE ${term}
        OR lower(coalesce(${timetableEntries.teacher}, '')) LIKE ${term}
        OR lower(coalesce(${timetableEntries.title}, '')) LIKE ${term})`,
    );
  }

  const rows = await db()
    .select({
      entry: timetableEntries,
      roomNumber: rooms.roomNumber,
      buildingCode: rooms.buildingCode,
      floorLevel: rooms.floorLevel,
      batchName: batches.name,
      batchCode: batches.code,
      subjectName: subjects.name,
      subjectCode: subjects.code,
    })
    .from(timetableEntries)
    .innerJoin(rooms, eq(rooms.id, timetableEntries.roomId))
    .leftJoin(batches, eq(batches.id, timetableEntries.batchId))
    .leftJoin(subjects, eq(subjects.id, timetableEntries.subjectId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.startMinute), asc(rooms.roomNumber));

  return rows.map(row => ({
    ...row,
    startTime: minutesToClock(row.entry.startMinute),
    endTime: minutesToClock(row.entry.endMinute),
  }));
}

// --- writing ----------------------------------------------------------------

/** Everything the conflict check needs, in one query. */
async function conflictCandidates(dayOfWeek: number): Promise<ConflictCandidate[]> {
  const rows = await db()
    .select({
      id: timetableEntries.id,
      roomId: timetableEntries.roomId,
      batchId: timetableEntries.batchId,
      dayOfWeek: timetableEntries.dayOfWeek,
      startMinute: timetableEntries.startMinute,
      endMinute: timetableEntries.endMinute,
      effectiveFrom: timetableEntries.effectiveFrom,
      effectiveTo: timetableEntries.effectiveTo,
      active: timetableEntries.active,
    })
    .from(timetableEntries)
    .where(eq(timetableEntries.dayOfWeek, dayOfWeek));
  return rows;
}

/** Turns a clash into the sentence the administrator actually needs to read. */
async function describeConflicts(conflicts: { room: ConflictCandidate[]; batch: ConflictCandidate[] }) {
  const ids = [...conflicts.room, ...conflicts.batch].map(row => row.id);
  if (!ids.length) return "";
  const detail = await listEntriesByIds(ids);
  const describe = (row: Awaited<ReturnType<typeof listEntriesByIds>>[number]) =>
    `Room ${row.roomNumber} ${row.startTime}-${row.endTime} (${row.batchName ?? row.entry.title ?? "reserved"})`;

  const lines: string[] = [];
  if (conflicts.room.length) {
    const rows = detail.filter(row => conflicts.room.some(clash => clash.id === row.entry.id));
    lines.push(`that room is already booked: ${rows.map(describe).join("; ")}`);
  }
  if (conflicts.batch.length) {
    const rows = detail.filter(row => conflicts.batch.some(clash => clash.id === row.entry.id));
    lines.push(`that class is already somewhere else: ${rows.map(describe).join("; ")}`);
  }
  return lines.join(", and ");
}

async function listEntriesByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await db()
    .select({
      entry: timetableEntries,
      roomNumber: rooms.roomNumber,
      batchName: batches.name,
    })
    .from(timetableEntries)
    .innerJoin(rooms, eq(rooms.id, timetableEntries.roomId))
    .leftJoin(batches, eq(batches.id, timetableEntries.batchId))
    .where(inArray(timetableEntries.id, ids));
  return rows.map(row => ({ ...row, startTime: minutesToClock(row.entry.startMinute), endTime: minutesToClock(row.entry.endMinute) }));
}

function assertSaneTimes(startMinute: number, endMinute: number) {
  if (endMinute <= startMinute) throw badRequest("The class must end after it starts.");
  if (startMinute < 0 || endMinute > 1440) throw badRequest("Class times must fall inside one day.");
}

export async function createEntry(input: EntryInput) {
  assertSaneTimes(input.startMinute, input.endMinute);

  const conflicts = findTimetableConflicts({
    proposed: {
      roomId: input.roomId,
      batchId: input.batchId ?? null,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
    },
    existing: await conflictCandidates(input.dayOfWeek),
  });

  if (conflicts.clash) throw badRequest(`This session cannot be saved — ${await describeConflicts(conflicts)}.`);

  const inserted = await db()
    .insert(timetableEntries)
    .values({
      roomId: input.roomId,
      batchId: input.batchId ?? null,
      subjectId: input.subjectId ?? null,
      title: input.title?.trim() || null,
      teacher: input.teacher?.trim() || null,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      active: input.active ?? true,
    })
    .returning();
  return inserted[0]!;
}

export async function updateEntry(id: number, input: Partial<EntryInput>) {
  const current = (await db().select().from(timetableEntries).where(eq(timetableEntries.id, id)).limit(1))[0];
  if (!current) throw notFound("That timetable entry no longer exists.");

  // The conflict check runs against the entry AS IT WILL BE, not as it is.
  const merged = {
    roomId: input.roomId ?? current.roomId,
    batchId: input.batchId !== undefined ? input.batchId : current.batchId,
    dayOfWeek: input.dayOfWeek ?? current.dayOfWeek,
    startMinute: input.startMinute ?? current.startMinute,
    endMinute: input.endMinute ?? current.endMinute,
    effectiveFrom: input.effectiveFrom !== undefined ? input.effectiveFrom : current.effectiveFrom,
    effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : current.effectiveTo,
  };
  assertSaneTimes(merged.startMinute, merged.endMinute);

  const conflicts = findTimetableConflicts({
    proposed: merged,
    existing: await conflictCandidates(merged.dayOfWeek),
    ignoreId: id, // an entry never clashes with itself
  });
  if (conflicts.clash) throw badRequest(`This change cannot be saved — ${await describeConflicts(conflicts)}.`);

  const patch: Record<string, unknown> = { ...merged };
  if (input.subjectId !== undefined) patch.subjectId = input.subjectId;
  if (input.title !== undefined) patch.title = input.title?.trim() || null;
  if (input.teacher !== undefined) patch.teacher = input.teacher?.trim() || null;
  if (input.active !== undefined) patch.active = input.active;

  await db().update(timetableEntries).set(patch).where(eq(timetableEntries.id, id));
  return { id };
}

export async function deleteEntry(id: number) {
  await db().delete(timetableEntries).where(eq(timetableEntries.id, id));
}

/**
 * A dry run of the conflict check, so the admin screen can warn while the form
 * is still open instead of only when Save is pressed.
 */
export async function checkEntry(input: {
  roomId: number;
  batchId?: number | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  ignoreId?: number;
}) {
  if (input.endMinute <= input.startMinute) return { clash: true, message: "The class must end after it starts." };
  const conflicts = findTimetableConflicts({
    proposed: {
      roomId: input.roomId,
      batchId: input.batchId ?? null,
      dayOfWeek: input.dayOfWeek,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
    },
    existing: await conflictCandidates(input.dayOfWeek),
    ignoreId: input.ignoreId,
  });
  return { clash: conflicts.clash, message: conflicts.clash ? `Cannot be saved — ${await describeConflicts(conflicts)}.` : "No conflict." };
}

// ===========================================================================
//  Exceptions — one-date changes
// ===========================================================================

export type ExceptionInput = {
  kind: ExceptionKind;
  onDate: string;
  entryId?: number | null;
  roomId?: number | null;
  newRoomId?: number | null;
  batchId?: number | null;
  subjectId?: number | null;
  title?: string | null;
  teacher?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  reason?: string | null;
};

export async function listExceptions(filter: { from?: string; to?: string; roomId?: number } = {}) {
  const conditions = [];
  if (filter.from) conditions.push(gte(scheduleExceptions.onDate, filter.from));
  if (filter.to) conditions.push(lte(scheduleExceptions.onDate, filter.to));
  if (filter.roomId) conditions.push(eq(scheduleExceptions.roomId, filter.roomId));

  return db()
    .select({
      exception: scheduleExceptions,
      roomNumber: rooms.roomNumber,
      newRoomNumber: movedRoom.roomNumber,
      batchName: batches.name,
      subjectName: subjects.name,
      entryDayOfWeek: timetableEntries.dayOfWeek,
      entryStartMinute: timetableEntries.startMinute,
      entryEndMinute: timetableEntries.endMinute,
      entryRoomId: timetableEntries.roomId,
    })
    .from(scheduleExceptions)
    .leftJoin(rooms, eq(rooms.id, scheduleExceptions.roomId))
    .leftJoin(movedRoom, eq(movedRoom.id, scheduleExceptions.newRoomId))
    .leftJoin(batches, eq(batches.id, scheduleExceptions.batchId))
    .leftJoin(subjects, eq(subjects.id, scheduleExceptions.subjectId))
    .leftJoin(timetableEntries, eq(timetableEntries.id, scheduleExceptions.entryId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(scheduleExceptions.onDate), asc(scheduleExceptions.id));
}

/**
 * Saves a one-date change. The shape rules mirror the database CHECK, but are
 * repeated here so the administrator gets a sentence instead of a constraint
 * name — and so `extra` sessions are also checked against what is already in
 * that room on that date.
 */
export async function createException(input: ExceptionInput, createdById: number | null) {
  const needsEntry = ["cancel", "move_room", "retime"].includes(input.kind);
  if (needsEntry && !input.entryId) throw badRequest("Choose which timetable entry this change applies to.");
  if (input.kind === "move_room" && !input.newRoomId) throw badRequest("Choose the room the class moves to.");
  if (input.kind === "extra" && !input.roomId) throw badRequest("Choose the room for the special class.");
  if (input.kind === "room_closed" && !input.roomId) throw badRequest("Choose the room that is unavailable.");
  if ((input.kind === "retime" || input.kind === "extra") && (input.startMinute == null || input.endMinute == null))
    throw badRequest("Give the new start and end time.");
  if (input.startMinute != null && input.endMinute != null) assertSaneTimes(input.startMinute, input.endMinute);

  const inserted = await db()
    .insert(scheduleExceptions)
    .values({
      kind: input.kind,
      onDate: input.onDate,
      entryId: input.entryId ?? null,
      roomId: input.roomId ?? null,
      newRoomId: input.newRoomId ?? null,
      batchId: input.batchId ?? null,
      subjectId: input.subjectId ?? null,
      title: input.title?.trim() || null,
      teacher: input.teacher?.trim() || null,
      startMinute: input.startMinute ?? null,
      endMinute: input.endMinute ?? null,
      reason: input.reason?.trim() || null,
      createdById,
    })
    .returning();
  return inserted[0]!;
}

export async function deleteException(id: number) {
  await db().delete(scheduleExceptions).where(eq(scheduleExceptions.id, id));
}
