// ===========================================================================
//  drivers.ts — DRIVER PERMISSION IS GRANTED BY THE ADMINISTRATOR.
//
//  Nobody becomes a school-bus driver by signing up. A signed-in person asks
//  for permission; the request lands in the administrator's queue; only when
//  the administrator approves it does the account's role change to `driver`
//  and its bus and profile get created.
//
//  Refusing a request leaves the account exactly as it was, so a student whose
//  request was turned down is still a student.
// ===========================================================================

import { and, desc, eq } from "drizzle-orm";
import { db } from "./database.js";
import { driverApplications, driverProfiles, users, vehicles } from "../drizzle/schema.js";
import { badRequest, notFound } from "./http.js";

export type ApplicationInput = {
  phone?: string;
  licenseNumber?: string;
  plateNumber?: string;
  totalSeats?: number;
  message?: string;
};

/** Anyone signed in may ask once; a second ask while one is open is refused. */
export async function applyForDriverPermission(userId: number, input: ApplicationInput) {
  const account = (await db().select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account) throw notFound("Account not found.");
  const existingProfile = await db().select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
  if (existingProfile[0]) throw badRequest("You already run a school bus.");
  if (account.role === "admin") throw badRequest("An administrator account cannot also be a driver.");

  const open = await db()
    .select()
    .from(driverApplications)
    .where(and(eq(driverApplications.userId, userId), eq(driverApplications.status, "pending")))
    .limit(1);
  if (open[0]) throw badRequest("Your request is already with the office. You will see the answer here.");

  const inserted = await db()
    .insert(driverApplications)
    .values({
      userId,
      phone: input.phone?.trim() || null,
      licenseNumber: input.licenseNumber?.trim() || null,
      plateNumber: input.plateNumber?.trim() || null,
      totalSeats: input.totalSeats ?? null,
      message: input.message?.trim() || null,
    })
    .returning();
  return inserted[0]!;
}

/** What the applicant sees on their own profile. */
export async function myApplications(userId: number) {
  return db().select().from(driverApplications).where(eq(driverApplications.userId, userId)).orderBy(desc(driverApplications.createdAt));
}

/** The administrator's queue — pending first, with who is asking. */
export async function listApplications(status?: "pending" | "approved" | "rejected") {
  return db()
    .select({
      application: driverApplications,
      applicantName: users.name,
      applicantUsername: users.username,
      applicantEmail: users.email,
      applicantRole: users.role,
    })
    .from(driverApplications)
    .innerJoin(users, eq(users.id, driverApplications.userId))
    .where(status ? eq(driverApplications.status, status) : undefined)
    .orderBy(desc(driverApplications.createdAt));
}

/**
 * The administrator's decision.
 *
 * On approval the account is promoted in the same breath as the bus is
 * created, so there is never a `driver` with no bus to drive — the bus module
 * assumes one driver owns one vehicle.
 */
export async function decideApplication(input: {
  applicationId: number;
  adminId: number;
  approve: boolean;
  note?: string;
}) {
  const application = (await db().select().from(driverApplications).where(eq(driverApplications.id, input.applicationId)).limit(1))[0];
  if (!application) throw notFound("That request no longer exists.");
  if (application.status !== "pending") throw badRequest("That request has already been decided.");

  await db()
    .update(driverApplications)
    .set({
      status: input.approve ? "approved" : "rejected",
      decidedById: input.adminId,
      decisionNote: input.note?.trim() || null,
      decidedAt: new Date(),
    })
    .where(eq(driverApplications.id, input.applicationId));

  if (!input.approve) return { promoted: false };

  await db().update(users).set({ status: "active" }).where(eq(users.id, application.userId));

  // The profile and the bus are created only if they are not there already, so
  // a re-approval after a demotion does not fail on the unique keys.
  const profile = await db().select().from(driverProfiles).where(eq(driverProfiles.userId, application.userId)).limit(1);
  if (!profile[0]) {
    await db().insert(driverProfiles).values({
      userId: application.userId,
      phone: application.phone,
      licenseNumber: application.licenseNumber,
    });
  }

  const bus = await db().select().from(vehicles).where(eq(vehicles.driverId, application.userId)).limit(1);
  if (!bus[0] && application.plateNumber) {
    await db().insert(vehicles).values({
      driverId: application.userId,
      plateNumber: application.plateNumber,
      totalSeats: application.totalSeats ?? 30,
      vehicleType: "School bus",
    });
  }

  return { promoted: true };
}

/** Takes the keys back: the account returns to being an ordinary student. */
export async function revokeDriver(userId: number) {
  const account = (await db().select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account) throw notFound("Account not found.");
  const profile = await db().select().from(driverProfiles).where(eq(driverProfiles.userId, userId)).limit(1);
  if (!profile[0]) throw badRequest("That account is not a bus operator.");

  // The bus, its routes and the seats students already hold are left alone on
  // purpose — they are records of what happened, and deleting them would take
  // a student's seat away without telling anyone. The account simply loses the
  // driver screens; the office can reassign the bus.
  await db().update(driverProfiles).set({ availability: "unavailable" }).where(eq(driverProfiles.userId, userId));
  return { revoked: true };
}
