# Supabase database

CampusPulse uses Supabase as hosted PostgreSQL. The source of truth remains
[`database/schema.sql`](../database/schema.sql); the Render start command runs
it automatically before starting the API through `npm run db:init`. The SQL
is idempotent, so this both creates a blank database and safely adds later
schema changes. This placement works on Render's free service, where the
dedicated pre-deploy command is unavailable.

Use Supabase's **Session pooler** connection string for Render. It works over
IPv4 and is intended for persistent application servers. Store it only in the
Render `DATABASE_URL` environment variable; never commit it.

The browser never connects to Supabase directly. All public and protected
access goes through the Render API, so no Supabase anon key is needed in the
Vercel frontend.
