-- ===========================================================================
--  CampusPulse — PostgreSQL schema
--  One university platform:  Room Availability & Timetable  +  School Bus
--
--  HOW TO RUN THIS FILE (pgAdmin4)
--  ------------------------------------------------------------------------
--   1. Open pgAdmin4 and connect to your local PostgreSQL server.
--   2. Right-click "Databases" -> Create -> Database…  name it  campuspulse_db
--   3. Select that database, open  Tools -> Query Tool.
--   4. Open this file (the folder icon), then press F5 / the ▶ button.
--
--  HOW TO RUN THIS FILE (command line)
--  ------------------------------------------------------------------------
--      createdb -U postgres campuspulse_db
--      psql -U postgres -d campuspulse_db -f database/schema.sql
--
--  The file is idempotent: running it twice does not fail and does not
--  destroy data. To start over, run database/reset.sql first.
--
--  You do NOT need to insert accounts by hand. The backend seeds the admin,
--  a driver and a demo student on its first start (backend/src/seed.ts), and
--  it fills in the 4 buildings / 6 floors / 6 rooms as well.
--
--  NOTE ON THE BUS TABLES
--  ------------------------------------------------------------------------
--  Sections 3-4 are the school-bus tables carried over unchanged from the
--  existing system, so the bus module keeps working exactly as it did. Only
--  the canteen/wallet tables were left behind — this platform has no canteen.
--  Section 5 is the new room/timetable half, including room bookings.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Enumerated types
--    Postgres enums are strict: a bad value is rejected by the database, not
--    only by the application. DO-blocks make the CREATE re-runnable.
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role            AS ENUM ('admin', 'agent', 'user', 'driver');          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_status       AS ENUM ('active', 'inactive');                        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_status       AS ENUM ('operational', 'unavailable', 'maintenance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_flag     AS ENUM ('clear', 'reported', 'in_service');           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_status   AS ENUM ('reported', 'in_progress', 'resolved');       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE route_status         AS ENUM ('active', 'inactive');                        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE driver_availability  AS ENUM ('available', 'unavailable');                  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_status       AS ENUM ('pending', 'confirmed', 'cancelled');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The driver's permission to run a bus is granted by the ADMINISTRATOR.
DO $$ BEGIN CREATE TYPE application_status   AS ENUM ('pending', 'approved', 'rejected');           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- The room half.
DO $$ BEGIN CREATE TYPE room_kind            AS ENUM ('lecture', 'lab', 'seminar', 'studio', 'office'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE exception_kind       AS ENUM ('cancel', 'move_room', 'retime', 'extra', 'holiday', 'room_closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. Accounts
--    One table for every role. `password_hash` holds a scrypt hash produced
--    by backend/src/auth.ts — never a plain password.
--
--    PUBLIC VISITORS HAVE NO ROW HERE. Looking up a free classroom needs no
--    account at all; this table exists for the administrator, the bus drivers
--    and the students who book a bus seat.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  open_id        VARCHAR(64)  NOT NULL UNIQUE,          -- stable public id used in session tokens
  username       VARCHAR(64)  UNIQUE,
  password_hash  VARCHAR(255),
  name           TEXT,
  email          VARCHAR(320),
  login_method   VARCHAR(64)  DEFAULT 'local',
  role           user_role      NOT NULL DEFAULT 'user',
  status         account_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_signed_in TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

-- ---------------------------------------------------------------------------
-- 2. Driver permission requests
--    Someone asks to run a school bus; the ADMINISTRATOR decides. Only on
--    approval does the account become an active `driver` with a bus of its own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_applications (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  phone          VARCHAR(32),
  license_number VARCHAR(80),
  plate_number   VARCHAR(32),
  total_seats    INTEGER,
  message        TEXT,
  status         application_status NOT NULL DEFAULT 'pending',
  decided_by_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  decision_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS driver_applications_status_idx ON driver_applications (status, created_at DESC);
-- One open request per person: asking twice does not create a second queue entry.
CREATE UNIQUE INDEX IF NOT EXISTS driver_applications_one_open
  ON driver_applications (user_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. School bus — vehicles, drivers, routes   (carried over unchanged)
--    One driver owns one bus; a route is published on that bus; a seat is
--    sold by the calendar month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                 SERIAL PRIMARY KEY,
  driver_id          INTEGER UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  plate_number       VARCHAR(32) UNIQUE,
  vehicle_type       VARCHAR(80)  NOT NULL DEFAULT 'School bus',
  model              VARCHAR(120) NOT NULL DEFAULT 'Unspecified',
  total_seats        INTEGER      NOT NULL CHECK (total_seats > 0),
  monthly_fee_cents  INTEGER      NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
  status             vehicle_status   NOT NULL DEFAULT 'operational',
  maintenance_status maintenance_flag NOT NULL DEFAULT 'clear',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  phone          VARCHAR(32),
  license_number VARCHAR(80),
  availability   driver_availability NOT NULL DEFAULT 'available',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL DEFAULT 'Campus route',
  driver_id         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  vehicle_id        INTEGER REFERENCES vehicles (id) ON DELETE SET NULL,
  start_point       VARCHAR(160) NOT NULL,
  destination       VARCHAR(160) NOT NULL,
  pickup_locations  TEXT         NOT NULL,
  map_url           VARCHAR(2048),
  map_coordinates   VARCHAR(128),
  route_line_color  VARCHAR(7)   NOT NULL DEFAULT '#0284C7',
  distance_km       INTEGER,
  estimated_minutes INTEGER,
  fare_cents        INTEGER      NOT NULL CHECK (fare_cents > 0),  -- the price of ONE MONTH
  -- The bus runs the same two times every day, so they live on the route
  -- itself. A route that is running runs every day.
  morning_time      VARCHAR(5)   NOT NULL DEFAULT '06:30',
  evening_time      VARCHAR(5),
  -- The months this route is sold for, 'YYYY-MM'. sell_to NULL = open ended.
  sell_from         VARCHAR(7),
  sell_to           VARCHAR(7),
  status            route_status NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transport_routes_driver_idx ON transport_routes (driver_id);

CREATE TABLE IF NOT EXISTS route_stops (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER      NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  name       VARCHAR(160) NOT NULL,
  stop_order INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_route_order_unique UNIQUE (route_id, stop_order)
);

-- Geographic nodes the driver publishes to draw the route line on the map.
CREATE TABLE IF NOT EXISTS route_map_nodes (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER      NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  name       VARCHAR(160) NOT NULL,
  latitude   VARCHAR(32)  NOT NULL,
  longitude  VARCHAR(32)  NOT NULL,
  node_order INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT route_map_nodes_route_order_unique UNIQUE (route_id, node_order)
);
CREATE INDEX IF NOT EXISTS route_map_nodes_route_idx ON route_map_nodes (route_id);

-- ---------------------------------------------------------------------------
-- 4. School bus — a MONTHLY SEAT, not a seat on one departure.
--    A student takes one seat on one route for a whole calendar month; the
--    driver accepts it once. `month` is the local month as 'YYYY-MM'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_bookings (
  id          SERIAL PRIMARY KEY,
  route_id    INTEGER        NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  user_id     INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month       VARCHAR(7)     NOT NULL,
  seat_count  INTEGER        NOT NULL DEFAULT 1 CHECK (seat_count > 0),
  seat_number VARCHAR(16),
  fare_cents  INTEGER        NOT NULL CHECK (fare_cents >= 0),
  status      booking_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_bookings_user_idx  ON ride_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ride_bookings_month_idx ON ride_bookings (route_id, month, status);
CREATE UNIQUE INDEX IF NOT EXISTS ride_bookings_one_per_month
  ON ride_bookings (route_id, user_id, month)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id                     SERIAL PRIMARY KEY,
  vehicle_id             INTEGER NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  reported_by_driver_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  issue                  TEXT    NOT NULL,
  status                 maintenance_status NOT NULL DEFAULT 'reported',
  resolution_note        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_idx ON vehicle_maintenance (vehicle_id, created_at DESC);

-- ===========================================================================
--  5. THE UNIVERSITY — buildings, floors, rooms, timetable
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 5a. Buildings and floors
--     `code` is the FIRST DIGIT of a room number: building 3 -> rooms 3xx.
--     `level` is the SECOND digit: floor 2 of building 3 -> rooms 32x.
--     The university has 4 buildings x 6 floors x 6 rooms = up to 144 rooms,
--     but nothing here hard-codes those numbers: add a fifth building and the
--     whole platform follows. Only the three-digit room *number* assumes one
--     digit for each part.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
  id         SERIAL PRIMARY KEY,
  code       SMALLINT     NOT NULL UNIQUE CHECK (code BETWEEN 1 AND 9),
  name       VARCHAR(120) NOT NULL,
  short_name VARCHAR(32),
  -- Where the building stands, for the campus map. NULL simply means "not
  -- placed yet" — the map skips it and the rest of the platform does not care.
  -- Kept as text, like route_map_nodes, so the two maps parse coordinates the
  -- same way and no rounding creeps in between the database and Leaflet.
  latitude   VARCHAR(32),
  longitude  VARCHAR(32),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Added after the first release: a database made by an earlier version of this
-- file already has `buildings`, and CREATE TABLE IF NOT EXISTS leaves it alone.
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS latitude  VARCHAR(32);
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS longitude VARCHAR(32);

CREATE TABLE IF NOT EXISTS floors (
  id          SERIAL PRIMARY KEY,
  building_id INTEGER  NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
  level       SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 9),
  label       VARCHAR(60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT floors_building_level_unique UNIQUE (building_id, level)
);

-- ---------------------------------------------------------------------------
-- 5b. Rooms
--     `room_number` ("325") is the public identity students search by, and the
--     three digits are also stored apart so the API can filter by building or
--     floor without string surgery. A CHECK keeps the two in step: the number
--     is ALWAYS building*100 + floor*10 + position.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id            SERIAL PRIMARY KEY,
  floor_id      INTEGER     NOT NULL REFERENCES floors (id) ON DELETE CASCADE,
  room_number   VARCHAR(3)  NOT NULL UNIQUE,
  building_code SMALLINT    NOT NULL,
  floor_level   SMALLINT    NOT NULL,
  position      SMALLINT    NOT NULL CHECK (position BETWEEN 1 AND 9),
  name          VARCHAR(120),
  kind          room_kind   NOT NULL DEFAULT 'lecture',
  capacity      INTEGER     NOT NULL DEFAULT 40 CHECK (capacity > 0),
  -- FALSE takes the room off the board for good (being rebuilt, etc.).
  -- A room shut for a single day is a `room_closed` exception instead.
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  notes         VARCHAR(280),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rooms_number_matches_parts
    CHECK (room_number = lpad((building_code * 100 + floor_level * 10 + position)::text, 3, '0')),
  CONSTRAINT rooms_floor_position_unique UNIQUE (floor_id, position)
);
CREATE INDEX IF NOT EXISTS rooms_building_floor_idx ON rooms (building_code, floor_level, position);

-- ---------------------------------------------------------------------------
-- 5c. Who and what is taught
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(24)  NOT NULL UNIQUE,       -- "CS-1"
  name          VARCHAR(120) NOT NULL,              -- "First Year CS"
  department    VARCHAR(80),
  year_level    SMALLINT CHECK (year_level BETWEEN 1 AND 8),
  student_count INTEGER CHECK (student_count >= 0),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subjects (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(24)  NOT NULL UNIQUE,          -- "CS-1101"
  name       VARCHAR(120) NOT NULL,
  department VARCHAR(80),
  active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5d. The weekly timetable
--
--     ONE ROW = ONE WEEKLY SESSION. "Room 325, Monday 09:00-10:00, First Year
--     CS, Programming I". Availability is never stored — it is worked out from
--     these rows plus the clock (see backend/src/rooms/availability.ts).
--
--     Times are LOCAL MINUTES SINCE MIDNIGHT (09:00 -> 540). Integers compare
--     and overlap-test exactly, which strings and timestamps do not.
--
--     `day_of_week` follows ISO-8601: 1 = Monday … 7 = Sunday.
--
--     `effective_from` / `effective_to` are the term this entry belongs to, so
--     last semester's timetable can stay in the database without appearing on
--     today's board. NULL on either side means "no limit that way".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timetable_entries (
  id             SERIAL PRIMARY KEY,
  room_id        INTEGER  NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  batch_id       INTEGER  REFERENCES batches (id) ON DELETE SET NULL,
  subject_id     INTEGER  REFERENCES subjects (id) ON DELETE SET NULL,
  title          VARCHAR(120),                    -- used when there is no subject row
  teacher        VARCHAR(120),
  day_of_week    SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_minute   SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute     SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  effective_from DATE,
  effective_to   DATE,
  active         BOOLEAN  NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timetable_entries_time_order CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS timetable_entries_room_day_idx ON timetable_entries (room_id, day_of_week, start_minute);
CREATE INDEX IF NOT EXISTS timetable_entries_batch_idx    ON timetable_entries (batch_id, day_of_week);

-- ---------------------------------------------------------------------------
-- 5e. Exceptions — what happens on ONE DATE that the weekly grid does not say.
--
--     The weekly timetable is never edited to record a one-off change; an
--     exception row is added instead, and it is layered on top when the board
--     is worked out for that date. Kinds:
--
--       cancel       this class is not happening today          (entry_id)
--       move_room    same class, different room today           (entry_id + new_room_id)
--       retime       same class, different hours today          (entry_id + minutes)
--       extra        a class that is not in the weekly grid     (room_id + minutes)
--       holiday      no scheduled teaching at all that date     (campus-wide)
--       room_closed  one room is out of use for part/all of the date
--
--     A single table keeps the layering logic in one place; the CHECK below
--     makes sure each kind carries the fields it actually needs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id             SERIAL PRIMARY KEY,
  kind           exception_kind NOT NULL,
  on_date        DATE     NOT NULL,
  entry_id       INTEGER  REFERENCES timetable_entries (id) ON DELETE CASCADE,
  room_id        INTEGER  REFERENCES rooms (id) ON DELETE CASCADE,
  new_room_id    INTEGER  REFERENCES rooms (id) ON DELETE CASCADE,
  batch_id       INTEGER  REFERENCES batches (id) ON DELETE SET NULL,
  subject_id     INTEGER  REFERENCES subjects (id) ON DELETE SET NULL,
  title          VARCHAR(120),
  teacher        VARCHAR(120),
  start_minute   SMALLINT CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute     SMALLINT CHECK (end_minute BETWEEN 1 AND 1440),
  reason         VARCHAR(280),
  created_by_id  INTEGER  REFERENCES users (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_shape CHECK (
    (kind = 'cancel'      AND entry_id IS NOT NULL) OR
    (kind = 'move_room'   AND entry_id IS NOT NULL AND new_room_id IS NOT NULL) OR
    (kind = 'retime'      AND entry_id IS NOT NULL AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute) OR
    (kind = 'extra'       AND room_id  IS NOT NULL AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND end_minute > start_minute) OR
    (kind = 'holiday') OR
    (kind = 'room_closed' AND room_id  IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS schedule_exceptions_date_idx  ON schedule_exceptions (on_date, kind);
CREATE INDEX IF NOT EXISTS schedule_exceptions_entry_idx ON schedule_exceptions (entry_id);
CREATE INDEX IF NOT EXISTS schedule_exceptions_room_idx  ON schedule_exceptions (room_id, on_date);

-- ---------------------------------------------------------------------------
-- 5f. Room bookings — a room taken by a member of staff, not by the timetable.
--
--     WHO. Booking is a PRIVILEGE, not something every visitor may do. It
--     belongs to the `agent` role: departmental staff, society officers, lab
--     technicians — whoever the office trusts to hold a room. A student sees
--     the bookings (they make the room busy) but cannot make one.
--
--     WHY A SEPARATE TABLE. A booking is not a class, so it does not belong in
--     `timetable_entries`; and it is not an administrator's correction to the
--     timetable, so it does not belong in `schedule_exceptions`. It is its own
--     thing, owned by the person who made it, who may take it back.
--
--     It still OCCUPIES THE ROOM. The availability calculator treats a booking
--     exactly like a class, so a booked room reads Occupied on the public
--     board — otherwise two people would turn up at the same door.
--
--     `status` reuses booking_status from the bus module. An agent's booking is
--     'confirmed' the moment it is made — the office has already vouched for
--     them by giving them the role — and cancelling sets 'cancelled' rather
--     than deleting, so there is a record of what was held and given back.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_bookings (
  id              SERIAL PRIMARY KEY,
  room_id         INTEGER  NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  booked_by_id    INTEGER  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  on_date         DATE     NOT NULL,
  start_minute    SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute      SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  purpose         VARCHAR(160),
  attendees       INTEGER CHECK (attendees > 0),
  status          booking_status NOT NULL DEFAULT 'confirmed',
  cancelled_by_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  cancel_reason   VARCHAR(280),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_bookings_time_order CHECK (end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS room_bookings_room_date_idx ON room_bookings (room_id, on_date, status);
CREATE INDEX IF NOT EXISTS room_bookings_owner_idx     ON room_bookings (booked_by_id, on_date DESC);

-- ---------------------------------------------------------------------------
-- 6. updated_at is maintained by the database, not by the application.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'vehicles', 'driver_profiles', 'transport_routes', 'ride_bookings',
    'buildings', 'rooms', 'batches', 'subjects', 'timetable_entries'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Quick check — run this after the script finishes:
--     SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' ORDER BY table_name;
-- You should see 17 tables.
-- ---------------------------------------------------------------------------
