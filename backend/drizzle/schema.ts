// ===========================================================================
//  drizzle/schema.ts — the TypeScript mirror of database/schema.sql
//
//  database/schema.sql is what actually creates the tables (you run it once in
//  pgAdmin4). This file describes the same tables to Drizzle ORM so the API
//  gets typed queries. If you change one, change the other.
//
//  Naming: PostgreSQL columns are snake_case (nice to read in pgAdmin4), and
//  the TypeScript properties stay camelCase — Drizzle maps between them.
//
//  Layout mirrors the platform's two modules:
//     accounts      users, driver_applications
//     transport     vehicles … ride_bookings      (unchanged from the bus app)
//     university    buildings … schedule_exceptions
// ===========================================================================

import { boolean, date, index, integer, pgEnum, pgTable, serial, smallint, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// --- enums -----------------------------------------------------------------
export const userRole = pgEnum("user_role", ["admin", "agent", "user", "driver"]);
export const accountStatus = pgEnum("account_status", ["active", "inactive"]);
export const applicationStatusEnum = pgEnum("application_status", ["pending", "approved", "rejected"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", ["operational", "unavailable", "maintenance"]);
export const maintenanceFlagEnum = pgEnum("maintenance_flag", ["clear", "reported", "in_service"]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", ["reported", "in_progress", "resolved"]);
export const routeStatusEnum = pgEnum("route_status", ["active", "inactive"]);
export const driverAvailabilityEnum = pgEnum("driver_availability", ["available", "unavailable"]);
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "cancelled"]);
export const roomKindEnum = pgEnum("room_kind", ["lecture", "lab", "seminar", "studio", "office"]);
export const exceptionKindEnum = pgEnum("exception_kind", ["cancel", "move_room", "retime", "extra", "holiday", "room_closed"]);

// ===========================================================================
//  Accounts
// ===========================================================================
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("open_id", { length: 64 }).notNull().unique(),
    username: varchar("username", { length: 64 }).unique(),
    passwordHash: varchar("password_hash", { length: 255 }),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("login_method", { length: 64 }).default("local"),
    role: userRole("role").notNull().default("user"),
    status: accountStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("users_role_status_idx").on(table.role, table.status)],
);

/** A request to run a school bus. The ADMINISTRATOR approves or refuses it. */
export const driverApplications = pgTable(
  "driver_applications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    phone: varchar("phone", { length: 32 }),
    licenseNumber: varchar("license_number", { length: 80 }),
    plateNumber: varchar("plate_number", { length: 32 }),
    totalSeats: integer("total_seats"),
    message: text("message"),
    status: applicationStatusEnum("status").notNull().default("pending"),
    decidedById: integer("decided_by_id"),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  table => [index("driver_applications_status_idx").on(table.status)],
);

// ===========================================================================
//  School bus — carried over from the existing system, unchanged
// ===========================================================================
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").unique(),
  plateNumber: varchar("plate_number", { length: 32 }).unique(),
  vehicleType: varchar("vehicle_type", { length: 80 }).notNull().default("School bus"),
  model: varchar("model", { length: 120 }).notNull().default("Unspecified"),
  totalSeats: integer("total_seats").notNull(),
  monthlyFeeCents: integer("monthly_fee_cents").notNull().default(0),
  status: vehicleStatusEnum("status").notNull().default("operational"),
  maintenanceStatus: maintenanceFlagEnum("maintenance_status").notNull().default("clear"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    phone: varchar("phone", { length: 32 }),
    licenseNumber: varchar("license_number", { length: 80 }),
    availability: driverAvailabilityEnum("availability").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("driver_profiles_user_unique").on(table.userId)],
);

export const transportRoutes = pgTable(
  "transport_routes",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull().default("Campus route"),
    driverId: integer("driver_id"),
    vehicleId: integer("vehicle_id"),
    startPoint: varchar("start_point", { length: 160 }).notNull(),
    destination: varchar("destination", { length: 160 }).notNull(),
    pickupLocations: text("pickup_locations").notNull(),
    mapUrl: varchar("map_url", { length: 2048 }),
    mapCoordinates: varchar("map_coordinates", { length: 128 }),
    routeLineColor: varchar("route_line_color", { length: 7 }).notNull().default("#0284C7"),
    distanceKm: integer("distance_km"),
    estimatedMinutes: integer("estimated_minutes"),
    fareCents: integer("fare_cents").notNull(),
    /** The same two times every day — no per-day departure rows exist. */
    morningTime: varchar("morning_time", { length: 5 }).notNull().default("06:30"),
    eveningTime: varchar("evening_time", { length: 5 }),
    /** The months this route is sold for; sellTo null = a year from sellFrom. */
    sellFrom: varchar("sell_from", { length: 7 }),
    sellTo: varchar("sell_to", { length: 7 }),
    status: routeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("transport_routes_driver_idx").on(table.driverId)],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    stopOrder: integer("stop_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("route_stops_route_order_unique").on(table.routeId, table.stopOrder)],
);

