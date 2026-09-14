// ===========================================================================
//  rooms.ts — the PostgreSQL side of the room board.
//
//  This module reads the timetable out of the database and hands it to the
//  pure calculator in availability.ts. It decides nothing about availability
//  itself; it only fetches, joins and assembles.
//
//  Everything here is PUBLIC: no login is needed to look up a free classroom.
// ===========================================================================

import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "../database.js";
import { batches, buildings, floors, rooms, scheduleExceptions, subjects, timetableEntries } from "../../drizzle/schema.js";
import { ENV } from "../env.js";
import { campusNow, dateLabel, isDateKey, isoDayOfWeek, minutesToClock } from "../time.js";
import {
  effectiveSessionsForDate,
  freeForWindow,
  roomAvailabilityAt,
  type EffectiveSession,
  type ExceptionRow,
  type RoomAvailability,
  type WeeklyEntry,
} from "./availability.js";

/** The kinds a room may be. Mirrors the room_kind enum in schema.sql. */
export const ROOM_KINDS = ["lecture", "lab", "seminar", "studio", "office"] as const;

// --- the shape the frontend receives ---------------------------------------

export type RoomCard = {
  id: number;
  roomNumber: string;
  buildingCode: number;
  buildingName: string;
  floorLevel: number;
  name: string | null;
  kind: string;
  capacity: number;
  availability: RoomAvailability;
};

export type BoardFilter = {
  /** "YYYY-MM-DD"; defaults to today on campus. */
  date?: string;
  /** Minutes since midnight; defaults to the current campus minute. */
  minute?: number;
  building?: number;
  floor?: number;
  /** Room number, whole or partial: "3", "32", "325". */
  search?: string;
  /** Only rooms free right now. */
  availableOnly?: boolean;
  /** Only rooms free for at least this many minutes from `minute`. */
  minFreeMinutes?: number;
  /** Only rooms of this kind: lecture, lab, seminar, studio, office. */
  kind?: string;
  /** Only rooms that seat at least this many people. */
  minCapacity?: number;
};

// --- catalogue reads --------------------------------------------------------

export async function listBuildings() {
  const rows = await db()
    .select({
      building: buildings,
      floorId: floors.id,
      floorLevel: floors.level,
      floorLabel: floors.label,
    })
    .from(buildings)
    .leftJoin(floors, eq(floors.buildingId, buildings.id))
    .orderBy(asc(buildings.code), asc(floors.level));

  const roomCounts = await db()
    .select({ buildingCode: rooms.buildingCode, floorLevel: rooms.floorLevel, total: sql<number>`count(*)::int` })
    .from(rooms)
    .where(eq(rooms.active, true))
    .groupBy(rooms.buildingCode, rooms.floorLevel);

  const countOf = (buildingCode: number, level: number) =>
    roomCounts.find(row => row.buildingCode === buildingCode && row.floorLevel === level)?.total ?? 0;

  const assembled = new Map<
    number,
    {
      id: number;
      code: number;
      name: string;
      shortName: string | null;
      latitude: string | null;
      longitude: string | null;
      roomCount: number;
      floors: Array<{ id: number; level: number; label: string | null; roomCount: number }>;
    }
  >();

  for (const row of rows) {
    const existing = assembled.get(row.building.id) ?? {
      id: row.building.id,
      code: row.building.code,
      name: row.building.name,
      shortName: row.building.shortName,
      latitude: row.building.latitude,
      longitude: row.building.longitude,
      roomCount: 0,
      floors: [],
    };
    if (row.floorId !== null && row.floorLevel !== null) {
      const roomCount = countOf(row.building.code, row.floorLevel);
      existing.floors.push({ id: row.floorId, level: row.floorLevel, label: row.floorLabel, roomCount });
      existing.roomCount += roomCount;
    }
    assembled.set(row.building.id, existing);
  }

  return Array.from(assembled.values());
}

