// ===========================================================================
//  Bus.tsx — the school bus, for everybody.
//
//  A visitor with no account sees the routes, the stops, the two departure
//  times and how many seats are left this month — the same information they
//  would get by asking at the office. Only TAKING a seat needs an account,
//  because a seat belongs to somebody, so a signed-in student is handed the
//  existing booking screen instead (pages/student/BusSeats.tsx, carried over
//  from the school-bus system unchanged).
// ===========================================================================

import { Link } from "wouter";
import { Bus as BusIcon, Clock, LogIn, MapPin, Phone, Users } from "lucide-react";
import { api, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { kyats, monthName } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Badge, Card, EmptyState, ErrorNote, LoadBar, Notice, PageHeader, Spinner } from "@/components/ui";
import BusSeats from "@/pages/student/BusSeats";

type Payload = { months: string[]; roads: RoadRow[] };

export default function Bus() {
  const { user } = useAuth();

  // A signed-in student gets the full booking screen — same component, same
  // endpoints, same rules as the original bus app.
  if (user?.role === "user") return <BusSeats />;

  return <PublicBus />;
}

function PublicBus() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useApiData<Payload>(() => api.get<Payload>("/transport/public/roads"), [], { pollMs: 60_000 });

  const roads = data?.roads ?? [];
  const thisMonth = data?.months[0] ?? "";

  return (
    <div className="space-y-stack-md">
      <PageHeader title="School bus" subtitle="Routes, stops and departure times. No account needed to look." />

      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner label="Loading the routes…" /> : null}

      {!user ? (
        <Notice tone="bus">
          <span className="flex flex-wrap items-center gap-2">
            Seats are sold by the calendar month. To take one you need a student account —
            <Link href="/login" className="inline-flex items-center gap-1 font-bold underline">
              <LogIn className="h-3.5 w-3.5" /> log in or register
            </Link>
          </span>
        </Notice>
      ) : null}

      {data && !roads.length ? <EmptyState title="No bus routes yet" description="The office has not published a school bus route." /> : null}

      {roads.map(road => {
        const month = road.months.find(row => row.month === thisMonth) ?? road.months[0];
        return (
          <Card
            key={road.route.id}
            accent="bus"
            title={road.route.name}
            subtitle={`${road.route.startPoint} → ${road.route.destination}`}
            actions={<Badge tone={road.route.status === "active" ? "bus" : "error"}>{road.route.status === "active" ? "Running" : "Not running"}</Badge>}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-on-surface-variant">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span className="tabular font-semibold text-on-surface">{road.route.morningTime}</span> morning
                  </span>
                  {road.route.eveningTime ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span className="tabular font-semibold text-on-surface">{road.route.eveningTime}</span> evening
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <BusIcon className="h-4 w-4" />
                    {road.vehiclePlate ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {road.vehicleSeats ?? 0} seats
                  </span>
                </div>

                <div>
                  <p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">Stops</p>
                  <ol className="mt-1 space-y-1">
                    {road.stops.map(stop => (
                      <li key={stop.id} className="flex items-center gap-2 text-[13px] text-on-surface">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                        {stop.name}
                      </li>
                    ))}
                  </ol>
                </div>

                {month ? (
                  <div className="rounded-lg border border-outline-variant px-3 py-2.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-semibold text-on-surface">{monthName(month.month)}</span>
                      <span className="tabular text-on-surface-variant">
                        {month.availableSeats} of {month.totalSeats} free
                      </span>
                    </div>
                    <div className="mt-2">
                      <LoadBar percent={month.loadPercent} />
                    </div>
                    <p className="mt-2 text-[13px] text-on-surface-variant">
                      Monthly fare <span className="tabular font-semibold text-on-surface">{kyats(road.route.fareCents)}</span>
                      {road.driverPhone ? (
                        <>
                          {" · "}
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" /> {road.driverName} {road.driverPhone}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* The route map is the same component the driver publishes with. */}
              <div className="min-h-[240px]">
                <RouteMap nodes={road.mapNodes} color={road.route.routeLineColor} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
