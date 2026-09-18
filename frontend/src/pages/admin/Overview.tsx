// ===========================================================================
//  admin/Overview.tsx — what the office needs to see first thing.
//
//  Two things need answering at a glance: is the campus board healthy (are the
//  rooms and the timetable actually there), with direct links to office tools.
// ===========================================================================

import { Link } from "wouter";
import { Building2, CalendarClock, DoorOpen, Users } from "lucide-react";
import { api, type CampusPulseSummary, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { Card, ErrorNote, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

export default function AdminOverview() {
  const { health } = useAuth();
  const pulse = useApiData<CampusPulseSummary>(() => api.get("/rooms/pulse"), [], { pollMs: 60_000 });
  const timetable = useApiData<{ entries: TimetableRow[] }>(() => api.get("/admin/timetable"), []);

  return (
    <div className="space-y-stack-md">
      <PageHeader title="University Office" subtitle={health ? `${health.campusTime} · ${health.timezone}` : "Connecting…"} />

      {pulse.error ? <ErrorNote message={pulse.error} onRetry={() => void pulse.refresh()} /> : null}
      {pulse.loading && !pulse.data ? <Spinner /> : null}

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
              { href: "/admin/people", label: "People & Agents", hint: "Manage accounts and agents", icon: <Users className="h-4 w-4" /> },
              { href: "/admin/bus/route", label: "Transport ways", hint: "Add and update school bus routes", icon: <Users className="h-4 w-4" /> },
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

      </div>
    </div>
  );
}