export async function listRoomRecords(filter: { building?: number; floor?: number; search?: string; kind?: string; minCapacity?: number } = {}) {
  const conditions = [eq(rooms.active, true)];
  if (filter.building) conditions.push(eq(rooms.buildingCode, filter.building));
  if (filter.floor) conditions.push(eq(rooms.floorLevel, filter.floor));
  if (filter.search?.trim()) conditions.push(sql`${rooms.roomNumber} LIKE ${`${filter.search.trim()}%`}`);
  // A bad ?kind= is ignored rather than being an error: this is a public URL
  // that people edit by hand, and an unknown value should not 500.
  if (filter.kind && (ROOM_KINDS as readonly string[]).includes(filter.kind)) conditions.push(sql`${rooms.kind}::text = ${filter.kind}`);
  if (filter.minCapacity && filter.minCapacity > 0) conditions.push(gte(rooms.capacity, filter.minCapacity));

  return db()
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      buildingCode: rooms.buildingCode,
      floorLevel: rooms.floorLevel,
      position: rooms.position,
      name: rooms.name,
      kind: rooms.kind,
      capacity: rooms.capacity,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .where(and(...conditions))
    .orderBy(asc(rooms.buildingCode), asc(rooms.floorLevel), asc(rooms.position));
}

// --- timetable reads --------------------------------------------------------

/**
 * Every weekly entry that could matter on `dateKey`, already joined to the
 * batch and subject names the board displays.
 *
 * The query is deliberately NOT narrowed to one room, even on a single-room
 * page: a class MOVED INTO a room is stored on the row of the room it moved
 * OUT of, so filtering by room too early would lose it.
 */
async function loadWeeklyEntries(dayOfWeek: number): Promise<WeeklyEntry[]> {
  const rows = await db()
    .select({
      entry: timetableEntries,
      batchName: batches.name,
      subjectName: subjects.name,
      subjectCode: subjects.code,
    })
    .from(timetableEntries)
    .leftJoin(batches, eq(batches.id, timetableEntries.batchId))
    .leftJoin(subjects, eq(subjects.id, timetableEntries.subjectId))
    .where(and(eq(timetableEntries.dayOfWeek, dayOfWeek), eq(timetableEntries.active, true)))
    .orderBy(asc(timetableEntries.startMinute));

  return rows.map(row => ({
    id: row.entry.id,
    roomId: row.entry.roomId,
    dayOfWeek: row.entry.dayOfWeek,
    startMinute: row.entry.startMinute,
    endMinute: row.entry.endMinute,
    title: row.entry.title,
    teacher: row.entry.teacher,
    batchId: row.entry.batchId,
    batchName: row.batchName,
    subjectId: row.entry.subjectId,
    subjectName: row.subjectName,
    subjectCode: row.subjectCode,
    effectiveFrom: row.entry.effectiveFrom,
    effectiveTo: row.entry.effectiveTo,
    active: row.entry.active,
  }));
}

async function loadExceptions(dateKey: string): Promise<ExceptionRow[]> {
  const rows = await db()
    .select({
      exception: scheduleExceptions,
      batchName: batches.name,
      subjectName: subjects.name,
    })
    .from(scheduleExceptions)
    .leftJoin(batches, eq(batches.id, scheduleExceptions.batchId))
    .leftJoin(subjects, eq(subjects.id, scheduleExceptions.subjectId))
    .where(eq(scheduleExceptions.onDate, dateKey));

  return rows.map(row => ({
    id: row.exception.id,
    kind: row.exception.kind,
    entryId: row.exception.entryId,
    roomId: row.exception.roomId,
    newRoomId: row.exception.newRoomId,
    batchId: row.exception.batchId,
    batchName: row.batchName,
    subjectId: row.exception.subjectId,
    subjectName: row.subjectName,
    title: row.exception.title,
    teacher: row.exception.teacher,
    startMinute: row.exception.startMinute,
    endMinute: row.exception.endMinute,
    reason: row.exception.reason,
  }));
}

// --- the board --------------------------------------------------------------

