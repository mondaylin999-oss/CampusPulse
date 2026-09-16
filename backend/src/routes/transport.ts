// ===========================================================================
//  routes/transport.ts — /transport/*
//
//  Public visitors read transport contacts and routes. Administrators manage
//  the operator profile, transport ways and route maps.
// ===========================================================================

import { Router } from "express";
import { z } from "zod";
import {
  createOwnRoute,
  createOwnVehicle,
  ensureDriverProfile,
  getDriverDashboard,
  getDriverProfile,
  listTransportRoutes,
  publishOwnFerryRouteMap,
  updateOwnDriverProfile,
  updateOwnFerryRoute,
} from "../transport.js";
import { forbidden, parseBody, parseId, requireRole, route } from "../http.js";

export const transportRouter = Router();

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month like 2026-09.");

// ===========================================================================
//  PUBLIC — no login needed
//
//  A visitor can see the operator, monthly fee and published transport ways.
// ===========================================================================

transportRouter.get(
  "/public/routes",
  route(async () => ({ routes: await listTransportRoutes(true) })),
);

// --- the transport agent's own ferry ---------------------------------------

transportRouter.get(
  "/driver/dashboard",
  route(async req => {
    const driver = requireRole(req, "admin");
    return getDriverDashboard(driver.id);
  }),
);

transportRouter.get(
  "/driver/profile",
  route(async req => {
    const driver = requireRole(req, "admin");
    await ensureDriverProfile(driver.id);
    return { profile: await getDriverProfile(driver.id) };
  }),
);

transportRouter.patch(
  "/driver/profile",
  route(async req => {
    const driver = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        phone: z.string().max(32).optional(),
        licenseNumber: z.string().max(80).optional(),
        availability: z.enum(["available", "unavailable"]).optional(),
      }),
      req.body,
    );
    return { profile: await updateOwnDriverProfile(driver.id, input) };
  }),
);

/** Register my ferry bus (once). */
transportRouter.post(
  "/driver/vehicle",
  route(async req => {
    const driver = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        plateNumber: z.string().min(2).max(32),
        vehicleType: z.string().min(2).max(80).optional(),
        model: z.string().min(1).max(120).optional(),
        totalSeats: z.number().int().min(1).max(200),
        monthlyFeeCents: z.number().int().min(0).optional(),
      }),
      req.body,
    );
    return { id: await createOwnVehicle(driver.id, input) };
  }),
);

/** Open a road of my own. */
transportRouter.post(
  "/driver/routes",
  route(async req => {
    const driver = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        startPoint: z.string().min(2).max(160),
        destination: z.string().min(2).max(160),
        stops: z.array(z.string().min(2).max(160)).min(1).max(30),
        // The published monthly transport fee.
        fareCents: z.number().int().positive(),
        mapUrl: z.string().max(2048).optional(),
        distanceKm: z.number().int().positive().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().max(1440).optional(),
        // The bus runs these same times every day. There is no departure list.
        morningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").optional(),
        eveningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").or(z.literal("")).optional(),
        // The months this road is sold for.
        sellFrom: monthSchema.optional(),
        sellTo: monthSchema.or(z.literal("")).optional(),
      }),
      req.body,
    );
    return { id: await createOwnRoute(driver.id, input) };
  }),
);

transportRouter.patch(
  "/driver/routes/:id",
  route(async req => {
    const driver = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        name: z.string().min(2).max(120).optional(),
        startPoint: z.string().min(2).max(160).optional(),
        destination: z.string().min(2).max(160).optional(),
        stops: z.array(z.string().min(2).max(160)).min(1).max(30).optional(),
        fareCents: z.number().int().positive().optional(),
        mapUrl: z.string().max(2048).optional(),
        mapCoordinates: z.string().max(128).optional(),
        status: z.enum(["active", "inactive"]).optional(),
        // Measured by the map (see frontend/src/components/RouteMap.tsx)
        // rather than typed by hand.
        distanceKm: z.number().int().positive().max(2000).optional(),
        estimatedMinutes: z.number().int().positive().max(1440).optional(),
        morningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").optional(),
        eveningTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Times look like 06:30.").or(z.literal("")).optional(),
        sellFrom: monthSchema.optional(),
        sellTo: monthSchema.or(z.literal("")).optional(),
      }),
      req.body,
    );
    const updated = await updateOwnFerryRoute(driver.id, parseId(req.params.id), input);
    if (!updated) throw forbidden("You can only change your own road.");
    return { success: true };
  }),
);

transportRouter.post(
  "/driver/routes/:id/map",
  route(async req => {
    const driver = requireRole(req, "admin");
    const input = parseBody(
      z.object({
        routeLineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit route line color."),
        nodes: z
          .array(z.object({ name: z.string().min(2).max(160), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }))
          .min(2)
          .max(50),
      }),
      req.body,
    );
    const published = await publishOwnFerryRouteMap(driver.id, parseId(req.params.id), input);
    if (!published) throw forbidden("You can only publish a map for your own road.");
    return { success: true };
  }),
);
