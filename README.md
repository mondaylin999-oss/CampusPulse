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
- Database: PostgreSQL / Supabase
- Hosting: Vercel frontend and Render backend

## Local development

Create `backend/.env` from `backend/.env.example`, then configure `DATABASE_URL`, `JWT_SECRET`, and `SEED_PASSWORD`.

```bash
cd backend
npm install
npm run db:init
npm run dev
```

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

## Public deployment

- Public site: https://campuspulse-ruddy.vercel.app
- Admin: https://campuspulse-ruddy.vercel.app/admin
- Agent: https://campuspulse-ruddy.vercel.app/agent