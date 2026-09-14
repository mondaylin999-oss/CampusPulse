// ===========================================================================
//  routes/admin.ts — /admin/*   EVERYTHING HERE REQUIRES THE ADMINISTRATOR.
//
//  `adminRouter.use` installs one guard for the whole file, so no individual
//  handler can forget it. The public board (routes/rooms.ts) needs no login;
//  every write behind it lives here.
//
//  Sections:
//     campus      buildings, floors, rooms
//     academics   batches, subjects
//     timetable   weekly entries + the conflict dry-run
//     changes     one-date exceptions
//     people      accounts, and the DRIVER PERMISSION QUEUE
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import { listUsersByRole, createAccount, setUserStatus, setPassword } from "../accounts.js";
import { decideApplication, listApplications, revokeDriver } from "../drivers.js";
import { badRequest, parseBody, parseId, requireRole, route } from "../http.js";
import {
  addFloor,
  assertRoomNumberParts,
  createBatch,
  createBuilding,
  createRoom,
  createSubject,
  deleteBatch,
  deleteBuilding,
  deleteFloor,
  deleteRoom,
  deleteSubject,
  listAllRooms,
  listBatches,
  listSubjects,
  updateBatch,
  updateBuilding,
  updateRoom,
  updateSubject,
} from "../rooms/catalog.js";
import {
  checkEntry,
  createEntry,
  createException,
  deleteEntry,
  deleteException,
  listEntries,
  listExceptions,
  updateEntry,
} from "../rooms/timetable.js";
import { listBuildings } from "../rooms/rooms.js";
import { clockToMinutes } from "../time.js";

export const adminRouter = Router();

// One gate for the whole file.
adminRouter.use((req, _res, next) => {
  try {
    requireRole(req, "admin");
    next();
  } catch (error) {
    next(error);
  }
});

// --- small shared validators ------------------------------------------------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates look like 2026-09-14.");
const roomKind = z.enum(["lecture", "lab", "seminar", "studio", "office"]);

/**
 * A time may arrive as "09:00" or as 540. The admin UI sends the former and
 * scripts tend to send the latter, so both are accepted and normalised here.
 */
const minuteOfDay = z.union([z.number().int().min(0).max(1440), z.string()]).transform((value, ctx) => {
  if (typeof value === "number") return value;
  const parsed = clockToMinutes(value);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Times look like 09:00." });
    return z.NEVER;
  }
  return parsed;
});

// ===========================================================================
//  Campus — buildings, floors, rooms
// ===========================================================================

adminRouter.get(
  "/campus",
  route(async () => ({ buildings: await listBuildings(), rooms: await listAllRooms() })),
);

adminRouter.post(
  "/buildings",
  route(async req => {
    const input = parseBody(
      z.object({
        code: z.number().int().min(1).max(9),
        name: z.string().min(2).max(120),
        shortName: z.string().max(32).optional(),
        floors: z.number().int().min(0).max(9).optional(),
      }),
      req.body,
    );
    return { building: await createBuilding(input) };
  }),
);

adminRouter.patch(
  "/buildings/:id",
  route(async req => {
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        shortName: z.string().max(32).nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
      }),
      req.body,
    );
    await updateBuilding(parseId(req.params.id), input);
    return { success: true };
  }),
);

adminRouter.delete(
  "/buildings/:id",
  route(async req => {
    await deleteBuilding(parseId(req.params.id));
    return { success: true };
  }),
);

adminRouter.post(
  "/floors",
  route(async req => {
    const input = parseBody(
      z.object({ buildingId: z.number().int().positive(), level: z.number().int().min(1).max(9), label: z.string().max(60).optional() }),
      req.body,
    );
    return { floor: await addFloor(input.buildingId, input.level, input.label) };
  }),
);

adminRouter.delete(
  "/floors/:id",
  route(async req => {
    await deleteFloor(parseId(req.params.id));
    return { success: true };
  }),
);

adminRouter.post(
  "/rooms",
  route(async req => {
    const input = parseBody(
      z.object({
        buildingCode: z.number().int().min(1).max(9),
        floorLevel: z.number().int().min(1).max(9),
        position: z.number().int().min(1).max(9),
        name: z.string().max(120).optional(),
        kind: roomKind.optional(),
        capacity: z.number().int().min(1).max(2000).optional(),
        notes: z.string().max(280).optional(),
      }),
      req.body,
    );
    assertRoomNumberParts(input.buildingCode, input.floorLevel, input.position);
    return { room: await createRoom(input) };
  }),
);

