# CampusPulse

One university platform with two halves that share one design, one database
and one login system:

- **Room availability & timetable** — a student standing in a corridor opens
  the site and sees which classrooms are free **right now**, and for how long.
  No account, no login, nothing to install.
- **School bus** — the existing bus system, carried over whole: routes, stops,
  daily departure times, monthly seats, the driver's console and the route map.

```
CampusPulse
│
├── Home                 free/busy counts, quick room search
├── Find a Room          "free now", or "free for the next 2 hours"
├── Buildings & Rooms    a campus map, or building → floor → the rooms on it
├── Timetable            the day as a grid, and the published changes
├── School Bus           routes, stops, times, seats  (booking needs a login)
└── Admin                timetable, campus, changes, people, driver permission
```

---

## 1. How a room's status is decided

**Availability is never stored and never switched by hand.** It is calculated,
on every request, from three things:

```
current day  +  current time  +  the room's timetable  =  AVAILABLE / OCCUPIED
```

1. The **weekly timetable** (`timetable_entries`) says what normally happens:
   one row per weekly session — room, day, start, end, class, subject, teacher.
2. That date's **exceptions** (`schedule_exceptions`) are layered on top:
   a cancelled class, a class moved to another room, a time change, a special
   class, a university holiday, a room shut for repairs.
