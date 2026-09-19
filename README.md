# CampusPulse

CampusPulse is a university platform for public room availability, class timetables, room booking by authorized agents, and public school-transport information.

## Main features

- Public room availability calculated from the current day, time, weekly timetable, and schedule exceptions
- Four buildings with six floors and six rooms per floor
- Public batch-and-section timetables using six fixed university periods
- Excel-style timetable management for administrators
- Temporary cancellations, room moves, time changes, holidays, and closures
- Room booking for the `agent` role
- Public transport operator, phone, township connections, pickup nodes, maps, and monthly fees
- Administrator-managed transport ways
- Rotatable 3D building view with live room status

## Roles

- `admin`: manages campus rooms, timetables, exceptions, accounts, bookings, and transport ways
- `agent`: may reserve an available room for an allowed time window
- `user`: standard account; public room and transport pages do not require login

## Technology

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Express, TypeScript, Drizzle ORM
- Database: PostgreSQL
- Current hosting status: offline; the previous Vercel, Render, and Supabase projects are paused or deleted

## Current availability

CampusPulse is not currently published on the internet. The former public URLs
are inactive and should not be used. Run the frontend, backend, and PostgreSQL
database locally by following the instructions below.

## Local development

Install PostgreSQL and create a database named `campuspulse_db`. Create
`backend/.env` from `backend/.env.example`, then configure `DATABASE_URL`,
`JWT_SECRET`, and `SEED_PASSWORD`.

```bash
cd backend
npm install
npm run db:init
npm run dev
```

Open `http://localhost:5173`. The Vite development server forwards API calls
to the backend at `http://localhost:8000`.

The public pages do not require an account. The initial administrator and
agent accounts use the password configured in `SEED_PASSWORD`; change it from
the example value before sharing the system with other people.

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

## Validation

```bash
cd backend
npm run check
npm test

cd ../frontend
npm run check
npm run build
```

## Hosting later

No cloud provider configuration is active in this repository. If the platform
is published again, configure a PostgreSQL database, deploy the backend and
frontend, set their environment variables, and add the new verified URLs to
this README. Never commit database passwords or service credentials.
