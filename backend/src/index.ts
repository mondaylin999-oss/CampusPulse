// ===========================================================================
//  index.ts — the CampusPulse API server.
//
//      cd backend
//      npm install
//      cp .env.example .env        (edit it: PostgreSQL password + JWT secret)
//      npm run dev                 (http://localhost:8000)
//
//  Everything is JSON over HTTP. The frontend in ../frontend finds this server
//  by itself (see frontend/src/lib/api.ts) — you do not have to configure a
//  URL for it to work on your own machine or on your Wi-Fi.
//
//  THE SHAPE OF THE API
//  --------------------
//    /rooms/*       PUBLIC. Room availability, buildings, timetables.
//                   No login, no account, no cookie.
//    /bookings/*    Holding a room. Reading is public; MAKING a booking is
//                   for the `agent` role, granted by the administrator.
//    /transport/*   Public transport details; administrators manage routes.
//    /auth/*        Login, registration, "who am I".
//    /admin/*       Everything an administrator maintains.
//
//  A new university service (announcements, library, lost & found…) is added
//  as one more module under src/ with one more router mounted here.
// ===========================================================================

import express from "express";
import cors from "cors";
import { ENV, assertEnv } from "./env.js";
import { assertSchemaInstalled, closeDatabase, pingDatabase } from "./database.js";
import { attachUser, errorMiddleware, route } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { transportRouter } from "./routes/transport.js";
import { roomsRouter } from "./routes/rooms.js";
import { bookingsRouter } from "./routes/bookings.js";
import { adminRouter } from "./routes/admin.js";
import { seedDatabase } from "./seed.js";
import { campusNow } from "./time.js";

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// --- CORS -------------------------------------------------------------------
// The listed origins plus any private/LAN address, so opening the app from a
// phone on the same Wi-Fi needs no configuration.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, health checks, same-origin
      if (ENV.corsOrigins.includes(origin) || ENV.corsOriginRegex.test(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGINS.`));
    },
    credentials: false,
  }),
);

// Reads the Bearer token when there is one. It never rejects: a public visitor
// simply arrives with no `req.user`, which is exactly what /rooms expects.
app.use(attachUser);

// --- health -----------------------------------------------------------------
// The frontend pings this to discover which address the API is on, so keep it
// cheap and never require a login.
app.get(
  "/health",
  route(async () => {
    const database = await pingDatabase();
    const now = campusNow();
    return {
      status: database.ok ? "ok" : "degraded",
      service: "campuspulse-api",
      database: database.ok ? "connected" : `unavailable: ${database.error}`,
      postgres: database.serverVersion ?? null,
      campusTime: now.label,
      campusDate: now.dateKey,
      campusMinute: now.minuteOfDay,
      timezone: now.timezone,
      time: new Date().toISOString(),
    };
  }),
);

app.use("/auth", authRouter);
app.use("/rooms", roomsRouter);
app.use("/bookings", bookingsRouter);
app.use("/transport", transportRouter);
app.use("/admin", adminRouter);

app.use((_req, res) => res.status(404).json({ error: "No such endpoint." }));
app.use(errorMiddleware);

// --- startup ----------------------------------------------------------------

async function start() {
  assertEnv();

  const database = await pingDatabase();
  if (!database.ok) {
    console.error(
      "\nCannot connect to PostgreSQL.\n" +
        `  ${database.error}\n\n` +
        "  Check DATABASE_URL in backend/.env — remember to percent-encode\n" +
        "  special characters in the password (# becomes %23). README section 3.\n",
    );
    process.exit(1);
  }
  await assertSchemaInstalled();

  if (ENV.seedOnStart) {
    try {
      await seedDatabase({ quiet: false });
    } catch (error) {
      console.warn("[seed] skipped:", error instanceof Error ? error.message : error);
    }
  }

  const now = campusNow();

  app.listen(ENV.port, ENV.host, () => {
    console.log("\n  CampusPulse API");
    console.log("  ────────────────────────────────────────────────────────");
    console.log(`  Listening      http://localhost:${ENV.port}  (host ${ENV.host})`);
    console.log(`  Health         http://localhost:${ENV.port}/health`);
    console.log(`  Room board     http://localhost:${ENV.port}/rooms  (public, no login)`);
    console.log(`  Database       ${database.serverVersion ?? "connected"}`);
    console.log(`  Campus clock   ${now.label}  (${now.timezone})`);
    console.log("  ────────────────────────────────────────────────────────");
    console.log("  Frontend: cd ../frontend && npm run dev\n");
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeDatabase();
    process.exit(0);
  });
}

start().catch(error => {
  console.error("\nCampusPulse failed to start:\n", error instanceof Error ? error.message : error, "\n");
  process.exit(1);
});
