// ===========================================================================
//  routes/rooms.ts — /rooms/*   THE PUBLIC HALF OF THE PLATFORM.
//
//  Not one endpoint in this file requires a login. A student standing in a
//  corridor should be able to open the site and see a free room, and asking
//  them to make an account first would defeat the whole point.
//
//  Nothing here writes anything, either: the room board is a pure read of the
//  timetable through the availability calculator.
// ===========================================================================

import { Router } from "express";
import { getBuildingOverview, getCampusPulse, getRoomBoard, getRoomDetail, getRoomWeek } from "../rooms/rooms.js";
import { listExceptions } from "../rooms/timetable.js";
import { addDays, campusNow } from "../time.js";
import { notFound, route } from "../http.js";

export const roomsRouter = Router();

/** Query values arrive as strings; these keep the parsing in one place. */
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asFlag = (value: unknown) => value === "1" || value === "true";

/** The homepage headline — free / busy counts and a few free rooms. */
roomsRouter.get(
  "/pulse",
  route(async () => getCampusPulse()),
);

/**
 * Every building with its floors, how many rooms each holds, and how many of
 * them are FREE at the moment asked about. Accepts the same ?date= &minute=
 * as the board, so the building list can be time-travelled too.
 */
roomsRouter.get(
  "/buildings",
  route(async req =>
    getBuildingOverview({
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      minute: asNumber(req.query.minute),
    }),
  ),
);

/**
 * The board: every room that matches the filter, with its status right now.
 *
 *   /rooms?building=3&floor=2          one floor
 *   /rooms?available=1                 only what is free this minute
 *   /rooms?minFreeMinutes=120          free for the next two hours
 *   /rooms?search=32                   room numbers starting 32
 *   /rooms?kind=lab&minCapacity=30     a lab that seats at least 30
 *   /rooms?date=2026-09-15&minute=600  the board as it will be then
 */
roomsRouter.get(
  "/",
  route(async req =>
    getRoomBoard({
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      minute: asNumber(req.query.minute),
      building: asNumber(req.query.building),
      floor: asNumber(req.query.floor),
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      availableOnly: asFlag(req.query.available),
      minFreeMinutes: asNumber(req.query.minFreeMinutes),
      kind: typeof req.query.kind === "string" ? req.query.kind : undefined,
      minCapacity: asNumber(req.query.minCapacity),
    }),
  ),
);

/** One room: status now, the session running, what comes next, the whole day. */
roomsRouter.get(
  "/:roomNumber",
  route(async req => {
    const detail = await getRoomDetail(String(req.params.roomNumber), {
      date: typeof req.query.date === "string" ? req.query.date : undefined,
      minute: asNumber(req.query.minute),
    });
    if (!detail) throw notFound(`There is no room ${req.params.roomNumber}.`);
    return detail;
  }),
);

/** One room's full weekly timetable. */
roomsRouter.get(
  "/:roomNumber/week",
  route(async req => {
    const week = await getRoomWeek(String(req.params.roomNumber));
    if (!week) throw notFound(`There is no room ${req.params.roomNumber}.`);
    return week;
  }),
);

/**
 * The one-date changes the public should know about — "no classes on Thursday",
 * "room 214 is closed this afternoon". Defaults to the next two weeks.
 */
roomsRouter.get(
  "/changes/upcoming",
  route(async req => {
    const today = campusNow().dateKey;
    const days = asNumber(req.query.days) ?? 14;
    return { from: today, to: addDays(today, days), exceptions: await listExceptions({ from: today, to: addDays(today, days) }) };
  }),
);
