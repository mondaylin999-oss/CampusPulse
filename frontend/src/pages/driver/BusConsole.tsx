import { useEffect, useState, type FormEvent } from "react";
import { Bus, Save } from "lucide-react";
import { api, ApiError, type DriverDashboard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Spinner, Textarea } from "@/components/ui";

export default function BusConsole() {
  const dashboard = useApiData<DriverDashboard>(() => api.get("/transport/driver/dashboard"), [], { pollMs: 30_000 });
  const [phone, setPhone] = useState("");
  const [routeDrafts, setRouteDrafts] = useState<Record<number, { name: string; startPoint: string; destination: string; stops: string; fare: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "bus" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!dashboard.data) return;
    setPhone(dashboard.data.profile?.profile.phone ?? "");
    setRouteDrafts(Object.fromEntries(dashboard.data.routes.map(row => [row.route.id, { name: row.route.name, startPoint: row.route.startPoint, destination: row.route.destination, stops: row.stops.map(stop => stop.name).join("\n"), fare: String(row.route.fareCents) }])));
  }, [dashboard.data]);

  async function run(key: string, action: () => Promise<unknown>, text: string) {
    setBusy(key); setMessage(null);
    try { await action(); setMessage({ tone: "bus", text }); await dashboard.refresh(); }
    catch (caught) { setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save." }); }
    finally { setBusy(null); }
  }

  if (dashboard.loading && !dashboard.data) return <Spinner label="Loading transport details…" />;
  if (dashboard.error) return <ErrorNote message={dashboard.error} onRetry={() => void dashboard.refresh()} />;
  if (!dashboard.data) return null;
  const data = dashboard.data;

  return <div className="space-y-stack-md">
    <PageHeader title="Bus Management" subtitle="Manage only the information shown to students." />
    {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    <Card title="Transport contact" accent="bus">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void run("contact", () => api.patch("/transport/driver/profile", { phone: phone.trim() }), "Contact phone saved."); }}>
        <Field label="Operator name"><Input value={data.profile?.user.name ?? "University transport office"} readOnly /></Field>
        <Field label="Contact phone"><Input value={phone} onChange={event => setPhone(event.target.value)} required /></Field>
        <div className="sm:col-span-2"><Button type="submit" variant="bus" busy={busy === "contact"}><Save className="h-4 w-4" /> Save contact</Button></div>
      </form>
    </Card>
    {data.routes.length ? data.routes.map(row => {
      const draft = routeDrafts[row.route.id]; if (!draft) return null;
      return <Card key={row.route.id} title={row.route.name} subtitle={`Current monthly fee: ${kyats(row.route.fareCents)}`} accent="bus">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); void run(`route-${row.route.id}`, () => api.patch(`/transport/driver/routes/${row.route.id}`, { name: draft.name.trim(), startPoint: draft.startPoint.trim(), destination: draft.destination.trim(), stops: draft.stops.split("\n").map(value => value.trim()).filter(Boolean), fareCents: Math.round(Number(draft.fare)) }), "Transport way and monthly fee saved."); }}>
          <Field label="Transport way / route name"><Input value={draft.name} onChange={event => setRouteDrafts({ ...routeDrafts, [row.route.id]: { ...draft, name: event.target.value } })} /></Field>
          <Field label="Fee per month (kyat)"><Input type="number" min={1} value={draft.fare} onChange={event => setRouteDrafts({ ...routeDrafts, [row.route.id]: { ...draft, fare: event.target.value } })} /></Field>
          <Field label="From"><Input value={draft.startPoint} onChange={event => setRouteDrafts({ ...routeDrafts, [row.route.id]: { ...draft, startPoint: event.target.value } })} /></Field>
          <Field label="To"><Input value={draft.destination} onChange={event => setRouteDrafts({ ...routeDrafts, [row.route.id]: { ...draft, destination: event.target.value } })} /></Field>
          <Field label="Transport stops" className="sm:col-span-2"><Textarea rows={5} value={draft.stops} onChange={event => setRouteDrafts({ ...routeDrafts, [row.route.id]: { ...draft, stops: event.target.value } })} /></Field>
          <div className="sm:col-span-2"><Button type="submit" variant="bus" busy={busy === `route-${row.route.id}`}><Bus className="h-4 w-4" /> Save transport details</Button></div>
        </form>
      </Card>;
    }) : <EmptyState title="No transport way added" description="Add the first transport route from Route & Map." />}
  </div>;
}