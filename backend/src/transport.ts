// ===========================================================================
//  transport.ts — public transport details managed by administrators.
// ===========================================================================

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./database.js";
import {
  driverProfiles,
  routeMapNodes,
  routeStops,
  transportRoutes,
  users,
  vehicles,
} from "../drizzle/schema.js";
import { isMonthKey } from "./time.js";
import { badRequest } from "./http.js";

export type VehicleStatus = "operational" | "unavailable" | "maintenance";
export type FerryMapNodeInput = { name: string; latitude: number; longitude: number };


const fail = (message: string) => {
  throw badRequest(message);
};

function requireText(value: string, label: string, max = 160) {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.length > max) fail(`Enter a valid ${label}.`);
  return trimmed;
}

function assertPositiveInteger(value: number, label: string, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`Enter a valid ${label}.`);
  return value;
}

function optionalMapUrl(value: string | undefined) {
  if (value === undefined) return undefined;
  const url = value.trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url) || url.length > 2048) fail("Enter a valid https:// map link.");
  return url;
}

function optionalMapCoordinates(value: string | undefined) {
  if (value === undefined) return undefined;
  const coordinates = value.trim();
  if (!coordinates) return null;
  if (coordinates.length > 128 || !/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(coordinates)) fail("Enter coordinates as latitude, longitude.");
  return coordinates;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** '06:30' — the same two times every day, so this is all a road needs. */
function requireDailyTime(value: string, label: string) {
  const time = value.trim();
  if (!TIME_PATTERN.test(time)) fail(`Enter ${label} as a time like 06:30.`);
  return time;
}

function optionalDailyTime(value: string | undefined | null, label: string) {
  if (value === undefined) return undefined;
  const time = (value ?? "").trim();
  if (!time) return null;
  return requireDailyTime(time, label);
}

function optionalMonth(value: string | undefined | null, label: string) {
  if (value === undefined) return undefined;
  const month = (value ?? "").trim();
  if (!month) return null;
  if (!isMonthKey(month)) fail(`Enter ${label} as a month like 2026-09.`);
  return month;
}

function normalizeRouteLineColor(value: string) {
  const color = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) fail("Choose a valid six-digit route line color.");
  return color;
}

function normalizeMapNodes(nodes: FerryMapNodeInput[]) {
  if (nodes.length < 2 || nodes.length > 50) fail("Publish between 2 and 50 map nodes.");
  return nodes.map((node, index) => {
    const latitude = Number(node.latitude);
    const longitude = Number(node.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      fail(`Node ${index + 1} needs valid latitude and longitude values.`);
    return { name: requireText(node.name, `node ${index + 1} name`), latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), nodeOrder: index + 1 };
  });
}

// --- drivers ---------------------------------------------------------------

export async function ensureDriverProfile(driverId: number) {
  const existing = await db().select().from(driverProfiles).where(eq(driverProfiles.userId, driverId)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db().insert(driverProfiles).values({ userId: driverId }).returning();
  return inserted[0]!;
}

export async function getDriverProfile(driverId: number) {
  const rows = await db()
    .select({ profile: driverProfiles, user: users })
    .from(driverProfiles)
    .innerJoin(users, eq(driverProfiles.userId, users.id))
    .where(eq(driverProfiles.userId, driverId))
    .limit(1);
  return rows[0];
}

export async function updateOwnDriverProfile(
  driverId: number,
  input: { phone?: string; licenseNumber?: string; availability?: "available" | "unavailable" },
) {
  await ensureDriverProfile(driverId);
  const patch: Record<string, unknown> = {};
  if (input.phone !== undefined) patch.phone = input.phone.trim() || null;
  if (input.licenseNumber !== undefined) patch.licenseNumber = input.licenseNumber.trim() || null;
  if (input.availability) patch.availability = input.availability;
  if (!Object.keys(patch).length) fail("Choose at least one profile field to update.");
  await db().update(driverProfiles).set(patch).where(eq(driverProfiles.userId, driverId));
  return getDriverProfile(driverId);
}

export async function listDrivers() {
  return db()
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      status: users.status,
      phone: driverProfiles.phone,
      licenseNumber: driverProfiles.licenseNumber,
      availability: driverProfiles.availability,
    })
    .from(users)
    .leftJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.name));
}

