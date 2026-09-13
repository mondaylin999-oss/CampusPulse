// ===========================================================================
//  engine.ts — the bridge between the Node API and the C++ domain engine.
//
//  CampusPulse keeps the SCHOOL BUS seat rules in C++ (backend/cpp): who may
//  ask for a monthly seat, how many are left, whether the driver may accept
//  one. They are asked of the compiled engine:
//
//      Node  ──JSON on stdin──►  campus_engine <command>  ──JSON on stdout──►  Node
//
//  Build it once with  bash cpp/build.sh  (or cpp\build.bat on Windows).
//
//  FALLBACK
//  --------
//  If the binary has not been compiled yet, this module runs an equivalent
//  TypeScript implementation of the same rules, so the app never breaks before
//  a compiler is installed. GET /health tells you which one is live, and
//  setting CAMPUS_ENGINE_REQUIRED=true in .env turns a missing binary into a
//  hard startup error instead.
// ===========================================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cppRoot = path.resolve(here, "..", "cpp");

const CANDIDATES = [
  ENV.enginePath,
  path.join(cppRoot, "build", "campus_engine"),
  path.join(cppRoot, "build", "campus_engine.exe"),
  path.join(cppRoot, "build", "Release", "campus_engine.exe"),
  path.join(cppRoot, "build", "Debug", "campus_engine.exe"),
].filter(Boolean) as string[];

export type EngineMode = "c++" | "typescript";

let cachedBinary: string | null | undefined;

export function enginePath(): string | null {
  if (cachedBinary === undefined) cachedBinary = CANDIDATES.find(candidate => existsSync(candidate)) ?? null;
  return cachedBinary;
}

export function engineMode(): EngineMode {
  return enginePath() ? "c++" : "typescript";
}

/** Forget the cached lookup — used after a build, and by the tests. */
export function refreshEngine() {
  cachedBinary = undefined;
}

/** Thrown when the engine says a rule was broken (ok:false). Maps to HTTP 400. */
export class EngineRuleError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "EngineRuleError";
  }
}

function runBinary(binary: string, command: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [command], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`C++ engine timed out running "${command}".`));
    }, 10_000);

    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (!stdout.trim()) {
        reject(new Error(`C++ engine produced no output for "${command}" (exit ${code}). ${stderr.trim()}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { ok: boolean; result?: unknown; error?: string };
        if (!parsed.ok) {
          reject(new EngineRuleError(parsed.error ?? "The request was refused by the engine."));
          return;
        }
        resolve(parsed.result);
      } catch (error) {
        reject(new Error(`C++ engine returned malformed JSON for "${command}": ${String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(payload ?? {}));
    child.stdin.end();
  });
}

/**
 * Run one engine command. Uses the C++ binary when it exists, otherwise the
 * TypeScript twin below. A broken *rule* (EngineRuleError) is never retried in
 * the fallback — only a broken *process* is.
 */
export async function callEngine<T>(command: EngineCommand, payload: Record<string, unknown> = {}): Promise<T> {
  const binary = enginePath();
  if (binary) {
    try {
      return (await runBinary(binary, command, payload)) as T;
    } catch (error) {
      if (error instanceof EngineRuleError) throw error;
      console.warn(`[engine] C++ call "${command}" failed (${String(error)}) — using the TypeScript fallback.`);
      cachedBinary = null;
    }
  }
  return fallback<T>(command, payload);
}

// ===========================================================================
//  TypeScript twin of the C++ rules.
//  Keep this in step with backend/cpp/src/*.cpp.
// ===========================================================================

/**
 * The command names keep the original "ferry." prefix: they are the wire
 * protocol shared with the compiled C++ (cpp/src/engine_main.cpp), and the two
 * sides must agree. The product calls it the school bus everywhere a person
 * can see.
 */
export type EngineCommand =
  | "info"
  | "ferry.plan"
  | "ferry.canRequest"
  | "ferry.canConfirm"
  | "ferry.capacityFloor"
  | "ferry.planMonth"
  | "ferry.canRequestMonth"
  | "ferry.canAcceptMonth"
  | "ferry.monthCapacityFloor";

type Row = Record<string, any>;

const asList = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

