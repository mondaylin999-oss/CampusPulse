// ===========================================================================
//  student/Me.tsx — "my things": the bus seats I hold, and the one thing a
//  student can ask the university for — permission to run a school bus.
//
//  DRIVER PERMISSION COMES FROM THE ADMINISTRATOR. Asking is all that happens
//  here: the request goes into the office's queue, and until somebody there
//  approves it the account stays an ordinary student account.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { BadgeCheck, Bus, Clock, Send, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Input, Notice, PageHeader, Spinner, Textarea } from "@/components/ui";
import MySeat from "@/pages/student/MySeat";

type Application = {
  id: number;
  phone: string | null;
  licenseNumber: string | null;
  plateNumber: string | null;
  totalSeats: number | null;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export default function Me() {
  return (
    <div className="space-y-stack-lg">
      <MySeat />
      <DriverPermission />
    </div>
  );
}

function DriverPermission() {
  const { user, refresh: refreshSession } = useAuth();
  const { data, loading, error, refresh } = useApiData<{ applications: Application[] }>(() => api.get("/transport/driver-applications/mine"), []);

  const [form, setForm] = useState({ phone: "", licenseNumber: "", plateNumber: "", totalSeats: "30", message: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  if (!user || user.role !== "user") return null;

  const applications = data?.applications ?? [];
  const open = applications.find(row => row.status === "pending");
  const latest = applications[0];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api.post("/transport/driver-applications", {
        phone: form.phone.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
        plateNumber: form.plateNumber.trim() || undefined,
        totalSeats: form.totalSeats ? Math.round(Number(form.totalSeats)) : undefined,
        message: form.message.trim() || undefined,
      });
      setNote({ tone: "rooms", text: "Your request is with the university office. You will see the answer here." });
      await refresh();
      // The role may change the moment the office approves, so re-read it.
      await refreshSession();
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not send the request." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-stack-md">
      <PageHeader title="Run a school bus" subtitle="Drivers are approved by the university office." />

      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner /> : null}
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {/* ---------- where my request stands ---------- */}
      {latest ? (
        <Card
          title="Your request"
          subtitle={`Sent ${dateTime(latest.createdAt)}`}
          actions={
            <Badge tone={latest.status === "approved" ? "rooms" : latest.status === "rejected" ? "error" : "warning"}>
              {latest.status === "approved" ? "Approved" : latest.status === "rejected" ? "Not approved" : "Waiting for the office"}
            </Badge>
          }
        >
          <ul className="space-y-1 text-[13px] text-on-surface-variant">
            {latest.plateNumber ? (
              <li className="flex items-center gap-2">
                <Bus className="h-4 w-4" /> {latest.plateNumber} · {latest.totalSeats ?? "?"} seats
              </li>
            ) : null}
            {latest.status === "pending" ? (
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> Nothing more to do — the office decides.
              </li>
            ) : null}
            {latest.status === "approved" ? (
              <li className="flex items-center gap-2 text-secondary">
                <BadgeCheck className="h-4 w-4" /> Approved{latest.decidedAt ? ` on ${dateTime(latest.decidedAt)}` : ""}. Log out and back in to open the driver screens.
              </li>
            ) : null}
            {latest.status === "rejected" ? (
              <li className="flex items-center gap-2 text-error">
                <XCircle className="h-4 w-4" /> {latest.decisionNote ?? "The office did not approve this request."}
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      {/* ---------- ask ---------- */}
      {!open ? (
        <Card title="Ask for driver permission" subtitle="Tell the office about you and your bus. They will approve or refuse it." accent="bus">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <Field label="Phone number" hint="Students ring this number to arrange the fare.">
              <Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="09-750000000" />
            </Field>
            <Field label="Driving licence number">
              <Input value={form.licenseNumber} onChange={event => setForm({ ...form, licenseNumber: event.target.value })} placeholder="DL-000000" />
            </Field>
            <Field label="Bus plate number">
              <Input value={form.plateNumber} onChange={event => setForm({ ...form, plateNumber: event.target.value })} placeholder="1A-2345" />
            </Field>
            <Field label="Seats on the bus">
              <Input type="number" min={1} max={200} value={form.totalSeats} onChange={event => setForm({ ...form, totalSeats: event.target.value })} />
            </Field>
            <Field label="Anything else the office should know" className="sm:col-span-2">
              <Textarea value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} placeholder="Which part of town you can cover, when you can start…" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="bus" busy={busy}>
                <Send className="h-4 w-4" /> Send to the office
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </section>
  );
}