export async function assertActiveDriver(driverId: number) {
  const rows = await db()
    .select({ id: users.id, role: users.role, status: users.status, availability: driverProfiles.availability })
    .from(users)
    .leftJoin(driverProfiles, eq(users.id, driverProfiles.userId))
    .where(eq(users.id, driverId))
    .limit(1);
  const driver = rows[0];
  if (!driver || driver.role !== "admin" || driver.status !== "active") fail("Choose an active driver account.");
  if (driver!.availability === "unavailable") fail("The selected driver is unavailable.");
  return driver!;
}

// --- vehicles --------------------------------------------------------------

export async function createVehicle(input: {
  plateNumber: string;
  vehicleType: string;
  model: string;
  totalSeats: number;
  monthlyFeeCents?: number;
  driverId?: number;
  status?: VehicleStatus;
}) {
  const plateNumber = requireText(input.plateNumber, "plate number", 32).toUpperCase();
  const vehicleType = requireText(input.vehicleType, "vehicle type", 80);
  const model = requireText(input.model, "vehicle model", 120);
  const totalSeats = assertPositiveInteger(input.totalSeats, "seat capacity", 200);
  if (input.driverId) await assertActiveDriver(input.driverId);

  const inserted = await db()
    .insert(vehicles)
    .values({
      plateNumber,
      vehicleType,
      model,
      totalSeats,
      monthlyFeeCents: input.monthlyFeeCents ?? 0,
      driverId: input.driverId ?? null,
      status: input.status ?? "operational",
    })
    .returning({ id: vehicles.id });
  return inserted[0]!.id;
}

export async function updateVehicle(
  vehicleId: number,
  input: {
    plateNumber?: string;
    vehicleType?: string;
    model?: string;
    totalSeats?: number;
    monthlyFeeCents?: number;
    driverId?: number | null;
    status?: VehicleStatus;
    maintenanceStatus?: "clear" | "reported" | "in_service";
  },
) {
  const patch: Record<string, unknown> = {};
  if (input.plateNumber !== undefined) patch.plateNumber = requireText(input.plateNumber, "plate number", 32).toUpperCase();
  if (input.vehicleType !== undefined) patch.vehicleType = requireText(input.vehicleType, "vehicle type", 80);
  if (input.model !== undefined) patch.model = requireText(input.model, "vehicle model", 120);
  if (input.totalSeats !== undefined) patch.totalSeats = assertPositiveInteger(input.totalSeats, "seat capacity", 200);
  if (input.monthlyFeeCents !== undefined) patch.monthlyFeeCents = Math.max(0, Math.trunc(input.monthlyFeeCents));
  if (input.driverId !== undefined) {
    if (input.driverId) await assertActiveDriver(input.driverId);
    patch.driverId = input.driverId;
  }
  if (input.status) patch.status = input.status;
  if (input.maintenanceStatus) patch.maintenanceStatus = input.maintenanceStatus;
  if (!Object.keys(patch).length) fail("Choose at least one vehicle field to update.");

  const updated = await db().update(vehicles).set(patch).where(eq(vehicles.id, vehicleId)).returning({ id: vehicles.id });
  if (!updated.length) fail("Vehicle not found.");
  return getVehicle(vehicleId);
}

export async function getVehicle(vehicleId: number) {
  const rows = await db()
    .select({ vehicle: vehicles, driverName: users.name, driverUsername: users.username })
    .from(vehicles)
    .leftJoin(users, eq(vehicles.driverId, users.id))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  return rows[0];
}

export async function listVehicles() {
  return db()
    .select({ vehicle: vehicles, driverName: users.name, driverUsername: users.username })
    .from(vehicles)
    .leftJoin(users, eq(vehicles.driverId, users.id))
    .orderBy(asc(vehicles.plateNumber));
}

// --- routes ----------------------------------------------------------------

