// ===========================================================================
//  App.tsx — routing.
//
//  THE PUBLIC HALF IS THE DEFAULT. A visitor who has never logged in gets the
//  home page, the room finder, the buildings, the timetable and the bus — the
//  login screen is one route among many, not a gate in front of the site.
//
//  Only /me, /agent* and /admin* are guarded, and each redirects somewhere
//  useful rather than to a dead end.
//
//  Adding a future university service (announcements, library, lost & found)
//  means one more page and one more <Route> here.
// ===========================================================================

import { type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ErrorNote, Spinner } from "@/components/ui";
import type { Role } from "@/lib/api";

// ---- public ----
import Home from "@/pages/public/Home";
import FindRoom from "@/pages/public/FindRoom";
import Buildings from "@/pages/public/Buildings";
import RoomDetail from "@/pages/public/RoomDetail";
import Timetable from "@/pages/public/Timetable";
import Bus from "@/pages/public/Bus";

// ---- accounts ----
import Login from "@/pages/Login";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/NotFound";

// ---- agents who may hold a room ----
import MyBookings from "@/pages/agent/MyBookings";

// ---- administrator transport management ----
import BusConsole from "@/pages/driver/BusConsole";
import RouteEditor from "@/pages/driver/RouteEditor";

// ---- administrator ----
import AdminOverview from "@/pages/admin/Overview";
import TimetableManager from "@/pages/admin/TimetableManager";
import Campus from "@/pages/admin/Campus";
import Changes from "@/pages/admin/Changes";
import AdminPeople from "@/pages/admin/People";

/** Renders a page only for the roles allowed to see it. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  // Not signed in at all: the login screen, not a blank page.
  if (!user) return <Redirect to="/login" />;
  // Signed in as somebody else: back to the public home rather than an error.
  if (!roles.includes(user.role)) return <Redirect to="/" />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading, error, refresh } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner label="Starting CampusPulse…" />
      </div>
    );
  }

  return (
    <AppShell>
      {/* The server being unreachable is shown once, at the top, rather than
          on every card of every screen. */}
      {error ? (
        <div className="mb-4">
          <ErrorNote message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}

      <Switch>
        {/* ---------------- public: no account needed ---------------- */}
        <Route path="/" component={Home} />
        <Route path="/find" component={FindRoom} />
        <Route path="/buildings" component={Buildings} />
        <Route path="/rooms/:roomNumber" component={RoomDetail} />
        <Route path="/timetable" component={Timetable} />
        <Route path="/bus" component={Bus} />

        {/* ---------------- accounts ---------------- */}
        <Route path="/login">{user ? <Redirect to="/" /> : <Login />}</Route>
        <Route path="/profile">
          <Guard roles={["user", "admin", "agent"]}>
            <Profile />
          </Guard>
        </Route>

        {/* ---------------- room booking (agents + office) ---------------- */}
        <Route path="/agent">
          <Guard roles={["agent", "admin"]}>
            <MyBookings />
          </Guard>
        </Route>

        <Route path="/bookings"><Redirect to="/agent" /></Route>

        {/* ---------------- bus management (administrator) ---------------- */}
        <Route path="/admin/bus">
          <Guard roles={["admin"]}>
            <BusConsole />
          </Guard>
        </Route>
        <Route path="/admin/bus/route">
          <Guard roles={["admin"]}>
            <RouteEditor />
          </Guard>
        </Route>

        {/* ---------------- administrator ---------------- */}
        <Route path="/admin">
          <Guard roles={["admin"]}>
            <AdminOverview />
          </Guard>
        </Route>
        <Route path="/admin/timetable">
          <Guard roles={["admin"]}>
            <TimetableManager />
          </Guard>
        </Route>
        <Route path="/admin/campus">
          <Guard roles={["admin"]}>
            <Campus />
          </Guard>
        </Route>
        <Route path="/admin/changes">
          <Guard roles={["admin"]}>
            <Changes />
          </Guard>
        </Route>
        <Route path="/admin/people">
          <Guard roles={["admin"]}>
            <AdminPeople />
          </Guard>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}
