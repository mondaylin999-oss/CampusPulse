-- ===========================================================================
--  CampusPulse — start over.
--  Drops every table and type this platform owns so database/schema.sql can be
--  run again on a clean database. THIS DELETES ALL DATA.
--
--      psql -U postgres -d campuspulse_db -f database/reset.sql
--      psql -U postgres -d campuspulse_db -f database/schema.sql
-- ===========================================================================
BEGIN;

DROP TABLE IF EXISTS room_bookings       CASCADE;
DROP TABLE IF EXISTS schedule_exceptions CASCADE;
DROP TABLE IF EXISTS timetable_entries   CASCADE;
DROP TABLE IF EXISTS subjects            CASCADE;
DROP TABLE IF EXISTS batches             CASCADE;
DROP TABLE IF EXISTS rooms               CASCADE;
DROP TABLE IF EXISTS floors              CASCADE;
DROP TABLE IF EXISTS buildings           CASCADE;

DROP TABLE IF EXISTS vehicle_maintenance CASCADE;
DROP TABLE IF EXISTS ride_bookings       CASCADE;
DROP TABLE IF EXISTS route_map_nodes     CASCADE;
DROP TABLE IF EXISTS route_stops         CASCADE;
DROP TABLE IF EXISTS transport_routes    CASCADE;
DROP TABLE IF EXISTS driver_profiles     CASCADE;
DROP TABLE IF EXISTS vehicles            CASCADE;
DROP TABLE IF EXISTS driver_applications CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

DROP TYPE IF EXISTS exception_kind      CASCADE;
DROP TYPE IF EXISTS room_kind           CASCADE;
DROP TYPE IF EXISTS application_status  CASCADE;
DROP TYPE IF EXISTS booking_status      CASCADE;
DROP TYPE IF EXISTS driver_availability CASCADE;
DROP TYPE IF EXISTS route_status        CASCADE;
DROP TYPE IF EXISTS maintenance_status  CASCADE;
DROP TYPE IF EXISTS maintenance_flag    CASCADE;
DROP TYPE IF EXISTS vehicle_status      CASCADE;
DROP TYPE IF EXISTS account_status      CASCADE;
DROP TYPE IF EXISTS user_role           CASCADE;

COMMIT;