export async function createTransportRoute(input: {
  name: string;
  startPoint: string;
  destination: string;
  stops: string[];
  fareCents: number;
  mapUrl?: string;
  mapCoordinates?: string;
  driverId?: number;
  vehicleId?: number;
  distanceKm?: number;
  estimatedMinutes?: number;
  morningTime?: string;
  eveningTime?: string;
  sellFrom?: string;
  sellTo?: string;
  status?: "active" | "inactive";
}) {
  const name = requireText(input.name, "route name", 120);
  const startPoint = requireText(input.startPoint, "start point");
  const destination = requireText(input.destination, "destination");
  const stops = input.stops.map(stop => requireText(stop, "pickup stop")).filter((stop, index, list) => list.indexOf(stop) === index);
  if (!stops.length) fail("Add at least one pickup stop.");
  const fareCents = assertPositiveInteger(input.fareCents, "fare");
  const mapUrl = optionalMapUrl(input.mapUrl);
  const mapCoordinates = optionalMapCoordinates(input.mapCoordinates);
  const morningTime = requireDailyTime(input.morningTime ?? "06:30", "the morning time");
  const eveningTime = optionalDailyTime(input.eveningTime, "the evening time") ?? null;
  const sellFrom = optionalMonth(input.sellFrom, "the first month") ?? null;
  const sellTo = optionalMonth(input.sellTo, "the last month") ?? null;
  if (sellFrom && sellTo && sellTo < sellFrom) fail("The last month cannot be before the first.");

  if (input.driverId) await assertActiveDriver(input.driverId);
  if (input.vehicleId) {
    const vehicle = await getVehicle(input.vehicleId);
    if (!vehicle || vehicle.vehicle.status !== "operational") fail("Choose an operational vehicle.");
    if (input.driverId && vehicle!.vehicle.driverId && vehicle!.vehicle.driverId !== input.driverId)
      fail("The vehicle is assigned to a different driver.");
  }

  return db().transaction(async tx => {
    const inserted = await tx
      .insert(transportRoutes)
      .values({
        name,
        startPoint,
        destination,
        pickupLocations: stops.join(", "),
        fareCents,
        mapUrl: mapUrl ?? null,
        mapCoordinates: mapCoordinates ?? null,
        driverId: input.driverId ?? null,
        vehicleId: input.vehicleId ?? null,
        distanceKm: input.distanceKm ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        morningTime,
        eveningTime,
        sellFrom,
        sellTo,
        status: input.status ?? "active",
      })
      .returning({ id: transportRoutes.id });
    const routeId = inserted[0]!.id;
    await tx.insert(routeStops).values(stops.map((stop, index) => ({ routeId, name: stop, stopOrder: index + 1 })));
    return routeId;
  });
}

