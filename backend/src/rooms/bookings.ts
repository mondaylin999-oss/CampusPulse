// ===========================================================================
//  bookings.ts — a member of agent holds a room for a few hours.
//
//  WHO MAY BOOK. Not the public, and not students. Booking belongs to the
//  `agent` role — departmental agent, society officers, lab technicians —
//  granted by the administrator in People & Drivers. Everyone else can SEE a
//  booking, because it makes the room busy, but cannot make one.
//
//  THE RULE THAT MATTERS. A booking is only allowed if the room is genuinely
//  free for the WHOLE window, and "free" here means the same thing it means
//  everywhere else on this platform: no class, no exception, no closure and no
//  other booking. So this module does not re-implement availability — it asks
//  the same calculator the public board asks, for the date in question, and
//  refuses if anything at all overlaps. There is exactly one definition of
//  "free" in this codebase and this is not a second one.
// ===========================================================================

import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../database.js";
import { buildings, floors, roomBookings, rooms, users } from "../../drizzle/schema.js";
import { badRequest, forbidden, notFound } from "../http.js";
import { campusNow, isDateKey, isoDayOfWeek, minutesToClock } from "../time.js";
import { effectiveSessionsForDate, freeForWindow } from "./availability.js";
import { loadDayContext } from "./rooms.js";

const owner = alias(users, "booking_owner");

/** Guard rails, so one person cannot quietly hold a building for a term. */
export const BOOKING_LIMITS = {
  /** Shortest useful hold. */
  minMinutes: 30,
  /** A booking is hours, not days; a standing need is a timetable entry. */
  maxMinutes: 8 * 60,
  /** How far ahead a room may be held. */
  maxDaysAhead: 60,
  /** Open bookings one person may hold at once. */
  maxOpenPerAgent: 20,
} as const;

export type BookingInput = {
  roomNumber: string;
  onDate: string;
  startMinute: number;
  endMinute: number;
  purpose?: string | null;
  attendees?: number | null;
};

// --- reading ----------------------------------------------------------------