/** Seats held on one road, in one month, with one status. */
const passSeats = (passes: Row[], routeId: unknown, month: unknown, status: string) =>
  passes
    .filter(pass => Number(pass.routeId) === Number(routeId) && pass.month === month && pass.status === status)
    .reduce((sum, pass) => sum + Number(pass.seatCount ?? 1), 0);

function fallback<T>(command: EngineCommand, payload: Record<string, any>): T {
  switch (command) {
    case "info":
      return { engine: "typescript", version: "1.0.0", commands: [] } as T;

    case "ferry.plan": {
      const bookings = asList(payload.bookings);
      const trips = asList(payload.trips).map(trip => {
        const occupiedSeats = seatsWithStatus(bookings, trip.tripId, "confirmed");
        const pendingSeats = seatsWithStatus(bookings, trip.tripId, "pending");
        const availableSeats = Math.max(0, Number(trip.totalSeats) - occupiedSeats);
        return {
          tripId: Number(trip.tripId),
          totalSeats: Number(trip.totalSeats),
          occupiedSeats,
          pendingSeats,
          availableSeats,
          loadPercent: Number(trip.totalSeats) ? (occupiedSeats * 100) / Number(trip.totalSeats) : 0,
          bookable: isBookable(trip) && availableSeats > 0,
        };
      });
      return { trips } as T;
    }

    case "ferry.canRequest": {
      const trip = payload.trip as Row;
      const bookings = asList(payload.bookings);
      const seatCount = Number(payload.seatCount ?? 1);
      const fareCents = Number(trip.fareCents) * Math.max(0, seatCount);
      const occupied = seatsWithStatus(bookings, trip.tripId, "confirmed");
      const availableSeats = Math.max(0, Number(trip.totalSeats) - occupied);

      if (seatCount < 1 || seatCount > 8) return { allowed: false, reason: "Request between 1 and 8 seats.", fareCents, availableSeats: 0 } as T;
      if (!isBookable(trip)) return { allowed: false, reason: "This trip is not available for booking.", fareCents, availableSeats: 0 } as T;
      if (bookings.some(booking => Number(booking.tripId) === Number(trip.tripId) && Number(booking.userId) === Number(payload.userId) && ["pending", "confirmed"].includes(booking.status)))
        return { allowed: false, reason: "You already have an active booking for this trip.", fareCents, availableSeats: 0 } as T;
      if (availableSeats <= 0) return { allowed: false, reason: "There are no seats remaining on this trip.", fareCents, availableSeats } as T;
      if (seatCount > availableSeats)
        return { allowed: false, reason: "This request exceeds the currently available ferry seats.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "", fareCents, availableSeats } as T;
    }

    case "ferry.canConfirm": {
      const trip = payload.trip as Row;
      const bookings = asList(payload.bookings);
      const booking = bookings.find(candidate => Number(candidate.id) === Number(payload.bookingId));
      if (!booking) return { allowed: false, reason: "Booking request was not found.", fareCents: 0, availableSeats: 0 } as T;
      if (booking.status !== "pending")
        return { allowed: false, reason: "Only pending bookings can be confirmed or rejected.", fareCents: 0, availableSeats: 0 } as T;
      const occupied = seatsWithStatus(bookings, trip.tripId, "confirmed");
      const availableSeats = Math.max(0, Number(trip.totalSeats) - occupied);
      const fareCents = Number(booking.seatCount) * Number(trip.fareCents);
      if (occupied + Number(booking.seatCount) > Number(trip.totalSeats))
        return { allowed: false, reason: "This request cannot be accepted because the ferry bus is full.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "", fareCents, availableSeats } as T;
    }

    case "ferry.capacityFloor": {
      const bookings = asList(payload.bookings);
      const committedSeats = asList(payload.trips)
        .filter(trip => Number(trip.vehicleId) === Number(payload.vehicleId) && ["scheduled", "boarding", "in_progress"].includes(trip.status))
        .reduce((sum, trip) => sum + seatsWithStatus(bookings, trip.tripId, "confirmed"), 0);
      return { committedSeats } as T;
    }

    // ---- the ferry sold by the month -------------------------------------
    // Twin of cpp/src/MonthlyPassPlanner.cpp. A pending request holds no seat;
    // each calendar month is counted on its own.

    case "ferry.planMonth": {
      const passes = asList(payload.passes);
      const roads = asList(payload.roads).map(road => {
        const occupiedSeats = passSeats(passes, road.routeId, road.month, "confirmed");
        const pendingSeats = passSeats(passes, road.routeId, road.month, "pending");
        const availableSeats = Math.max(0, Number(road.totalSeats) - occupiedSeats);
        return {
          routeId: Number(road.routeId),
          month: String(road.month ?? ""),
          totalSeats: Number(road.totalSeats),
          occupiedSeats,
          pendingSeats,
          availableSeats,
          loadPercent: Number(road.totalSeats) ? (occupiedSeats * 100) / Number(road.totalSeats) : 0,
          sellable: road.routeStatus === "active" && road.vehicleStatus === "operational" && availableSeats > 0,
        };
      });
      return { roads } as T;
    }

    case "ferry.canRequestMonth": {
      const road = payload.road as Row;
      const passes = asList(payload.passes);
      const seatCount = Number(payload.seatCount ?? 1);
      const currentMonth = String(payload.currentMonth ?? "");
      const fareCents = Number(road.monthlyFareCents) * Math.max(0, seatCount);
      const occupied = passSeats(passes, road.routeId, road.month, "confirmed");
      const availableSeats = Math.max(0, Number(road.totalSeats) - occupied);
      const no = (reason: string) => ({ allowed: false, reason, fareCents, availableSeats }) as T;

      if (seatCount < 1 || seatCount > 8) return no("Ask for between 1 and 8 seats.");
      if (String(road.month ?? "").length !== 7) return no("Choose a month.");
      if (currentMonth && String(road.month) < currentMonth) return no("That month has already finished.");
      if (road.routeStatus !== "active") return no("This road is not running at the moment.");
      if (road.vehicleStatus !== "operational") return no("The ferry bus on this road is not in service.");
      if (
        passes.some(
          pass =>
            Number(pass.routeId) === Number(road.routeId) &&
            Number(pass.userId) === Number(payload.userId) &&
            pass.month === road.month &&
            ["pending", "confirmed"].includes(pass.status),
        )
      )
        return no("You already have a seat on this road for that month.");
      if (availableSeats <= 0) return no("Every seat on this road is taken for that month.");
      if (seatCount > availableSeats) return no("That is more seats than are left for that month.");
      return { allowed: true, reason: "ok", fareCents, availableSeats } as T;
    }

    case "ferry.canAcceptMonth": {
      const road = payload.road as Row;
      const passes = asList(payload.passes);
      const pass = passes.find(candidate => Number(candidate.id) === Number(payload.passId));
      if (!pass) return { allowed: false, reason: "That request no longer exists.", fareCents: 0, availableSeats: 0 } as T;
      if (pass.status !== "pending") return { allowed: false, reason: "Only a waiting request can be accepted.", fareCents: 0, availableSeats: 0 } as T;
      const occupied = passSeats(passes, road.routeId, pass.month, "confirmed");
      const availableSeats = Math.max(0, Number(road.totalSeats) - occupied);
      const fareCents = Number(road.monthlyFareCents) * Number(pass.seatCount);
      if (Number(pass.seatCount) > availableSeats)
        return { allowed: false, reason: "Accepting this would put more students on the bus than it has seats.", fareCents, availableSeats } as T;
      return { allowed: true, reason: "ok", fareCents, availableSeats } as T;
    }

    case "ferry.monthCapacityFloor": {
      const passes = asList(payload.passes).filter(pass => Number(pass.routeId) === Number(payload.routeId) && pass.status === "confirmed");
      const committedSeats = passes.reduce((worst, pass) => Math.max(worst, passSeats(passes, payload.routeId, pass.month, "confirmed")), 0);
      return { committedSeats } as T;
    }

    default:
      throw new Error(`Unknown engine command: ${command}`);
  }
}

function seatsWithStatus(bookings: Row[], tripId: unknown, status: string) {
  return bookings
    .filter(booking => Number(booking.tripId) === Number(tripId) && booking.status === status)
    .reduce((sum, booking) => sum + Number(booking.seatCount ?? 0), 0);
}

function isBookable(trip: Row) {
  return ["scheduled", "boarding"].includes(trip.status) && trip.routeStatus === "active" && trip.vehicleStatus === "operational";
}