/** The date and minute a request is asking about — today and now by default. */
export function resolveMoment(filter: Pick<BoardFilter, "date" | "minute">) {
  const now = campusNow();
  const dateKey = filter.date && isDateKey(filter.date) ? filter.date : now.dateKey;
  const isToday = dateKey === now.dateKey;
  // A future date has no "now" of its own; unless a minute was asked for, the
  // board for another day is shown from the start of the teaching day.
  const minute =
    filter.minute !== undefined && Number.isFinite(filter.minute)
      ? Math.max(0, Math.min(1439, Math.round(filter.minute)))
      : isToday
        ? now.minuteOfDay
        : 8 * 60;

  return {
    dateKey,
    dayOfWeek: isoDayOfWeek(dateKey),
    minute,
    isToday,
    clock: minutesToClock(minute),
    dateLabel: dateLabel(dateKey),
    timezone: now.timezone,
    serverTimeLabel: now.label,
  };
}

/**
 * The whole campus (or a slice of it) at one moment.
 *
 * The sessions are worked out for EVERY room first and the filters are applied
 * afterwards, because availability depends on rooms other than the one asked
 * about (a class moved out of 325 into 326 changes both).
 */
export async function getRoomBoard(filter: BoardFilter = {}) {
  const moment = resolveMoment(filter);
  const [entries, exceptions, roomRows] = await Promise.all([
    loadWeeklyEntries(moment.dayOfWeek),
    loadExceptions(moment.dateKey),
    listRoomRecords({
      building: filter.building,
      floor: filter.floor,
      search: filter.search,
      kind: filter.kind,
      minCapacity: filter.minCapacity,
    }),
  ]);

  const sessionsByRoom = effectiveSessionsForDate({
    dateKey: moment.dateKey,
    dayOfWeek: moment.dayOfWeek,
    entries,
    exceptions,
  });

  const holiday = exceptions.find(row => row.kind === "holiday") ?? null;

  let cards: RoomCard[] = roomRows.map(room => ({
    id: room.id,
    roomNumber: room.roomNumber,
    buildingCode: room.buildingCode,
    buildingName: room.buildingName,
    floorLevel: room.floorLevel,
    name: room.name,
    kind: room.kind,
    capacity: room.capacity,
    availability: roomAvailabilityAt(sessionsByRoom.get(room.id) ?? [], moment.minute, { dayEndMinute: ENV.dayEndMinute }),
  }));

  // Counted before the "available only" filter, so the summary always
  // describes the whole slice the student is looking at.
  const summary = {
    total: cards.length,
    available: cards.filter(card => card.availability.status === "available").length,
    occupied: cards.filter(card => card.availability.status === "occupied").length,
    closed: cards.filter(card => card.availability.status === "closed").length,
  };

  if (filter.minFreeMinutes && filter.minFreeMinutes > 0) {
    const minutes = filter.minFreeMinutes;
    cards = cards.filter(card => freeForWindow(sessionsByRoom.get(card.id) ?? [], moment.minute, minutes));
  } else if (filter.availableOnly) {
    cards = cards.filter(card => card.availability.status === "available");
  }

  return {
    moment,
    holiday: holiday ? { reason: holiday.reason ?? holiday.title ?? "University holiday" } : null,
    summary,
    rooms: cards,
  };
}

/**
 * Every building with a LIVE count of how many of its rooms are free.
 *
 * The building list is the first thing a student sees, so it should already
 * answer "is it worth walking over there?". The counts are worked out from the
 * same board the room pages use — never stored, never a second source of truth.
 */
export async function getBuildingOverview(filter: Pick<BoardFilter, "date" | "minute"> = {}) {
  const [structure, board] = await Promise.all([listBuildings(), getRoomBoard(filter)]);

  const freeIn = (buildingCode: number, floorLevel?: number) =>
    board.rooms.filter(
      room => room.buildingCode === buildingCode && (floorLevel === undefined || room.floorLevel === floorLevel) && room.availability.status === "available",
    ).length;

  return {
    moment: board.moment,
    holiday: board.holiday,
    buildings: structure.map(building => ({
      ...building,
      availableNow: freeIn(building.code),
      floors: building.floors.map(floor => ({ ...floor, availableNow: freeIn(building.code, floor.level) })),
    })),
  };
}