/** One booking with everything a screen needs to show it. */
async function listBookingsWhere(condition: ReturnType<typeof and> | undefined) {
  const rows = await db()
    .select({
      booking: roomBookings,
      roomNumber: rooms.roomNumber,
      buildingCode: rooms.buildingCode,
      buildingName: buildings.name,
      floorLevel: rooms.floorLevel,
      capacity: rooms.capacity,
      ownerName: owner.name,
      ownerUsername: owner.username,
    })
    .from(roomBookings)
    .innerJoin(rooms, eq(rooms.id, roomBookings.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .leftJoin(owner, eq(owner.id, roomBookings.bookedById))
    .where(condition)
    .orderBy(desc(roomBookings.onDate), asc(roomBookings.startMinute));

  return rows.map(row => ({
    ...row,
    startTime: minutesToClock(row.booking.startMinute),
    endTime: minutesToClock(row.booking.endMinute),
  }));
}

/** What one agent holds. Past bookings are kept — they are a record. */
export function listOwnBookings(userId: number) {
  return listBookingsWhere(and(eq(roomBookings.bookedById, userId)));
}

/** Everything from today onwards, for the administrator. */
export function listUpcomingBookings() {
  return listBookingsWhere(and(gte(roomBookings.onDate, campusNow().dateKey)));
}

// --- writing ----------------------------------------------------------------

function assertWindow(input: { onDate: string; startMinute: number; endMinute: number }) {
  if (!isDateKey(input.onDate)) throw badRequest("Choose a date like 2026-09-14.");
  if (input.endMinute <= input.startMinute) throw badRequest("The booking must end after it starts.");

  const length = input.endMinute - input.startMinute;
  if (length < BOOKING_LIMITS.minMinutes) throw badRequest(`Book the room for at least ${BOOKING_LIMITS.minMinutes} minutes.`);
  if (length > BOOKING_LIMITS.maxMinutes) throw badRequest(`A single booking may run for at most ${BOOKING_LIMITS.maxMinutes / 60} hours.`);

  const now = campusNow();
  if (input.onDate < now.dateKey) throw badRequest("That date has already passed.");
  if (input.onDate === now.dateKey && input.endMinute <= now.minuteOfDay) throw badRequest("That time has already passed today.");

  // How far ahead, without date arithmetic games: both keys are midnight UTC.
  const ahead = (Date.parse(`${input.onDate}T00:00:00Z`) - Date.parse(`${now.dateKey}T00:00:00Z`)) / 86_400_000;
  if (ahead > BOOKING_LIMITS.maxDaysAhead) throw badRequest(`Rooms can be held up to ${BOOKING_LIMITS.maxDaysAhead} days ahead.`);
}

async function findRoomByNumber(roomNumber: string) {
  const rows = await db().select().from(rooms).where(eq(rooms.roomNumber, roomNumber.trim())).limit(1);
  const room = rows[0];
  if (!room) throw notFound(`There is no room ${roomNumber}.`);
  if (!room.active) throw badRequest(`Room ${room.roomNumber} is not in use.`);
  return room;
}

/**
 * Is the room free for the whole window? Asked of the SAME calculator the
 * public board uses, so a booking can never disagree with what a student sees.
 * Returns the clashing sessions so the refusal can say what is in the way.
 */
export async function checkRoomFree(input: { roomId: number; onDate: string; startMinute: number; endMinute: number; ignoreBookingId?: number }) {
  const context = await loadDayContext(input.onDate);
  const bookings = context.bookings.filter(row => row.id !== input.ignoreBookingId);

  const sessions =
    effectiveSessionsForDate({
      dateKey: input.onDate,
      dayOfWeek: isoDayOfWeek(input.onDate),
      entries: context.entries,
      exceptions: context.exceptions,
      bookings,
    }).get(input.roomId) ?? [];

  const free = freeForWindow(sessions, input.startMinute, input.endMinute - input.startMinute);
  const clashes = sessions.filter(session => session.startMinute < input.endMinute && input.startMinute < session.endMinute);
  return { free, clashes };
}

export async function createBooking(userId: number, input: BookingInput) {
  assertWindow(input);
  const room = await findRoomByNumber(input.roomNumber);

  if (input.attendees && input.attendees > room.capacity)
    throw badRequest(`Room ${room.roomNumber} seats ${room.capacity}; you asked for ${input.attendees}.`);

  const open = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(roomBookings)
    .where(and(eq(roomBookings.bookedById, userId), ne(roomBookings.status, "cancelled"), gte(roomBookings.onDate, campusNow().dateKey)));
  if ((open[0]?.total ?? 0) >= BOOKING_LIMITS.maxOpenPerAgent)
    throw badRequest(`You already hold ${BOOKING_LIMITS.maxOpenPerAgent} rooms. Give one back before booking another.`);

  const { free, clashes } = await checkRoomFree({ roomId: room.id, onDate: input.onDate, startMinute: input.startMinute, endMinute: input.endMinute });
  if (!free) {
    const what = clashes.map(session => `${session.startTime}-${session.endTime} ${session.label}`).join("; ");
    throw badRequest(`Room ${room.roomNumber} is not free then — ${what}.`);
  }

  const inserted = await db()
    .insert(roomBookings)
    .values({
      roomId: room.id,
      bookedById: userId,
      onDate: input.onDate,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      purpose: input.purpose?.trim() || null,
      attendees: input.attendees ?? null,
    })
    .returning();

  return { booking: inserted[0]!, roomNumber: room.roomNumber };
}

/**
 * Give the room back. An agent may cancel their own; an administrator may
 * cancel anybody's. The row is kept and marked, never deleted — somebody
 * planned around that room and the record of it matters.
 */
export async function cancelBooking(input: { bookingId: number; userId: number; isAdmin: boolean; reason?: string }) {
  const rows = await db().select().from(roomBookings).where(eq(roomBookings.id, input.bookingId)).limit(1);
  const booking = rows[0];
  if (!booking) throw notFound("That booking no longer exists.");
  if (booking.status === "cancelled") throw badRequest("That booking has already been given back.");
  if (!input.isAdmin && booking.bookedById !== input.userId) throw forbidden("You can only give back a room you booked.");

  await db()
    .update(roomBookings)
    .set({ status: "cancelled", cancelledById: input.userId, cancelReason: input.reason?.trim() || null })
    .where(eq(roomBookings.id, input.bookingId));

  return { cancelled: true };
}

/** Rooms free for the whole window — what the booking form offers. */
export async function suggestRooms(input: { onDate: string; startMinute: number; endMinute: number; minCapacity?: number; kind?: string }) {
  assertWindow(input);
  const context = await loadDayContext(input.onDate);
  const sessionsByRoom = effectiveSessionsForDate({
    dateKey: input.onDate,
    dayOfWeek: isoDayOfWeek(input.onDate),
    entries: context.entries,
    exceptions: context.exceptions,
    bookings: context.bookings,
  });

  const conditions = [eq(rooms.active, true)];
  if (input.minCapacity && input.minCapacity > 0) conditions.push(gte(rooms.capacity, input.minCapacity));
  if (input.kind) conditions.push(sql`${rooms.kind}::text = ${input.kind}`);

  const candidates = await db()
    .select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      buildingCode: rooms.buildingCode,
      floorLevel: rooms.floorLevel,
      capacity: rooms.capacity,
      kind: rooms.kind,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .where(and(...conditions))
    .orderBy(asc(rooms.roomNumber));

  const minutes = input.endMinute - input.startMinute;
  return candidates.filter(room => freeForWindow(sessionsByRoom.get(room.id) ?? [], input.startMinute, minutes));
}
