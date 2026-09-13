// ===========================================================================
//  admin/Overview.tsx — what the office needs to see first thing.
//
//  Two things need answering at a glance: is the campus board healthy (are the
//  rooms and the timetable actually there), and is anybody waiting on us —
//  which in this platform means a driver permission request.
// ===========================================================================

import { Link } from "wouter";
import { Building2, CalendarClock, DoorOpen, Users } from "lucide-react";
import { api, type CampusPulseSummary, type DriverApplicationRow, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

export default function AdminOverview() {
  const { health } = useAuth();
  const pulse = useApiData<CampusPulseSummary>(() => api.get("/rooms/pulse"), [], { pollMs: 60_000 });
  const timetable = useApiData<{ entries: TimetableRow[] }>(() => api.get("/admin/timetable"), []);
  const applications = useApiData<{ applications: DriverApplicationRow[] }>(() => api.get("/admin/driver-applications", { status: "pending" }), []);

  const waiting = applications.data?.applications ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader title="University office" subtitle={health ? `${health.campusTime} · ${health.timezone}` : "Connecting…"} />

      {pulse.error ? <ErrorNote message={pulse.error} onRetry={() => void pulse.refresh()} /> : null}
      {pulse.loading && !pulse.data ? <Spinner /> : null}

      {waiting.length ? (
        <Notice tone="warning">
          <span className="flex flex-wrap items-center gap-2">
            {waiting.length} driver permission request{waiting.length === 1 ? "" : "s"} waiting —
            <Link href="/admin/people" className="font-bold underline">
              decide now
            </Link>
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Rooms available now" value={pulse.data?.available ?? "—"} tone="rooms" icon={<DoorOpen className="h-4 w-4" />} />
        <StatTile label="Rooms occupied now" value={pulse.data?.occupied ?? "—"} tone="error" icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Rooms on the system" value={pulse.data?.total ?? "—"} hint="4 buildings × 6 floors × 6 rooms" />
        <StatTile
          label="Weekly sessions"
          value={timetable.data?.entries.length ?? "—"}
          tone="bus"
          icon={<CalendarClock className="h-4 w-4" />}
          hint="Rows in the timetable"
        />
      </div>

      {pulse.data?.holiday ? <Notice tone="warning">Today is marked a holiday — {pulse.data.holiday.reason}.</Notice> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Jump to" subtitle="The things the office edits.">
          <ul className="space-y-2">
            {[
              { href: "/admin/timetable", label: "Timetable manager", hint: "Add, edit and search weekly sessions", icon: <CalendarClock className="h-4 w-4" /> },
              { href: "/admin/changes", label: "Timetable changes", hint: "Cancel, move, retime, holidays, closures", icon: <DoorOpen className="h-4 w-4" /> },
              { href: "/admin/campus", label: "Campus & rooms", hint: "Buildings, floors, rooms, batches, subjects", icon: <Building2 className="h-4 w-4" /> },
              { href: "/admin/people", label: "People & drivers", hint: "Accounts and driver permission", icon: <Users className="h-4 w-4" /> },
            ].map(item => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center gap-3 rounded-lg border border-outline-variant px-3 py-2.5 hover:bg-surface-container-low">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-high text-on-surface">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-on-surface">{item.label}</span>
                    <span className="block truncate text-[12px] text-on-surface-variant">{item.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Waiting on the office" subtitle="Driver permission requests.">
          {applications.loading && !applications.data ? <Spinner /> : null}
          {waiting.length ? (
            <ul className="space-y-2">
              {waiting.map(row => (
                <li key={row.application.id} className="rounded-lg border border-warning/50 px-3 py-2.5">
                  <p className="text-[14px] font-semibold text-on-surface">{row.applicantName ?? row.applicantUsername}</p>
                  <p className="text-[12px] text-on-surface-variant">
                    {row.application.plateNumber ?? "no plate given"} · {row.application.totalSeats ?? "?"} seats · {row.application.phone ?? "no phone"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing waiting" description="No driver permission requests are open." />
          )}
        </Card>
      </div>
    </div>
  );
}
