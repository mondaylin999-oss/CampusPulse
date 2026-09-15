// ===========================================================================
//  seed.ts — first-run data, so the platform is usable the moment it starts.
//
//  Everything here is IDEMPOTENT: it only ever fills in what is missing, so
//  restarting the backend never duplicates a room, and never overwrites a
//  timetable an administrator has since edited.
//
//      npm run seed        (or automatically, with SEED_ON_START=true)
//
//  What it creates
//  ---------------
//    * the administrator, a room-booking agent account, one bus driver and
//      one demo student
//    * the campus: SEED_BUILDINGS x SEED_FLOORS x SEED_ROOMS_PER_FLOOR rooms
//      (4 x 6 x 6 = 144 by default)
//    * a few batches and subjects, and a small demo week of classes so the
//      room board has something to show before anyone types a timetable
//    * one school-bus route for the seeded driver
// ===========================================================================

import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, getPool } from "./database.js";
import {
  batches,
  buildings,
  driverProfiles,
  floors,
  rideBookings,
  rooms,
  routeStops,
  subjects,
  timetableEntries,
  transportRoutes,
  users,
  vehicles,
  type Role,
} from "../drizzle/schema.js";
import { hashPassword } from "./auth.js";
import { ENV } from "./env.js";
import { roomNumberFor } from "./rooms/catalog.js";

type SeedOptions = { quiet?: boolean };

const BUILDING_NAMES = ["Building 1", "Building 2", "Building 3", "Building 4"];

/**
 * Where the demo buildings stand, so the campus map has something on it the
 * first time it is opened. These are PLACEHOLDERS on the University of Yangon
 * campus, not a survey — an administrator drags each building to its real spot
 * on the admin map (Campus & rooms), or clears them.
 */
const BUILDING_PLACES: Array<{ latitude: string; longitude: string }> = [
  { latitude: "16.83250", longitude: "96.13330" },
  { latitude: "16.83180", longitude: "96.13480" },
  { latitude: "16.83370", longitude: "96.13470" },
  { latitude: "16.83300", longitude: "96.13190" },
  { latitude: "16.83120", longitude: "96.13300" },
];

/**
 * Creates the account if it is not there, and returns it either way.
 *
 * The obvious "SELECT, and INSERT when it is missing" has a gap between the
 * two statements: two backends starting at the same moment (a restart that
 * overlaps the old process, `npm run dev` open in two terminals) both see no
 * admin, both insert, and the loser dies on the username unique index — which
 * abandons the whole seed, so the campus and the timetable never appear.
 *
 * Letting the DATABASE settle it closes the gap: insert, tell PostgreSQL to
 * ignore a conflict, and read the row back when the insert was the one that
 * lost. `onConflictDoNothing` with no target covers both unique columns
 * (`username` and `open_id`).
 */
