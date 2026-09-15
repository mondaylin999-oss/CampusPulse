// ===========================================================================
//  Bus.tsx — the school bus, for everybody.
//
//  This public directory intentionally stays small: operator, phone, route
//  and monthly fee. Registration and seat availability belong to the office.
// ===========================================================================

import { MapPin, Phone, UserRound } from "lucide-react";
import { api, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Card, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/ui";

type Payload = { months: string[]; roads: RoadRow[] };

export default function Bus() {
  return <PublicBus />;
}

function PublicBus() {
  const { data, loading, error, refresh } = useApiData<Payload>(() => api.get<Payload>("/transport/public/roads"), [], { pollMs: 60_000 });

  const roads = data?.roads ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader title="School bus" subtitle="Driver contacts, transport routes and monthly fees." />

      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner label="Loading the routes…" /> : null}

      {data && !roads.length ? <EmptyState title="No bus routes yet" description="The office has not published a school bus route." /> : null}

      {roads.map(road => {
        return (
          <Card
            key={road.route.id}
            accent="bus"
            title={road.route.name}
            subtitle={`${road.route.startPoint} → ${road.route.destination}`}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="grid gap-3 rounded-lg border border-outline-variant p-3 text-[14px]">
                  <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-tertiary" /><span className="font-semibold">{road.driverName ?? "University transport office"}</span></p>
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-tertiary" /><span className="tabular font-semibold">{road.driverPhone ?? "Contact number not published"}</span></p>
                  <p><span className="text-on-surface-variant">Fee per month:</span> <span className="tabular font-bold text-on-surface">{kyats(road.route.fareCents)}</span></p>
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