3. The result is compared against the clock **in the university's own
   timezone** (`CAMPUS_TIMEZONE`, not the server's).

So at Monday 09:30 room 325 reads:

```
Room 325   🔴 Occupied   First Year CS   free at 11:00
```

…and at Monday 12:00:

```
Room 325   🟢 Available   Free for 1 hour   next: Third Year CS at 13:00
```

Two details that are easy to get wrong, and are handled:

- **Back-to-back classes.** A 09:00–10:00 followed by a 10:00–11:00 means the
  room is unusable until **11:00**, not 10:00. The calculator follows the whole
  run of touching sessions.
- **"Free for at least N minutes."** A room that frees up in ten minutes is not
  an answer to "I need somewhere for two hours", so the duration filter checks
  the entire window rather than just the next class.

The rules live in one pure, side-effect-free module —
[`backend/src/rooms/availability.ts`](backend/src/rooms/availability.ts) — with
tests for every case above in
[`availability.test.ts`](backend/src/rooms/availability.test.ts)
(`cd backend && npm test`).

### Room numbering

A room number is three digits: **building, floor, position**.

```
325  →  Building 3, Floor 2, Room 5
214  →  Building 2, Floor 1, Room 4
```

The default campus is 4 buildings × 6 floors × 6 rooms = **144 rooms**, laid
out by the seed. Nothing is hard-coded to those numbers — change
`SEED_BUILDINGS` / `SEED_FLOORS` / `SEED_ROOMS_PER_FLOOR`, or add a building in
the admin screens, and the whole platform follows. The number is always derived
from the three parts (never typed by hand), and the database enforces the same
rule with a `CHECK` so the two can never drift apart.

---

## 2. Run it

You need **PostgreSQL** and **Node 20+**. A C++ compiler is optional.

```bash
# 1. the database
createdb -U postgres campuspulse_db
psql -U postgres -d campuspulse_db -f database/schema.sql

# 2. the API
cd backend
npm install
cp .env.example .env          # edit DATABASE_URL and JWT_SECRET
npm run dev                   # http://localhost:8000

# 3. the app
cd ../frontend
npm install
npm run dev                   # http://localhost:5173
```

In pgAdmin4 instead of the command line: create a database called
`campuspulse_db`, open Tools → Query Tool **on that database**, open
`database/schema.sql` and press F5.

The first backend start seeds the campus, a demo week of classes, one bus
route, and three logins:

| Username  | Role          | Password   |
| --------- | ------------- | ---------- |
| `admin`   | Administrator | `campus123` |
| `driver`  | Bus driver    | `campus123` |
| `student` | Student       | `campus123` |

Change `SEED_PASSWORD` in `.env` before the first run to use something else.

**The room board needs none of these.** Open `http://localhost:5173` signed out
and everything public is there.

### From your phone

The frontend listens on every interface and the API is found automatically, so
open `http://<your-laptop-ip>:5173` from a phone on the same Wi-Fi. Nothing to
configure — see the comment at the top of `frontend/src/lib/api.ts`.

---

## 3. The C++ engine (optional)

The school-bus seat rules — who may ask for a monthly seat, how many are left,
whether the driver may accept one — are kept in C++, exactly as in the original
bus system:

```
Node  ──JSON on stdin──►  campus_engine <command>  ──JSON on stdout──►  Node
```

```bash
cd backend && bash cpp/build.sh     # or cpp\build.bat on Windows
```

Until it is built, the API runs a TypeScript twin of the same rules, so nothing
is broken before a compiler is installed. `GET /health` says which one is live.

**Room availability is deliberately not in the engine.** It is a pure
calculation over the timetable and the clock, and sending the whole timetable
through a subprocess on every page view would cost far more than it explains.
It lives in one readable TypeScript module with tests instead.

---

## 4. What came from the existing bus system

The bus half was **integrated, not rewritten**. Carried over essentially
unchanged:

| Kept                                                     | Where                                     |
| -------------------------------------------------------- | ----------------------------------------- |
| Monthly seat logic, capacity rules, driver console, maps | `backend/src/transport.ts`, `routes/transport.ts` |
| The C++ seat planner                                     | `backend/cpp/` (`MonthlyPassPlanner`, `SeatPlanner`) |
| The bus database tables                                  | `database/schema.sql` §3–4                |
| scrypt passwords + JWT sessions                          | `backend/src/auth.ts`                     |
| The API-discovery client and `useApiData`                | `frontend/src/lib/api.ts`, `hooks/`       |
| The design system, shell, and Leaflet route map          | `frontend/src/index.css`, `components/`   |
| Student booking / driver console / route editor screens  | `frontend/src/pages/student`, `pages/driver` |
| English ⇄ မြန်မာ and light/dark                          | `frontend/src/lib/i18n.ts`, `prefs.tsx`   |

**Removed, with the reason:** the canteen, the wallet and the cash-flow ledger
(`food_items`, `orders`, `order_items`, `transactions`, the kitchen display,
the menu board, the money screens and their C++ modules). They belong to a
canteen product, not to a room-finder, and the bus module never touched them —
it takes no money through the app at all. Nothing bus-related was lost. The
architecture leaves room to add a canteen back as another module.

**Renamed for one consistent vocabulary:** "ferry" → "bus", "agent" → "driver",
and the design tone `ferry`/`canteen` → `bus`/`rooms` — so the two halves read
as one product rather than two.

---

## 5. Layout

```
database/
  schema.sql          every table, commented, idempotent
  reset.sql           start over

backend/
  cpp/                the C++ school-bus engine
  drizzle/schema.ts   the TypeScript mirror of schema.sql
  src/
    index.ts          the server: which routers are mounted
    env.ts            everything read from .env
    time.ts           the university's clock (never the server's)
    auth.ts           scrypt passwords, JWT sessions
    accounts.ts       user records
    drivers.ts        driver permission: ask, approve, revoke
    engine.ts         the C++ bridge + its TypeScript twin
    transport.ts      the school bus            (from the existing system)
    rooms/
      availability.ts THE CORE RULE — pure, tested, no database
      rooms.ts        the board: reads the timetable, calls the calculator
      timetable.ts    weekly entries + conflict checks + exceptions
      catalog.ts      buildings, floors, rooms, batches, subjects
    routes/
      auth.ts         /auth/*        login, register
      rooms.ts        /rooms/*       PUBLIC — no login anywhere in this file
      transport.ts    /transport/*   public reads, student booking, driver
      admin.ts        /admin/*       one guard for the whole file

frontend/src/
  components/         AppShell (one shell, public + signed in), ui, rooms, map
  lib/                api, auth, prefs, i18n, format
  pages/
    public/           Home, FindRoom, Buildings, RoomDetail, Timetable, Bus
    student/          Me (my seat + ask to drive), BusSeats, MySeat
    driver/           BusConsole, RouteEditor      (from the existing system)
    admin/            Overview, TimetableManager, Campus, Changes, People
```

---

## 6. The API

Public — **no authentication anywhere in this group**:

| Endpoint                     | What it answers                                   |
| ---------------------------- | ------------------------------------------------- |
| `GET /rooms/pulse`           | free/busy counts now, plus a few free rooms       |
| `GET /rooms`                 | the board; `?building= &floor= &search= &available=1 &minFreeMinutes= &date= &minute=` |
| `GET /rooms/:number`         | one room: now, next, and the whole day            |
| `GET /rooms/:number/week`    | that room's normal week                           |
| `GET /rooms/buildings`       | buildings, floors, room counts, free-now counts, map pins |
| `GET /rooms/changes/upcoming`| cancellations, moves and holidays ahead           |
| `GET /transport/public/routes` `…/roads` | bus routes, stops, times, seats left  |
| `GET /health`                | database, engine, and the campus clock            |

Signed in: `/transport/seats` (student), `/transport/driver/*` (driver),
`/transport/driver-applications` (ask to drive).
Administrator only: everything under `/admin/*`.

---

## 7. The campus map

**Buildings & Rooms** has a list view and a map view; the choice is remembered
per browser. Each pin carries the building's number and **how many of its rooms
are free this minute**, coloured green / amber / red — with the number always
beside the colour, so the colour is never the only thing carrying the message.
Tapping a pin opens that building's rooms.

Coordinates live on `buildings.latitude` / `.longitude` and are **NULL until an
administrator places the building**, which is done by clicking the map in
**Admin → Campus & rooms** rather than by typing numbers: a building a hundred
metres out is worse than one that is simply missing, because the map then lies
confidently. Values are rounded to six decimals (~11cm) on save.

The seed ships placeholder positions on the University of Yangon campus so the
map is not empty on a first run. They are **not a survey** — drag each building
to its real spot, or take it off the map.

Leaflet + OpenStreetMap, the same pair the bus route map already used: no API
key and no account. Leaflet is imported dynamically, so its ~150KB stays out of
the bundle for anyone who never opens a map, and if the tiles cannot load the
page says so and the list view carries on working.

## 8. Timetable changes

The weekly timetable is **never edited** to record a one-off. The office adds
an exception for one date, and the board layers it on when it works that date
out; delete it and the normal week is back. Six kinds, all in
**Admin → Timetable Changes**:

| Kind          | Effect on that date                                   |
| ------------- | ----------------------------------------------------- |
| `cancel`      | that class does not happen — the room reads free       |
| `move_room`   | same class, different room — **both** rooms update     |
| `retime`      | same class, different hours                            |
| `extra`       | a class that is not in the weekly timetable at all     |
| `holiday`     | no scheduled teaching anywhere                         |
| `room_closed` | that room is out of use (all day, or between two times)|

## 9. Conflicts

A timetable entry is refused — with the clashing rows named — when it would put
two classes in one room at the same time, or one class in two rooms at once.
The admin form asks the same question live while you type
(`POST /admin/timetable/check`), so a clash is a sentence in the form rather
than a refusal after Save. The browser never decides: the server checks again.

## 10. Driver permission

Nobody becomes a bus driver by signing up.

```
student asks  →  the office's queue  →  administrator approves
                                        ↓
                          role becomes `driver`, bus + profile created
```

A student asks on **My Bus Seat**; the administrator decides in
**Admin → People & Drivers**. Refusing changes nothing about the account.
Permission can also be taken back later — the bus, its routes and the seats
students already hold are deliberately kept, because deleting them would take
somebody's seat away without telling them.

## 11. Adding another university service

The architecture is a module per service, and nothing about the room board is
special:

1. tables in `database/schema.sql` + `backend/drizzle/schema.ts`
2. a folder under `backend/src/` for the rules
3. a router in `backend/src/routes/`, mounted in `index.ts`
4. pages under `frontend/src/pages/`, a `<Route>` in `App.tsx`, an entry in
   `PUBLIC_NAV` (or `ROLE_NAV`) in `AppShell.tsx`

Announcements, events, library information, lost and found or campus navigation
would each be that shape. None of them is implemented.