export const routeMapNodes = pgTable(
  "route_map_nodes",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    latitude: varchar("latitude", { length: 32 }).notNull(),
    longitude: varchar("longitude", { length: 32 }).notNull(),
    nodeOrder: integer("node_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("route_map_nodes_route_order_unique").on(table.routeId, table.nodeOrder),
    index("route_map_nodes_route_idx").on(table.routeId),
  ],
);

export const rideBookings = pgTable(
  "ride_bookings",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id").notNull(),
    userId: integer("user_id").notNull(),
    /** The calendar month this seat is for, 'YYYY-MM' (university local time). */
    month: varchar("month", { length: 7 }).notNull(),
    seatCount: integer("seat_count").notNull().default(1),
    seatNumber: varchar("seat_number", { length: 16 }),
    fareCents: integer("fare_cents").notNull(),
    status: bookingStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("ride_bookings_user_idx").on(table.userId),
    index("ride_bookings_month_idx").on(table.routeId, table.month, table.status),
  ],
);

export const vehicleMaintenance = pgTable(
  "vehicle_maintenance",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id").notNull(),
    reportedByDriverId: integer("reported_by_driver_id").notNull(),
    issue: text("issue").notNull(),
    status: maintenanceStatusEnum("status").notNull().default("reported"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  table => [index("vehicle_maintenance_vehicle_idx").on(table.vehicleId)],
);

// ===========================================================================
//  The university — buildings, floors, rooms, timetable
// ===========================================================================

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  /** The first digit of every room number in this building. */
  code: smallint("code").notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  shortName: varchar("short_name", { length: 32 }),
  /** Where it stands on the campus map. NULL = not placed yet. */
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const floors = pgTable(
  "floors",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    /** The second digit of every room number on this floor. */
    level: smallint("level").notNull(),
    label: varchar("label", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("floors_building_level_unique").on(table.buildingId, table.level)],
);

export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    floorId: integer("floor_id").notNull(),
    /** "325" — the number on the door, and what students search by. */
    roomNumber: varchar("room_number", { length: 3 }).notNull().unique(),
    buildingCode: smallint("building_code").notNull(),
    floorLevel: smallint("floor_level").notNull(),
    position: smallint("position").notNull(),
    name: varchar("name", { length: 120 }),
    kind: roomKindEnum("kind").notNull().default("lecture"),
    capacity: integer("capacity").notNull().default(40),
    active: boolean("active").notNull().default(true),
    notes: varchar("notes", { length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("rooms_building_floor_idx").on(table.buildingCode, table.floorLevel, table.position)],
);

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  department: varchar("department", { length: 80 }),
  yearLevel: smallint("year_level"),
  studentCount: integer("student_count"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  department: varchar("department", { length: 80 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ONE ROW = ONE WEEKLY SESSION.
 * Times are minutes since local midnight (09:00 -> 540); `dayOfWeek` is
 * ISO-8601 (1 = Monday … 7 = Sunday).
 */
export const timetableEntries = pgTable(
  "timetable_entries",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id").notNull(),
    batchId: integer("batch_id"),
    subjectId: integer("subject_id"),
    title: varchar("title", { length: 120 }),
    teacher: varchar("teacher", { length: 120 }),
    dayOfWeek: smallint("day_of_week").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("timetable_entries_room_day_idx").on(table.roomId, table.dayOfWeek, table.startMinute),
    index("timetable_entries_batch_idx").on(table.batchId, table.dayOfWeek),
  ],
);

/** A one-date change layered on top of the weekly grid. See schema.sql §5e. */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: serial("id").primaryKey(),
    kind: exceptionKindEnum("kind").notNull(),
    onDate: date("on_date").notNull(),
    entryId: integer("entry_id"),
    roomId: integer("room_id"),
    newRoomId: integer("new_room_id"),
    batchId: integer("batch_id"),
    subjectId: integer("subject_id"),
    title: varchar("title", { length: 120 }),
    teacher: varchar("teacher", { length: 120 }),
    startMinute: smallint("start_minute"),
    endMinute: smallint("end_minute"),
    reason: varchar("reason", { length: 280 }),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("schedule_exceptions_date_idx").on(table.onDate, table.kind),
    index("schedule_exceptions_entry_idx").on(table.entryId),
    index("schedule_exceptions_room_idx").on(table.roomId, table.onDate),
  ],
);

// --- inferred types --------------------------------------------------------
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DriverApplication = typeof driverApplications.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type TransportRoute = typeof transportRoutes.$inferSelect;
export type RideBooking = typeof rideBookings.$inferSelect;
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type RouteStop = typeof routeStops.$inferSelect;
export type RouteMapNode = typeof routeMapNodes.$inferSelect;
export type VehicleMaintenance = typeof vehicleMaintenance.$inferSelect;

export type Building = typeof buildings.$inferSelect;
export type Floor = typeof floors.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type TimetableEntry = typeof timetableEntries.$inferSelect;
export type ScheduleException = typeof scheduleExceptions.$inferSelect;

export type Role = User["role"];
export type ExceptionKind = ScheduleException["kind"];