export async function updateTransportRoute(
  routeId: number,
  input: {
    name?: string;
    startPoint?: string;
    destination?: string;
    stops?: string[];
    fareCents?: number;
    mapUrl?: string;
    mapCoordinates?: string;
    driverId?: number | null;
    vehicleId?: number | null;
    distanceKm?: number | null;
    estimatedMinutes?: number | null;
    morningTime?: string;
    eveningTime?: string;
    sellFrom?: string;
    sellTo?: string;
    status?: "active" | "inactive";
  },
) {
  const patch: Record<string, unknown> = {};
  let stops: string[] | undefined;

  if (input.name !== undefined) patch.name = requireText(input.name, "route name", 120);
  if (input.startPoint !== undefined) patch.startPoint = requireText(input.startPoint, "start point");
  if (input.destination !== undefined) patch.destination = requireText(input.destination, "destination");
  if (input.fareCents !== undefined) patch.fareCents = assertPositiveInteger(input.fareCents, "fare");
  if (input.mapUrl !== undefined) patch.mapUrl = optionalMapUrl(input.mapUrl);
  if (input.mapCoordinates !== undefined) patch.mapCoordinates = optionalMapCoordinates(input.mapCoordinates);
  if (input.driverId !== undefined) {
    if (input.driverId) await assertActiveDriver(input.driverId);
    patch.driverId = input.driverId;
  }
  if (input.vehicleId !== undefined) patch.vehicleId = input.vehicleId;
  if (input.distanceKm !== undefined) patch.distanceKm = input.distanceKm;
  if (input.estimatedMinutes !== undefined) patch.estimatedMinutes = input.estimatedMinutes;
  if (input.morningTime !== undefined) patch.morningTime = requireDailyTime(input.morningTime, "the morning time");
  if (input.eveningTime !== undefined) patch.eveningTime = optionalDailyTime(input.eveningTime, "the evening time");
  if (input.sellFrom !== undefined) patch.sellFrom = optionalMonth(input.sellFrom, "the first month");
  if (input.sellTo !== undefined) patch.sellTo = optionalMonth(input.sellTo, "the last month");
  if (input.status) patch.status = input.status;
  if (input.stops !== undefined) {
    stops = input.stops.map(stop => requireText(stop, "pickup stop")).filter((stop, index, list) => list.indexOf(stop) === index);
    if (!stops.length) fail("Add at least one pickup stop.");
    patch.pickupLocations = stops.join(", ");
  }
  if (!Object.keys(patch).length && !stops) fail("Choose at least one route field to update.");

  return db().transaction(async tx => {
    if (Object.keys(patch).length) {
      const updated = await tx.update(transportRoutes).set(patch).where(eq(transportRoutes.id, routeId)).returning({ id: transportRoutes.id });
      if (!updated.length) fail("Route not found.");
    }
    if (stops) {
      await tx.delete(routeStops).where(eq(routeStops.routeId, routeId));
      await tx.insert(routeStops).values(stops.map((name, index) => ({ routeId, name, stopOrder: index + 1 })));
    }
    return routeId;
  }).then(() => getTransportRoute(routeId));
}

export async function updateOwnFerryRoute(
  driverId: number,
  routeId: number,
  // distanceKm / estimatedMinutes come from OSRM in the route editor: the map
  // measures the real driving distance and time, and the driver saves them
  // with the route so students see honest numbers.
  input: {
    name?: string;
    startPoint?: string;
    destination?: string;
    stops?: string[];
    fareCents?: number;
    mapUrl?: string;
    mapCoordinates?: string;
    distanceKm?: number | null;
    estimatedMinutes?: number | null;
  },
) {
  const owned = await db()
    .select({ id: transportRoutes.id })
    .from(transportRoutes)
    .where(and(eq(transportRoutes.id, routeId), eq(transportRoutes.driverId, driverId)))
    .limit(1);
  if (!owned.length) return false;
  await updateTransportRoute(routeId, input);
  return true;
}

/** Only the assigned transport agent may publish a route's drawn path. */
export async function publishOwnFerryRouteMap(driverId: number, routeId: number, input: { routeLineColor: string; nodes: FerryMapNodeInput[] }) {
  const nodes = normalizeMapNodes(input.nodes);
  const routeLineColor = normalizeRouteLineColor(input.routeLineColor);

  return db().transaction(async tx => {
    const owned = await tx
      .select({ id: transportRoutes.id })
      .from(transportRoutes)
      .where(and(eq(transportRoutes.id, routeId), eq(transportRoutes.driverId, driverId)))
      .limit(1);
    if (!owned.length) return false;
    await tx.delete(routeMapNodes).where(eq(routeMapNodes.routeId, routeId));
    await tx.insert(routeMapNodes).values(nodes.map(node => ({ routeId, ...node })));
    await tx.update(transportRoutes).set({ routeLineColor }).where(eq(transportRoutes.id, routeId));
    return true;
  });
}