adminRouter.patch(
  "/rooms/:id",
  route(async req => {
    const input = parseBody(
      z.object({
        name: z.string().max(120).nullable().optional(),
        kind: roomKind.optional(),
        capacity: z.number().int().min(1).max(2000).optional(),
        active: z.boolean().optional(),
        notes: z.string().max(280).nullable().optional(),
      }),
      req.body,
    );
    await updateRoom(parseId(req.params.id), input);
    return { success: true };
  }),
);

adminRouter.delete(
  "/rooms/:id",
  route(async req => {
    await deleteRoom(parseId(req.params.id));
    return { success: true };
  }),
);

// ===========================================================================
//  Academics — batches and subjects
// ===========================================================================

adminRouter.get(
  "/academics",
  route(async () => ({ batches: await listBatches(), subjects: await listSubjects() })),
);

adminRouter.post(
  "/batches",
  route(async req => {
    const input = parseBody(
      z.object({
        code: z.string().min(1).max(24),
        name: z.string().min(2).max(120),
        department: z.string().max(80).optional(),
        yearLevel: z.number().int().min(1).max(8).optional(),
        studentCount: z.number().int().min(0).max(5000).optional(),
      }),
      req.body,
    );
    return { batch: await createBatch(input) };
  }),
);

adminRouter.patch(
  "/batches/:id",
  route(async req => {
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        department: z.string().max(80).nullable().optional(),
        yearLevel: z.number().int().min(1).max(8).nullable().optional(),
        studentCount: z.number().int().min(0).max(5000).nullable().optional(),
        active: z.boolean().optional(),
      }),
      req.body,
    );
    await updateBatch(parseId(req.params.id), input);
    return { success: true };
  }),
);

adminRouter.delete(
  "/batches/:id",
  route(async req => {
    await deleteBatch(parseId(req.params.id));
    return { success: true };
  }),
);

adminRouter.post(
  "/subjects",
  route(async req => {
    const input = parseBody(
      z.object({ code: z.string().min(1).max(24), name: z.string().min(2).max(120), department: z.string().max(80).optional() }),
      req.body,
    );
    return { subject: await createSubject(input) };
  }),
);

adminRouter.patch(
  "/subjects/:id",
  route(async req => {
    const input = parseBody(
      z.object({ name: z.string().min(2).max(120).optional(), department: z.string().max(80).nullable().optional(), active: z.boolean().optional() }),
      req.body,
    );
    await updateSubject(parseId(req.params.id), input);
    return { success: true };
  }),
);

adminRouter.delete(
  "/subjects/:id",
  route(async req => {
    await deleteSubject(parseId(req.params.id));
    return { success: true };
  }),
);

// ===========================================================================
//  The weekly timetable
// ===========================================================================

const entryBody = z.object({
  roomId: z.number().int().positive(),
  batchId: z.number().int().positive().nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  teacher: z.string().max(120).nullable().optional(),
  dayOfWeek: z.number().int().min(1).max(7),
  startMinute: minuteOfDay,
  endMinute: minuteOfDay,
  effectiveFrom: dateString.nullable().optional(),
  effectiveTo: dateString.nullable().optional(),
  active: z.boolean().optional(),
});

adminRouter.get(
  "/timetable",
  route(async req =>
    ({
      entries: await listEntries({
        roomId: req.query.roomId ? parseId(req.query.roomId, "roomId") : undefined,
        batchId: req.query.batchId ? parseId(req.query.batchId, "batchId") : undefined,
        subjectId: req.query.subjectId ? parseId(req.query.subjectId, "subjectId") : undefined,
        dayOfWeek: req.query.dayOfWeek ? Number(req.query.dayOfWeek) : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      }),
    }),
  ),
);

adminRouter.post(
  "/timetable",
  route(async req => ({ entry: await createEntry(parseBody(entryBody, req.body)) })),
);

adminRouter.patch(
  "/timetable/:id",
  route(async req => {
    await updateEntry(parseId(req.params.id), parseBody(entryBody.partial(), req.body));
    return { success: true };
  }),
);

