// ===========================================================================
//  routes/bookings.ts — /bookings/*
//
//  BOOKING IS A PRIVILEGE. Reading who holds a room is public (a booking makes
//  the room busy, and the board already shows it). MAKING one belongs to the
//  `agent` role, granted by the administrator; an administrator may also
//  cancel anybody's.
//
//  A student who presses "Book this room" is not shown a broken button — the
//  GET below tells the page who may book, so it can explain instead.
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  BOOKING_LIMITS,
  cancelBooking,
  createBooking,
  listOwnBookings,
  listUpcomingBookings,
  suggestRooms,
} from "../rooms/bookings.js";
import { forbidden, parseBody, parseId, requireUser, route } from "../http.js";
import { clockToMinutes } from "../time.js";

export const bookingsRouter = Router();

/** "09:00" or 540 — the form sends the first, scripts tend to send the second. */
const minuteOfDay = z.union([z.number().int().min(0).max(1440), z.string()]).transform((value, ctx) => {
  if (typeof value === "number") return value;
  const parsed = clockToMinutes(value);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Times look like 09:00." });
    return z.NEVER;
  }
  return parsed;
});

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-09-14.");

/** Only these roles may hold a room. */
const MAY_BOOK = ["agent", "admin"] as const;

function requireBooker(req: Parameters<typeof requireUser>[0]) {
  const user = requireUser(req);
  if (!MAY_BOOK.includes(user.role as (typeof MAY_BOOK)[number]))
    throw forbidden("Booking a room is for university agents. Ask the office if you need this.");
  return user;
}

/**
 * What the current visitor may do, and the rules they must work within — so
 * the room page can show the right thing without guessing.
 */
bookingsRouter.get(
  "/rules",
  route(req => ({
    mayBook: Boolean(req.user && MAY_BOOK.includes(req.user.role as (typeof MAY_BOOK)[number])),
    signedIn: Boolean(req.user),
    limits: BOOKING_LIMITS,
  })),
);

/** My bookings (agent), or every upcoming one (administrator). */
bookingsRouter.get(
  "/",
  route(async req => {
    const user = requireBooker(req);
    return { bookings: user.role === "admin" ? await listUpcomingBookings() : await listOwnBookings(user.id) };
  }),
);

/** Which rooms are free for a window — what the booking form offers. */
bookingsRouter.get(
  "/free",
  route(async req => {
    requireBooker(req);
    const startMinute = clockToMinutes(String(req.query.start ?? ""));
    const endMinute = clockToMinutes(String(req.query.end ?? ""));
    if (startMinute === null || endMinute === null) throw forbidden("Give a start and end time like 09:00.");
    return {
      rooms: await suggestRooms({
        onDate: String(req.query.date ?? ""),
        startMinute,
        endMinute,
        minCapacity: Number(req.query.minCapacity) || undefined,
        kind: typeof req.query.kind === "string" ? req.query.kind : undefined,
      }),
    };
  }),
);

bookingsRouter.post(
  "/",
  route(async req => {
    const user = requireBooker(req);
    const input = parseBody(
      z.object({
        roomNumber: z.string().min(1).max(3),
        onDate: dateString,
        startMinute: minuteOfDay,
        endMinute: minuteOfDay,
        purpose: z.string().max(160).optional(),
        attendees: z.number().int().min(1).max(2000).optional(),
      }),
      req.body,
    );
    return createBooking(user.id, input);
  }),
);

/** Give the room back. Own booking, or anybody's if you are the office. */
bookingsRouter.delete(
  "/:id",
  route(async req => {
    const user = requireBooker(req);
    return cancelBooking({
      bookingId: parseId(req.params.id),
      userId: user.id,
      isAdmin: user.role === "admin",
      reason: typeof req.query.reason === "string" ? req.query.reason : undefined,
    });
  }),
);