export async function getTransportRoute(routeId: number) {
  const routeRows = await db()
    .select({
      route: transportRoutes,
      driverName: users.name,
      // The student pays the agent outside the app, so the phone number has to
      // travel with the road — it is the only way to reach them.
      driverPhone: driverProfiles.phone,
      vehiclePlate: vehicles.plateNumber,
      vehicleSeats: vehicles.totalSeats,
      vehicleStatus: vehicles.status,
    })
    .from(transportRoutes)
    .leftJoin(users, eq(transportRoutes.driverId, users.id))
    .leftJoin(driverProfiles, eq(transportRoutes.driverId, driverProfiles.userId))
    .leftJoin(vehicles, eq(transportRoutes.vehicleId, vehicles.id))
    .where(eq(transportRoutes.id, routeId))
    .limit(1);
  if (!routeRows[0]) return undefined;

  const [stops, mapNodes] = await Promise.all([
    db().select().from(routeStops).where(eq(routeStops.routeId, routeId)).orderBy(asc(routeStops.stopOrder)),
    db().select().from(routeMapNodes).where(eq(routeMapNodes.routeId, routeId)).orderBy(asc(routeMapNodes.nodeOrder)),
  ]);
  return { ...routeRows[0], stops, mapNodes };
}

export async function listTransportRoutes(activeOnly = false) {
  const rows = await db()
    .select({
      route: transportRoutes,
      driverName: users.name,
      vehiclePlate: vehicles.plateNumber,
      vehicleSeats: vehicles.totalSeats,
      vehicleStatus: vehicles.status,
    })
    .from(transportRoutes)
    .leftJoin(users, eq(transportRoutes.driverId, users.id))
    .leftJoin(vehicles, eq(transportRoutes.vehicleId, vehicles.id))
    .where(activeOnly ? eq(transportRoutes.status, "active") : undefined)
    .orderBy(desc(transportRoutes.updatedAt));

  const [stops, mapNodes] = await Promise.all([
    db().select().from(routeStops).orderBy(asc(routeStops.stopOrder)),
    db().select().from(routeMapNodes).orderBy(asc(routeMapNodes.nodeOrder)),
  ]);
  return rows.map(row => ({
    ...row,
    stops: stops.filter(stop => stop.routeId === row.route.id),
    mapNodes: mapNodes.filter(node => node.routeId === row.route.id),
  }));
}

// --- the agent's own ferry and road ----------------------------------------
//
//  The administrator only opens and closes accounts, so a transport agent sets
//  up their own ferry bus and their own road the first time they sign in.

/** The agent registers their ferry bus. One bus per agent. */
export async function createOwnVehicle(
  driverId: number,
  input: { plateNumber: string; vehicleType?: string; model?: string; totalSeats: number; monthlyFeeCents?: number },
) {
  const existing = await db().select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.driverId, driverId)).limit(1);
  if (existing.length) fail("You already have a ferry bus. Edit the one you have instead.");

  return createVehicle({
    plateNumber: input.plateNumber,
    vehicleType: input.vehicleType ?? "Ferry bus",
    model: input.model ?? "Unspecified",
    totalSeats: input.totalSeats,
    monthlyFeeCents: input.monthlyFeeCents,
    driverId,
  });
}

/** The agent opens a road of their own, served by their own bus. */
export async function createOwnRoute(
  driverId: number,
  input: {
    name: string;
    startPoint: string;
    destination: string;
    stops: string[];
    fareCents: number;
    mapUrl?: string;
    distanceKm?: number;
    estimatedMinutes?: number;
    morningTime?: string;
    eveningTime?: string;
    sellFrom?: string;
    sellTo?: string;
  },
) {
  const busRows = await db().select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.driverId, driverId)).limit(1);
  const bus = busRows[0];
  if (!bus) fail("Register your ferry bus first — a road needs a bus to carry it.");

  return createTransportRoute({ ...input, driverId, vehicleId: bus!.id });
}

// --- driver dashboard ------------------------------------------------------

export async function getDriverDashboard(driverId: number) {
  await ensureDriverProfile(driverId);
  const [profile, vehicleRows, routeRows] = await Promise.all([
    getDriverProfile(driverId),
    listVehicles(),
    listTransportRoutes(),
  ]);

  const vehicle = vehicleRows.find(row => row.vehicle.driverId === driverId) ?? null;
  return {
    profile,
    vehicle,
    routes: routeRows.filter(row => row.route.driverId === driverId),
  };
}