adminRouter.delete(
  "/timetable/:id",
  route(async req => {
    await deleteEntry(parseId(req.params.id));
    return { success: true };
  }),
);

/** Dry run — lets the form warn before Save is pressed. */
adminRouter.post(
  "/timetable/check",
  route(async req => {
    const input = parseBody(
      z.object({
        roomId: z.number().int().positive(),
        batchId: z.number().int().positive().nullable().optional(),
        dayOfWeek: z.number().int().min(1).max(7),
        startMinute: minuteOfDay,
        endMinute: minuteOfDay,
        effectiveFrom: dateString.nullable().optional(),
        effectiveTo: dateString.nullable().optional(),
        ignoreId: z.number().int().positive().optional(),
      }),
      req.body,
    );
    return checkEntry(input);
  }),
);

// ===========================================================================
//  One-date changes
// ===========================================================================

adminRouter.get(
  "/exceptions",
  route(async req =>
    ({
      exceptions: await listExceptions({
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        roomId: req.query.roomId ? parseId(req.query.roomId, "roomId") : undefined,
      }),
    }),
  ),
);

adminRouter.post(
  "/exceptions",
  route(async req => {
    const admin = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        kind: z.enum(["cancel", "move_room", "retime", "extra", "holiday", "room_closed"]),
        onDate: dateString,
        entryId: z.number().int().positive().nullable().optional(),
        roomId: z.number().int().positive().nullable().optional(),
        newRoomId: z.number().int().positive().nullable().optional(),
        batchId: z.number().int().positive().nullable().optional(),
        subjectId: z.number().int().positive().nullable().optional(),
        title: z.string().max(120).nullable().optional(),
        teacher: z.string().max(120).nullable().optional(),
        startMinute: minuteOfDay.nullable().optional(),
        endMinute: minuteOfDay.nullable().optional(),
        reason: z.string().max(280).nullable().optional(),
      }),
      req.body,
    );
    return { exception: await createException(input, admin.id) };
  }),
);

adminRouter.delete(
  "/exceptions/:id",
  route(async req => {
    await deleteException(parseId(req.params.id));
    return { success: true };
  }),
);

// ===========================================================================
//  People — accounts and the driver permission queue
// ===========================================================================

adminRouter.get(
  "/people",
  route(async () => ({
    admins: await listUsersByRole("admin"),
    /** The room-booking staff. */
    agents: await listUsersByRole("agent"),
    drivers: await listUsersByRole("driver"),
    students: await listUsersByRole("user"),
  })),
);

adminRouter.post(
  "/people",
  route(async req => {
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        username: z.string().min(3).max(64).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).max(128).optional(),
        role: z.enum(["admin", "agent", "driver", "user"]),
      }),
      req.body,
    );
    return { user: await createAccount(input) };
  }),
);

adminRouter.patch(
  "/people/:id",
  route(async req => {
    const input = parseBody(
      z.object({ status: z.enum(["active", "inactive"]).optional(), password: z.string().min(6).max(128).optional() }),
      req.body,
    );
    const id = parseId(req.params.id);
    if (input.status) await setUserStatus(id, input.status);
    if (input.password) await setPassword(id, input.password);
    if (!input.status && !input.password) throw badRequest("Nothing to change.");
    return { success: true };
  }),
);

/** THE DRIVER PERMISSION QUEUE. */
adminRouter.get(
  "/driver-applications",
  route(async req => {
    const status = typeof req.query.status === "string" && ["pending", "approved", "rejected"].includes(req.query.status)
      ? (req.query.status as "pending" | "approved" | "rejected")
      : undefined;
    return { applications: await listApplications(status) };
  }),
);

adminRouter.patch(
  "/driver-applications/:id",
  route(async req => {
    const admin = requireRole(req, "admin");
    const input = parseBody(z.object({ approve: z.boolean(), note: z.string().max(2000).optional() }), req.body);
    return decideApplication({ applicationId: parseId(req.params.id), adminId: admin.id, approve: input.approve, note: input.note });
  }),
);

/** Takes driver permission back; the account becomes an ordinary student. */
adminRouter.post(
  "/people/:id/revoke-driver",
  route(async req => revokeDriver(parseId(req.params.id))),
);
