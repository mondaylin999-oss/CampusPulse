// ===========================================================================
//  catalog.ts — the things the administrator maintains once and rarely edits:
//  buildings, floors, rooms, batches and subjects.
//
//  The room number is NEVER typed in by hand. It is derived from the floor the
//  room is on and its position along that floor, so a room can never disagree
//  with its own address (the database enforces the same rule with a CHECK).
// ===========================================================================

import { and, asc, eq } from "drizzle-orm";
import { db } from "../database.js";
import { batches, buildings, floors, rooms, subjects } from "../../drizzle/schema.js";
import { badRequest, notFound } from "../http.js";

/** 3, 2, 5 -> "325". The one place the numbering rule is written down. */
export function roomNumberFor(buildingCode: number, floorLevel: number, position: number) {
  return String(buildingCode * 100 + floorLevel * 10 + position).padStart(3, "0");
}

/** "325" -> { building: 3, floor: 2, position: 5 }, or null if it is not one. */
export function parseRoomNumber(value: string) {
  const match = /^([1-9])([0-9])([1-9])$/.exec(value.trim());
  if (!match) return null;
  return { building: Number(match[1]), floor: Number(match[2]), position: Number(match[3]) };
}

// --- buildings and floors ---------------------------------------------------

export async function createBuilding(input: { code: number; name: string; shortName?: string; floors?: number }) {
  const inserted = await db()
    .insert(buildings)
    .values({ code: input.code, name: input.name.trim(), shortName: input.shortName?.trim() || null })
    .returning();
  const building = inserted[0]!;

  // A building with no floors cannot hold a room, so lay them out immediately
  // when a count is given.
  if (input.floors && input.floors > 0) {
    await db()
      .insert(floors)
      .values(Array.from({ length: input.floors }, (_unused, index) => ({ buildingId: building.id, level: index + 1, label: `Floor ${index + 1}` })));
  }
  return building;
}

export async function updateBuilding(
  id: number,
  input: { name?: string; shortName?: string | null; latitude?: number | null; longitude?: number | null },
) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.shortName !== undefined) patch.shortName = input.shortName?.trim() || null;
  // Six decimal places is about 11cm — far finer than "which building is
  // this". A click from a map gives ~15 digits of float noise, which is not
  // more accurate, only longer and uglier wherever it is displayed.
  if (input.latitude !== undefined) patch.latitude = input.latitude === null ? null : input.latitude.toFixed(6);
  if (input.longitude !== undefined) patch.longitude = input.longitude === null ? null : input.longitude.toFixed(6);
  if (!Object.keys(patch).length) return;
  await db().update(buildings).set(patch).where(eq(buildings.id, id));
}

export async function deleteBuilding(id: number) {
  await db().delete(buildings).where(eq(buildings.id, id));
}

export async function addFloor(buildingId: number, level: number, label?: string) {
  const inserted = await db()
    .insert(floors)
    .values({ buildingId, level, label: label?.trim() || `Floor ${level}` })
    .returning();
  return inserted[0]!;
}

export async function deleteFloor(id: number) {
  await db().delete(floors).where(eq(floors.id, id));
}

// --- rooms ------------------------------------------------------------------

export async function listAllRooms() {
  return db()
    .select({ room: rooms, buildingName: buildings.name, buildingCode: buildings.code })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .orderBy(asc(rooms.roomNumber));
}

export async function createRoom(input: {
  buildingCode: number;
  floorLevel: number;
  position: number;
  name?: string;
  kind?: "lecture" | "lab" | "seminar" | "studio" | "office";
  capacity?: number;
  notes?: string;
}) {
  const floor = await findFloor(input.buildingCode, input.floorLevel);
  const inserted = await db()
    .insert(rooms)
    .values({
      floorId: floor.id,
      roomNumber: roomNumberFor(input.buildingCode, input.floorLevel, input.position),
      buildingCode: input.buildingCode,
      floorLevel: input.floorLevel,
      position: input.position,
      name: input.name?.trim() || null,
      kind: input.kind ?? "lecture",
      capacity: input.capacity ?? 40,
      notes: input.notes?.trim() || null,
    })
    .returning();
  return inserted[0]!;
}

export async function updateRoom(
  id: number,
  input: { name?: string | null; kind?: "lecture" | "lab" | "seminar" | "studio" | "office"; capacity?: number; active?: boolean; notes?: string | null },
) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name?.trim() || null;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.active !== undefined) patch.active = input.active;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (!Object.keys(patch).length) return;
  await db().update(rooms).set(patch).where(eq(rooms.id, id));
}

export async function deleteRoom(id: number) {
  await db().delete(rooms).where(eq(rooms.id, id));
}

async function findFloor(buildingCode: number, level: number) {
  const rows = await db()
    .select({ id: floors.id })
    .from(floors)
    .innerJoin(buildings, eq(buildings.id, floors.buildingId))
    .where(and(eq(buildings.code, buildingCode), eq(floors.level, level)))
    .limit(1);
  const floor = rows[0];
  if (!floor) throw notFound(`Building ${buildingCode} has no floor ${level}. Add the floor first.`);
  return floor;
}

// --- batches and subjects ---------------------------------------------------

export async function listBatches(activeOnly = false) {
  const query = db().select().from(batches).orderBy(asc(batches.code));
  return activeOnly ? query.where(eq(batches.active, true)) : query;
}

export async function createBatch(input: { code: string; name: string; department?: string; yearLevel?: number; studentCount?: number }) {
  const inserted = await db()
    .insert(batches)
    .values({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      department: input.department?.trim() || null,
      yearLevel: input.yearLevel ?? null,
      studentCount: input.studentCount ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function updateBatch(id: number, input: { name?: string; department?: string | null; yearLevel?: number | null; studentCount?: number | null; active?: boolean }) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.department !== undefined) patch.department = input.department?.trim() || null;
  if (input.yearLevel !== undefined) patch.yearLevel = input.yearLevel;
  if (input.studentCount !== undefined) patch.studentCount = input.studentCount;
  if (input.active !== undefined) patch.active = input.active;
  if (!Object.keys(patch).length) return;
  await db().update(batches).set(patch).where(eq(batches.id, id));
}

export async function deleteBatch(id: number) {
  await db().delete(batches).where(eq(batches.id, id));
}

export async function listSubjects(activeOnly = false) {
  const query = db().select().from(subjects).orderBy(asc(subjects.code));
  return activeOnly ? query.where(eq(subjects.active, true)) : query;
}

export async function createSubject(input: { code: string; name: string; department?: string }) {
  const inserted = await db()
    .insert(subjects)
    .values({ code: input.code.trim().toUpperCase(), name: input.name.trim(), department: input.department?.trim() || null })
    .returning();
  return inserted[0]!;
}

export async function updateSubject(id: number, input: { name?: string; department?: string | null; active?: boolean }) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.department !== undefined) patch.department = input.department?.trim() || null;
  if (input.active !== undefined) patch.active = input.active;
  if (!Object.keys(patch).length) return;
  await db().update(subjects).set(patch).where(eq(subjects.id, id));
}

export async function deleteSubject(id: number) {
  await db().delete(subjects).where(eq(subjects.id, id));
}

/** Shared by the create/update validators in routes/admin.ts. */
export function assertRoomNumberParts(buildingCode: number, floorLevel: number, position: number) {
  if (buildingCode < 1 || buildingCode > 9) throw badRequest("A building code is a single digit 1-9.");
  if (floorLevel < 1 || floorLevel > 9) throw badRequest("A floor level is a single digit 1-9.");
  if (position < 1 || position > 9) throw badRequest("A room position is a single digit 1-9.");
}