/** One room, with its full day and the sessions either side of "now". */
export async function getRoomDetail(roomNumber: string, filter: Pick<BoardFilter, "date" | "minute"> = {}) {
  const moment = resolveMoment(filter);

  const found = await db()
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      buildingCode: rooms.buildingCode,
      floorLevel: rooms.floorLevel,
      position: rooms.position,
      name: rooms.name,
      kind: rooms.kind,
      capacity: rooms.capacity,
      notes: rooms.notes,
      active: rooms.active,
      buildingName: buildings.name,
      floorLabel: floors.label,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .where(eq(rooms.roomNumber, roomNumber))
    .limit(1);

  const room = found[0];
  if (!room) return null;

  const [entries, exceptions] = await Promise.all([loadWeeklyEntries(moment.dayOfWeek), loadExceptions(moment.dateKey)]);
  const sessions = effectiveSessionsForDate({ dateKey: moment.dateKey, dayOfWeek: moment.dayOfWeek, entries, exceptions }).get(room.id) ?? [];

  return {
    moment,
    room,
    availability: roomAvailabilityAt(sessions, moment.minute, { dayEndMinute: ENV.dayEndMinute }),
    /** The classes that left this room today because of an exception. */
    movedAway: exceptions
      .filter(row => row.kind === "move_room" && entries.some(entry => entry.id === row.entryId && entry.roomId === room.id))
      .map(row => ({ exceptionId: row.id, reason: row.reason })),
  };
}

/** The whole week for one room, as the admin and the public timetable page show it. */
export async function getRoomWeek(roomNumber: string) {
  const found = await db().select().from(rooms).where(eq(rooms.roomNumber, roomNumber)).limit(1);
  const room = found[0];
  if (!room) return null;

  const rows = await db()
    .select({
      entry: timetableEntries,
      batchName: batches.name,
      batchCode: batches.code,
      subjectName: subjects.name,
      subjectCode: subjects.code,
    })
    .from(timetableEntries)
    .leftJoin(batches, eq(batches.id, timetableEntries.batchId))
    .leftJoin(subjects, eq(subjects.id, timetableEntries.subjectId))
    .where(and(eq(timetableEntries.roomId, room.id), eq(timetableEntries.active, true)))
    .orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.startMinute));

  return {
    room,
    days: Array.from({ length: 7 }, (_unused, index) => index + 1).map(dayOfWeek => ({
      dayOfWeek,
      sessions: rows
        .filter(row => row.entry.dayOfWeek === dayOfWeek)
        .map(row => ({
          id: row.entry.id,
          startMinute: row.entry.startMinute,
          endMinute: row.entry.endMinute,
          startTime: minutesToClock(row.entry.startMinute),
          endTime: minutesToClock(row.entry.endMinute),
          title: row.entry.title,
          teacher: row.entry.teacher,
          batchName: row.batchName,
          batchCode: row.batchCode,
          subjectName: row.subjectName,
          subjectCode: row.subjectCode,
        })),
    })),
  };
}

/** The homepage headline: how much of the campus is free this minute. */
export async function getCampusPulse() {
  const board = await getRoomBoard();
  return {
    moment: board.moment,
    holiday: board.holiday,
    ...board.summary,
    /** A handful of free rooms to show without loading the whole board. */
    sample: board.rooms
      .filter(card => card.availability.status === "available")
      .sort((a, b) => b.availability.freeForMinutes - a.availability.freeForMinutes)
      .slice(0, 6)
      .map(card => ({
        roomNumber: card.roomNumber,
        buildingName: card.buildingName,
        floorLevel: card.floorLevel,
        freeForMinutes: card.availability.freeForMinutes,
        freeForLabel: card.availability.freeForLabel,
        nextAt: card.availability.next ? card.availability.next.startTime : null,
      })),
  };
}

export type { EffectiveSession };
