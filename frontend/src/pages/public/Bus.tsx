import { useState } from "react";
import { ChevronDown, MapPin, Phone, UserRound } from "lucide-react";
import { api, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Card, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/ui";

type Payload = { months: string[]; roads: RoadRow[] };

function majorNodes(road: RoadRow) {
  const nodes = [road.route.startPoint];
  if (!/(school|university|main gate)/i.test(road.route.destination)) nodes.push(road.route.destination);
  nodes.push("School");
  return [...new Set(nodes.map(node => node.trim()).filter(Boolean))];
}

export default function Bus() {
  const { data, loading, error, refresh } = useApiData<Payload>(() => api.get<Payload>("/transport/public/roads"), [], { pollMs: 60_000 });
  const [open, setOpen] = useState<Set<number>>(new Set());
  const roads = data?.roads ?? [];

  return <div className="space-y-stack-md">
    <PageHeader title="School bus" subtitle="Choose the township connection that meets your journey." />
    {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
    {loading && !data ? <Spinner label="Loading transport ways…" /> : null}
    {data && !roads.length ? <EmptyState title="No transport ways yet" description="The university has not published a transport way." /> : null}

    <div className="grid gap-3">
      {roads.map(road => {
        const expanded = open.has(road.route.id);
        const connection = majorNodes(road);
        return <Card key={road.route.id} accent="bus">
          <button type="button" className="flex w-full items-center justify-between gap-4 text-left" aria-expanded={expanded} onClick={() => setOpen(current => {
            const next = new Set(current); if (next.has(road.route.id)) next.delete(road.route.id); else next.add(road.route.id); return next;
          })}>
            <span>
              <span className="block text-[17px] font-bold text-on-surface">{connection.join(" → ")}</span>
              <span className="mt-1 block text-[12px] text-on-surface-variant">Tap to {expanded ? "hide" : "see"} contact, pickup nodes, fee and route</span>
            </span>
            <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>

          {expanded ? <div className="mt-4 grid gap-4 border-t border-outline-variant pt-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid gap-3 rounded-lg border border-outline-variant p-3 text-[14px]">
                <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-tertiary" /><span className="font-semibold">{road.driverName ?? "University transport office"}</span></p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-tertiary" /><span className="tabular font-semibold">{road.driverPhone ?? "Contact number not published"}</span></p>
                <p><span className="text-on-surface-variant">Fee per month:</span> <span className="tabular font-bold">{kyats(road.route.fareCents)}</span></p>
              </div>
              <div><p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">Pickup nodes</p><ol className="mt-1 space-y-1">{road.stops.map(stop => <li key={stop.id} className="flex items-center gap-2 text-[13px]"><MapPin className="h-3.5 w-3.5 text-tertiary" />{stop.name}</li>)}</ol></div>
            </div>
            <div className="min-h-[240px]"><RouteMap nodes={road.mapNodes} color={road.route.routeLineColor} /></div>
          </div> : null}
        </Card>;
      })}
    </div>
  </div>;
}