async function ensureAccount(input: { username: string; name: string; role: Role; email?: string }) {
  const inserted = await db()
    .insert(users)
    .values({
      openId: `local_${nanoid(16)}`,
      username: input.username,
      name: input.name,
      email: input.email ?? null,
      passwordHash: hashPassword(ENV.seedPassword),
      role: input.role,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted[0]) return { user: inserted[0], created: true };

  // Somebody else has it — either an earlier run or the instance that raced us.
  const existing = await db().select().from(users).where(eq(users.username, input.username)).limit(1);
  if (!existing[0]) throw new Error(`Could not create or find the "${input.username}" account.`);
  return { user: existing[0], created: false };
}

/** The 4 x 6 x 6 campus. Rooms are numbered by the rule, never by hand. */
async function seedCampus(log: (message: string) => void) {
  const existingRooms = (await db().select({ total: sql<number>`count(*)::int` }).from(rooms))[0]?.total ?? 0;
  if (existingRooms > 0) {
    // Keep an already-seeded production campus aligned with the canonical
    // building labels without replacing rooms or administrator-managed data.
    for (let code = 1; code <= 4; code += 1) {
      await db()
        .update(buildings)
        .set({ name: `Building ${code}` })
        .where(eq(buildings.code, code));
    }
    return;
  }

  log(`  campus       ${ENV.seedBuildings} buildings x ${ENV.seedFloors} floors x ${ENV.seedRoomsPerFloor} rooms`);

  for (let code = 1; code <= ENV.seedBuildings; code += 1) {
    const building = (
      await db()
        .insert(buildings)
        .values({
          code,
          name: BUILDING_NAMES[code - 1] ?? `Building ${code}`,
          shortName: `B${code}`,
          latitude: BUILDING_PLACES[code - 1]?.latitude ?? null,
          longitude: BUILDING_PLACES[code - 1]?.longitude ?? null,
        })
        .onConflictDoNothing()
        .returning()
    )[0];
    const buildingRow = building ?? (await db().select().from(buildings).where(eq(buildings.code, code)).limit(1))[0];
    if (!buildingRow) continue;

    for (let level = 1; level <= ENV.seedFloors; level += 1) {
      const floor = (
        await db().insert(floors).values({ buildingId: buildingRow.id, level, label: `Floor ${level}` }).onConflictDoNothing().returning()
      )[0];
      // The fallback MUST match on the level too. Without it, a conflicting
      // insert fell back to the building's FIRST floor and every room on every
      // level was hung off floor 1 — the room numbers would still read 325
      // while `floor_id` pointed at floor 1.
      const floorRow =
        floor ?? (await db().select().from(floors).where(and(eq(floors.buildingId, buildingRow.id), eq(floors.level, level))).limit(1))[0];
      if (!floorRow) continue;

      const roomRows = [];
      for (let position = 1; position <= ENV.seedRoomsPerFloor; position += 1) {
        // A lab on the top two floors of the science and engineering blocks —
        // just enough variety that the "kind" filter has something to filter.
        const kind = level >= 5 && (code === 2 || code === 3) ? "lab" : position === 6 ? "seminar" : "lecture";
        roomRows.push({
          floorId: floorRow.id,
          roomNumber: roomNumberFor(code, level, position),
          buildingCode: code,
          floorLevel: level,
          position,
          kind: kind as "lecture" | "lab" | "seminar",
          capacity: kind === "seminar" ? 24 : kind === "lab" ? 30 : 48,
        });
      }
      await db().insert(rooms).values(roomRows).onConflictDoNothing();
    }
  }
}

const YEAR_NAMES = ["First", "Second", "Third", "Fourth", "Fifth"];
const UNIVERSITY_BATCHES = YEAR_NAMES.flatMap((yearName, yearIndex) =>
  ["A", "B", "C", "D", "E"].map(section => ({
    code: `Y${yearIndex + 1}-${section}`,
    name: `${yearName} Year — Section ${section}`,
    department: "University of Information Technology",
    yearLevel: yearIndex + 1,
  })),
);

const UIT_SUBJECTS = [
  { code: "CST-2101", name: "Programming in C++ (Cornerstone Project)", department: "Computer Science and Technology" },
  { code: "CST-2202", name: "Discrete Mathematics", department: "Computer Science and Technology" },
  { code: "CST-2302", name: "Web Technology (Cornerstone Project)", department: "Computer Science and Technology" },
  { code: "CST-2303", name: "Human Computer Interaction and Information Security", department: "Computer Science and Technology" },
  { code: "CST-2402", name: "Networking Fundamentals", department: "Computer Science and Technology" },
  { code: "CST-2502", name: "Professional Communications", department: "Computer Science and Technology" },
  { code: "CST-2602", name: "Myanmar Literature and Language", department: "Computer Science and Technology" },
];

/**
 * A small but realistic week: a handful of rooms in each building teaching
 * something on weekdays, so the public board shows a mix of green and red the
 * first time it is opened. Deliberately sparse — most rooms stay free, which
 * is the point of the site.
 */
async function seedTimetable(log: (message: string) => void) {
  await db().insert(batches).values(UNIVERSITY_BATCHES).onConflictDoNothing();
  await db().insert(subjects).values(UIT_SUBJECTS).onConflictDoNothing();

  let batchRows = await db().select().from(batches);
  const subjectRows = await db().select().from(subjects);
  const roomRows = await db().select().from(rooms);
  if (!roomRows.length) return;

  // Remove only the original demonstration cohorts and their entries. This
  // migration leaves anything an administrator created untouched.
  const legacyCodes = ["CS-1", "CS-2", "CS-3", "IT-1", "IT-2"];
  const legacyIds = batchRows.filter(row => legacyCodes.includes(row.code)).map(row => row.id);
  if (legacyIds.length) {
    await db().delete(timetableEntries).where(inArray(timetableEntries.batchId, legacyIds));
    await db().delete(batches).where(inArray(batches.id, legacyIds));
    batchRows = await db().select().from(batches);
  }

  const batchId = (code: string) => batchRows.find(row => row.code === code)?.id ?? null;
  const subjectId = (code: string) => subjectRows.find(row => row.code === code)?.id ?? null;
  const roomId = (roomNumber: string) => roomRows.find(row => row.roomNumber === roomNumber)?.id ?? null;

  const sectionE = batchId("Y1-E");
  const alreadyInstalled = sectionE
    ? (await db().select({ total: sql<number>`count(*)::int` }).from(timetableEntries).where(eq(timetableEntries.batchId, sectionE)))[0]?.total ?? 0
    : 0;
  if (alreadyInstalled > 0) return;

  const P = [[510, 570], [580, 640], [650, 710], [760, 820], [830, 890], [900, 960]] as const;
  const teachers: Record<string, string> = {
    "CST-2101": "Daw Laet Laet Lin", "CST-2202": "Daw Aye Nyein San", "CST-2302": "Dr. Ciin Zam Man",
    "CST-2303": "Daw Lay Myat Myat Thein", "CST-2402": "Daw Su Su Naing", "CST-2502": "Daw May Naing Win",
    "CST-2602": "Daw Naw Aster",
  };
  // First Year, Section E — Semester II timetable transcribed from the
  // university notice. Each tuple is day, period, room, subject and class type.
  const photographed: Array<[number, number, string, string, "L" | "TDA"]> = [
    [1,0,"332","CST-2303","L"],[1,1,"326","CST-2502","L"],[1,2,"326","CST-2202","L"],[1,3,"232","CST-2302","L"],[1,4,"244","CST-2502","TDA"],[1,5,"431","CST-2202","TDA"],
    [2,0,"232","CST-2101","TDA"],[2,1,"326","CST-2502","L"],[2,2,"326","CST-2602","L"],[2,3,"232","CST-2302","TDA"],[2,4,"422","CST-2303","TDA"],[2,5,"421","CST-2402","TDA"],
    [3,0,"432","CST-2202","TDA"],[3,1,"232","CST-2101","TDA"],[3,2,"235","CST-2302","TDA"],[3,3,"421","CST-2502","TDA"],
    [4,0,"326","CST-2402","L"],[4,1,"326","CST-2602","L"],[4,2,"326","CST-2303","L"],[4,3,"426","CST-2602","TDA"],[4,4,"322","CST-2202","L"],[4,5,"421","CST-2602","TDA"],
    [5,0,"232","CST-2302","L"],[5,1,"232","CST-2101","L"],[5,2,"326","CST-2402","L"],[5,3,"232","CST-2402","TDA"],[5,4,"232","CST-2101","TDA"],[5,5,"424","CST-2303","TDA"],
  ];

  const plan: Array<[string, number, number, number, string, string, string, string]> = photographed.map(([day, period, room, subject, kind]) =>
    [room, day, P[period]![0], P[period]![1], "Y1-E", subject, teachers[subject] ?? "", kind],
  );

  const values = plan
    .map(([roomNumber, dayOfWeek, startMinute, endMinute, batchCode, subjectCode, teacher, kind]) => {
      const room = roomId(roomNumber);
      if (!room) return null;
      return { roomId: room, batchId: batchId(batchCode), subjectId: subjectId(subjectCode), title: kind, teacher, dayOfWeek, startMinute, endMinute };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (values.length) {
    await db().insert(timetableEntries).values(values);
    log(`  timetable    ${values.length} First Year Section E sessions across the week`);
  }
}

/**
 * One bus, one route, so the transport screens are not empty either.
 *
 * The vehicle insert is the gate for everything below it. It can conflict on
 * `driver_id` or on the plate, so a lost race returns no row — and this
 * function then stops rather than going on to create a SECOND "North Line"
 * against a bus it does not own.
 */
async function seedBus(driverId: number, log: (message: string) => void) {
  const bus = (
    await db()
      .insert(vehicles)
      .values({ driverId, plateNumber: "1A-2345", vehicleType: "School bus", model: "Hino Rainbow", totalSeats: 32, monthlyFeeCents: 25_000 })
      .onConflictDoNothing()
      .returning()
  )[0];
  if (!bus) return; // the bus already exists, or another instance just made it

  await db().insert(driverProfiles).values({ userId: driverId, phone: "09-750000000", licenseNumber: "DL-889912" }).onConflictDoNothing();

  const stops = ["Hledan Junction", "Kamayut", "Insein Road", "University Main Gate"];
  const routeRow = (
    await db()
      .insert(transportRoutes)
      .values({
        name: "North Line",
        driverId,
        vehicleId: bus.id,
        startPoint: "Hledan Junction",
        destination: "University Main Gate",
        pickupLocations: stops.join(", "),
        fareCents: 25_000,
        morningTime: "06:30",
        eveningTime: "16:30",
        distanceKm: 12,
        estimatedMinutes: 45,
      })
      .returning()
  )[0]!;

  await db()
    .insert(routeStops)
    .values(stops.map((name, index) => ({ routeId: routeRow.id, name, stopOrder: index + 1 })));

  log("  school bus   1 bus, 1 route (North Line)");
}

/**
 * A key for PostgreSQL's advisory locks. Any constant does; it only has to be
 * the same number in every copy of this application.
 */
const SEED_LOCK_KEY = 815_243_001;

/**
 * Runs the seed with a campus-wide lock held, so only ONE backend seeds even
 * when several start at the same moment.
 *
 * Why a lock and not a guard per statement: most steps CAN protect themselves
 * (a unique index on the username, on the room number, on the plate). The
 * weekly timetable cannot — `timetable_entries` has no natural unique key, and
 * its guard is "are there any rows yet?". Two instances both read zero, both
 * insert, and the demo week silently appears TWICE, so every room shows each
 * class twice. No per-row rule can prevent that; the run itself has to be
 * serialised.
 *
 * The lock is taken on one dedicated connection held for the whole seed, not
 * on a pooled one, because a session-level advisory lock belongs to the
 * connection that took it. The second instance blocks here, then finds every
 * step already done and writes nothing. If the process dies mid-seed the
 * connection drops and PostgreSQL releases the lock by itself.
 */
async function withSeedLock<T>(run: () => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SEED_LOCK_KEY]);
    return await run();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [SEED_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function seedDatabase(options: SeedOptions = {}) {
  return withSeedLock(() => runSeed(options));
}

async function runSeed(options: SeedOptions = {}) {
  const log = (message: string) => {
    if (!options.quiet) console.log(message);
  };

  const admin = await ensureAccount({ username: "admin", name: "University Office", role: "admin" });
  // Bus operators are managed by the office. They are transport records, not
  // a fourth authorization role, so the seeded operator is an administrator.
  const driver = await ensureAccount({ username: "driver", name: "U Aung Aung", role: "admin" });
  const student = await ensureAccount({ username: "student", name: "Ma Ei Ei", role: "user" });
  // Keep the original seeded account and its bookings while adopting the
  // role's public name. This also upgrades existing production databases.
  const namedAgent = await db().select({ id: users.id }).from(users).where(eq(users.username, "agent")).limit(1);
  if (!namedAgent[0]) {
    await db().update(users).set({ username: "agent" }).where(eq(users.username, "agent"));
  }
  const agent = await ensureAccount({ username: "agent", name: "Daw Khin Khin", role: "agent" });

  if (admin.created || driver.created || student.created || agent.created) {
    log("\n  CampusPulse — first run");
    log("  ────────────────────────────────────────────────────────");
    log(`  admin / agent / user accounts      password: ${ENV.seedPassword}`);
  }

  await seedCampus(log);
  await seedTimetable(log);
  await seedBus(driver.user.id, log);

  const counts = {
    rooms: (await db().select({ total: sql<number>`count(*)::int` }).from(rooms))[0]?.total ?? 0,
    sessions: (await db().select({ total: sql<number>`count(*)::int` }).from(timetableEntries))[0]?.total ?? 0,
    seats: (await db().select({ total: sql<number>`count(*)::int` }).from(rideBookings))[0]?.total ?? 0,
  };
  log(`  ready        ${counts.rooms} rooms, ${counts.sessions} weekly sessions, ${counts.seats} bus seats`);
  return counts;
}

// Allow  npm run seed  to run this file directly.
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
