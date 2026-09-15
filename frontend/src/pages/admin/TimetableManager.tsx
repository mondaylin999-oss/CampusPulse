// ===========================================================================
//  admin/TimetableManager.tsx — where the weekly timetable is actually typed.
//
//  This is the ONE place the room board's data comes from, so the form works
//  hard to stop a bad row getting in:
//
//    * the room, day and times are checked against everything already booked
//      BEFORE Save is pressed (POST /admin/timetable/check), so a clash is a
//      sentence in the form rather than a refusal afterwards
//    * the same check runs again on the server when saving — the browser is
//      never the thing that decides
// ===========================================================================

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { api, ApiError, DAY_NAMES, type AdminRoom, type BatchRow, type SubjectRow, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";

type FormState = {
  id: number | null;
  roomId: string;
  batchId: string;
  subjectId: string;
  title: string;
  teacher: string;
  dayOfWeek: string;
  startMinute: string;
  endMinute: string;
  effectiveFrom: string;
  effectiveTo: string;
};

const PERIODS = [
  { label: "Period 1 · 8:30–9:30", start: "08:30", end: "09:30" },
  { label: "Period 2 · 9:40–10:40", start: "09:40", end: "10:40" },
  { label: "Period 3 · 10:50–11:50", start: "10:50", end: "11:50" },
  { label: "Period 4 · 12:40–1:40", start: "12:40", end: "13:40" },
  { label: "Period 5 · 1:50–2:50", start: "13:50", end: "14:50" },
  { label: "Period 6 · 3:00–4:00", start: "15:00", end: "16:00" },
] as const;

const EMPTY: FormState = {
  id: null,
  roomId: "",
  batchId: "",
  subjectId: "",
  title: "",
  teacher: "",
  dayOfWeek: "1",
  startMinute: "08:30",
  endMinute: "09:30",
  effectiveFrom: "",
  effectiveTo: "",
};

export default function TimetableManager() {
  const campus = useApiData<{ rooms: AdminRoom[] }>(() => api.get("/admin/campus"), []);
  const academics = useApiData<{ batches: BatchRow[]; subjects: SubjectRow[] }>(() => api.get("/admin/academics"), []);

  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const entries = useApiData<{ entries: TimetableRow[] }>(
    () => api.get("/admin/timetable", { search: search.trim() || undefined, dayOfWeek: day || undefined }),
    [search, day],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "rooms" | "error" | "warning"; text: string } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const rooms = campus.data?.rooms ?? [];
  const batches = academics.data?.batches ?? [];
  const subjects = academics.data?.subjects ?? [];
  const selectedPeriod = `${form.startMinute}-${form.endMinute}`;

  // ---- live conflict check -------------------------------------------------
  // Re-asked whenever the four fields that can clash change. Debounced, so
  // typing a time does not fire a request per keystroke.
  const probe = useMemo(
    () => ({ roomId: form.roomId, batchId: form.batchId, dayOfWeek: form.dayOfWeek, start: form.startMinute, end: form.endMinute, id: form.id }),
    [form.roomId, form.batchId, form.dayOfWeek, form.startMinute, form.endMinute, form.id],
  );

  useEffect(() => {
    if (!probe.roomId) {
      setConflict(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.post<{ clash: boolean; message: string }>("/admin/timetable/check", {
          roomId: Number(probe.roomId),
          batchId: probe.batchId ? Number(probe.batchId) : null,
          dayOfWeek: Number(probe.dayOfWeek),
          startMinute: probe.start,
          endMinute: probe.end,
          ignoreId: probe.id ?? undefined,
        });
        setConflict(result.clash ? result.message : null);
      } catch {
        setConflict(null); // a failed check must never block the form
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [probe]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.roomId) {
      setNote({ tone: "error", text: "Choose a room." });
      return;
    }
    setBusy(true);
    setNote(null);
    const body = {
      roomId: Number(form.roomId),
      batchId: form.batchId ? Number(form.batchId) : null,
      subjectId: form.subjectId ? Number(form.subjectId) : null,
      title: form.title.trim() || null,
      teacher: form.teacher.trim() || null,
      dayOfWeek: Number(form.dayOfWeek),
      startMinute: form.startMinute,
      endMinute: form.endMinute,
      effectiveFrom: form.effectiveFrom || null,
      effectiveTo: form.effectiveTo || null,
    };
    try {
      if (form.id) await api.patch(`/admin/timetable/${form.id}`, body);
      else await api.post("/admin/timetable", body);
      setNote({ tone: "rooms", text: form.id ? "Session updated." : "Session added to the timetable." });
      setForm(EMPTY);
      await entries.refresh();
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const edit = (row: TimetableRow) =>
    setForm({
      id: row.entry.id,
      roomId: String(row.entry.roomId),
      batchId: row.entry.batchId ? String(row.entry.batchId) : "",
      subjectId: row.entry.subjectId ? String(row.entry.subjectId) : "",
      title: row.entry.title ?? "",
      teacher: row.entry.teacher ?? "",
      dayOfWeek: String(row.entry.dayOfWeek),
      startMinute: row.startTime,
      endMinute: row.endTime,
      effectiveFrom: row.entry.effectiveFrom ?? "",
      effectiveTo: row.entry.effectiveTo ?? "",
    });

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await api.delete(`/admin/timetable/${id}`);
      if (form.id === id) setForm(EMPTY);
      await entries.refresh();
      setNote({ tone: "rooms", text: "Session removed." });
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not delete." });
    } finally {
      setBusy(false);
    }
  };

  const rows = entries.data?.entries ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Timetable manager"
        subtitle="One row per weekly session. The public room board is calculated from exactly these rows."
        actions={form.id ? <Button variant="ghost" onClick={() => setForm(EMPTY)}><X className="h-4 w-4" /> Cancel edit</Button> : null}
      />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {/* ---------- the form ---------- */}
      <Card title={form.id ? `Edit session #${form.id}` : "Add a session"} accent={form.id ? "warning" : "rooms"}>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={save}>
          <Field label="Room">
            <Select value={form.roomId} onChange={event => setForm({ ...form, roomId: event.target.value })} required>
              <option value="">Choose a room…</option>
              {rooms.map(row => (
                <option key={row.room.id} value={row.room.id}>
                  {row.room.roomNumber} — {row.buildingName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Day">
            <Select value={form.dayOfWeek} onChange={event => setForm({ ...form, dayOfWeek: event.target.value })}>
              {DAY_NAMES.slice(1).map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Class / batch">
            <Select value={form.batchId} onChange={event => setForm({ ...form, batchId: event.target.value })}>
              <option value="">No batch</option>
              {batches.map(row => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Class period" hint="The timetable has six fixed one-hour periods.">
            <Select
              value={selectedPeriod}
              onChange={event => {
                const period = PERIODS.find(row => `${row.start}-${row.end}` === event.target.value);
                if (period) setForm({ ...form, startMinute: period.start, endMinute: period.end });
              }}
              required
            >
              {!PERIODS.some(row => `${row.start}-${row.end}` === selectedPeriod) ? <option value={selectedPeriod}>{form.startMinute}–{form.endMinute} (legacy)</option> : null}
              {PERIODS.map(period => <option key={period.label} value={`${period.start}-${period.end}`}>{period.label}</option>)}
            </Select>
          </Field>

          <Field label="Subject">
            <Select value={form.subjectId} onChange={event => setForm({ ...form, subjectId: event.target.value })}>
              <option value="">No subject</option>
              {subjects.map(row => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Title" hint="Used when there is no subject row — e.g. “Department meeting”.">
            <Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
          </Field>

          <Field label="Teacher">
            <Input value={form.teacher} onChange={event => setForm({ ...form, teacher: event.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Term from">
              <Input type="date" value={form.effectiveFrom} onChange={event => setForm({ ...form, effectiveFrom: event.target.value })} />
            </Field>
            <Field label="Term to">
              <Input type="date" value={form.effectiveTo} onChange={event => setForm({ ...form, effectiveTo: event.target.value })} />
            </Field>
          </div>

          {conflict ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Notice tone="error">{conflict}</Notice>
            </div>
          ) : null}

          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" busy={busy} disabled={Boolean(conflict)}>
              {form.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {form.id ? "Save changes" : "Add session"}
            </Button>
          </div>
        </form>
      </Card>

      {/* ---------- the list ---------- */}
      <Card
        title="Sessions"
        subtitle={`${rows.length} row${rows.length === 1 ? "" : "s"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <Input className="h-9 w-48 pl-9" placeholder="Room, batch, teacher…" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
            <Select className="h-9 w-36" value={day} onChange={event => setDay(event.target.value)}>
              <option value="">Every day</option>
              {DAY_NAMES.slice(1).map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {entries.error ? <ErrorNote message={entries.error} onRetry={() => void entries.refresh()} /> : null}
        {entries.loading && !entries.data ? <Spinner /> : null}

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Term</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.entry.id}>
                    <td className="tabular font-semibold">{row.roomNumber}</td>
                    <td>{DAY_NAMES[row.entry.dayOfWeek]}</td>
                    <td className="tabular">
                      {row.startTime}–{row.endTime}
                    </td>
                    <td>{row.batchName ?? "—"}</td>
                    <td>{row.subjectName ?? row.entry.title ?? "—"}</td>
                    <td>{row.entry.teacher ?? "—"}</td>
                    <td className="text-[12px] text-on-surface-variant">
                      {row.entry.effectiveFrom || row.entry.effectiveTo ? `${row.entry.effectiveFrom ?? "…"} → ${row.entry.effectiveTo ?? "…"}` : <Badge>All terms</Badge>}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button className="rounded p-2 text-on-surface-variant hover:bg-surface-container-high" onClick={() => edit(row)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="rounded p-2 text-error hover:bg-error-container" onClick={() => void remove(row.entry.id)} aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No sessions" description="Nothing matches that search yet." />
        )}
      </Card>
    </div>
  );
}
