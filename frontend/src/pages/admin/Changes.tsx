// ===========================================================================
//  admin/Changes.tsx — one-date changes to the timetable.
//
//  THE WEEKLY TIMETABLE IS NEVER EDITED FOR A ONE-OFF. Cancelling Monday's
//  9am class here does not cancel it for the rest of the term; it adds a row
//  that applies to one date only, and the room board layers it on top when it
//  works out that date. Delete the row and the normal week is back.
// ===========================================================================

import { useMemo, useState, type FormEvent } from "react";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import { api, ApiError, DAY_NAMES, minutesToClock, type AdminRoom, type ExceptionKind, type ExceptionRow, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";

/** What each kind means in the office's own words, and what it needs. */
const KINDS: Array<{ value: ExceptionKind; label: string; help: string; needs: Array<"entry" | "newRoom" | "room" | "times"> }> = [
  { value: "cancel", label: "Class cancelled", help: "The class does not happen on this date. The room reads free.", needs: ["entry"] },
  { value: "move_room", label: "Class moved to another room", help: "Same class, same time, different room — both rooms update.", needs: ["entry", "newRoom"] },
  { value: "retime", label: "Class time changed", help: "Same class, same room, different hours on this date.", needs: ["entry", "times"] },
  { value: "extra", label: "Special class added", help: "A class that is not in the weekly timetable at all.", needs: ["room", "times"] },
  { value: "holiday", label: "University holiday", help: "No scheduled teaching anywhere on this date.", needs: [] },
  { value: "room_closed", label: "Room unavailable", help: "The room is out of use. Leave the times blank for the whole day.", needs: ["room"] },
];

const KIND_LABEL: Record<ExceptionKind, string> = {
  cancel: "Cancelled",
  move_room: "Room changed",
  retime: "Time changed",
  extra: "Extra class",
  holiday: "Holiday",
  room_closed: "Room closed",
};

export default function Changes() {
  const today = new Date().toISOString().slice(0, 10);
  const campus = useApiData<{ rooms: AdminRoom[] }>(() => api.get("/admin/campus"), []);
  const timetable = useApiData<{ entries: TimetableRow[] }>(() => api.get("/admin/timetable"), []);
  const exceptions = useApiData<{ exceptions: ExceptionRow[] }>(() => api.get("/admin/exceptions", { from: today }), []);

  const [form, setForm] = useState({
    kind: "cancel" as ExceptionKind,
    onDate: today,
    entryId: "",
    roomId: "",
    newRoomId: "",
    startMinute: "09:00",
    endMinute: "10:00",
    title: "",
    teacher: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  const kind = KINDS.find(row => row.value === form.kind)!;
  const rooms = campus.data?.rooms ?? [];

  // Only the sessions that actually fall on the chosen weekday can be
  // cancelled, moved or retimed — offering the rest would invite mistakes.
  const dayOfWeek = useMemo(() => {
    const [year, month, day] = form.onDate.split("-").map(Number);
    if (!year) return null;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday === 0 ? 7 : weekday;
  }, [form.onDate]);

  const entriesThatDay = (timetable.data?.entries ?? []).filter(row => dayOfWeek === null || row.entry.dayOfWeek === dayOfWeek);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await api.post("/admin/exceptions", {
        kind: form.kind,
        onDate: form.onDate,
        entryId: kind.needs.includes("entry") ? Number(form.entryId) : undefined,
        roomId: kind.needs.includes("room") ? Number(form.roomId) : undefined,
        newRoomId: kind.needs.includes("newRoom") ? Number(form.newRoomId) : undefined,
        startMinute: kind.needs.includes("times") || (form.kind === "room_closed" && form.startMinute) ? form.startMinute : undefined,
        endMinute: kind.needs.includes("times") || (form.kind === "room_closed" && form.endMinute) ? form.endMinute : undefined,
        title: form.title.trim() || undefined,
        teacher: form.teacher.trim() || undefined,
        reason: form.reason.trim() || undefined,
      });
      setNote({ tone: "rooms", text: "Change published. The room board already reflects it." });
      setForm({ ...form, entryId: "", reason: "" });
      await exceptions.refresh();
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save the change." });
    } finally {
      setBusy(false);
    }
  };

  const rows = exceptions.data?.exceptions ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader title="Timetable changes" subtitle="One-off changes. The normal weekly timetable is left untouched." />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      <Card title="Publish a change" accent="warning">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={save}>
          <Field label="What happened">
            <Select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as ExceptionKind, entryId: "" })}>
              {KINDS.map(row => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date">
            <Input type="date" value={form.onDate} onChange={event => setForm({ ...form, onDate: event.target.value, entryId: "" })} required />
          </Field>

          <div className="flex items-end pb-1 text-[12px] text-on-surface-variant">{kind.help}</div>

          {kind.needs.includes("entry") ? (
            <Field label="Which class" className="sm:col-span-2" hint={dayOfWeek ? `Sessions timetabled on ${DAY_NAMES[dayOfWeek]}` : undefined}>
              <Select value={form.entryId} onChange={event => setForm({ ...form, entryId: event.target.value })} required>
                <option value="">Choose a session…</option>
                {entriesThatDay.map(row => (
                  <option key={row.entry.id} value={row.entry.id}>
                    {row.roomNumber} · {row.startTime}–{row.endTime} · {row.batchName ?? row.entry.title ?? "Reserved"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {kind.needs.includes("newRoom") ? (
            <Field label="Moves to room">
              <Select value={form.newRoomId} onChange={event => setForm({ ...form, newRoomId: event.target.value })} required>
                <option value="">Choose a room…</option>
                {rooms.map(row => (
                  <option key={row.room.id} value={row.room.id}>
                    {row.room.roomNumber} — {row.buildingName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {kind.needs.includes("room") ? (
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
          ) : null}

          {kind.needs.includes("times") || form.kind === "room_closed" ? (
            <>
              <Field label={form.kind === "room_closed" ? "Closed from (optional)" : "Starts"}>
                <Input type="time" value={form.startMinute} onChange={event => setForm({ ...form, startMinute: event.target.value })} />
              </Field>
              <Field label={form.kind === "room_closed" ? "Closed until (optional)" : "Ends"}>
                <Input type="time" value={form.endMinute} onChange={event => setForm({ ...form, endMinute: event.target.value })} />
              </Field>
            </>
          ) : null}

          {form.kind === "extra" ? (
            <>
              <Field label="What is it">
                <Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Revision class" />
              </Field>
              <Field label="Teacher">
                <Input value={form.teacher} onChange={event => setForm({ ...form, teacher: event.target.value })} />
              </Field>
            </>
          ) : null}

          <Field label="Reason (students see this)" className="sm:col-span-2 lg:col-span-3">
            <Input value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} placeholder="Projector repair, public holiday, …" />
          </Field>

          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" busy={busy}>
              <Plus className="h-4 w-4" /> Publish change
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Published changes" subtitle="From today onwards." actions={<CalendarX className="h-5 w-5 text-on-surface-variant" />}>
        {exceptions.error ? <ErrorNote message={exceptions.error} onRetry={() => void exceptions.refresh()} /> : null}
        {exceptions.loading && !exceptions.data ? <Spinner /> : null}

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Change</th>
                  <th>Room</th>
                  <th>Time</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.exception.id}>
                    <td className="tabular">{row.exception.onDate}</td>
                    <td>
                      <Badge tone={row.exception.kind === "cancel" ? "rooms" : row.exception.kind === "room_closed" ? "error" : "warning"}>
                        {KIND_LABEL[row.exception.kind]}
                      </Badge>
                    </td>
                    <td className="tabular">
                      {row.roomNumber ?? "—"}
                      {row.newRoomNumber ? ` → ${row.newRoomNumber}` : ""}
                    </td>
                    <td className="tabular">
                      {row.exception.startMinute !== null && row.exception.endMinute !== null
                        ? `${minutesToClock(row.exception.startMinute)}–${minutesToClock(row.exception.endMinute)}`
                        : row.entryStartMinute !== null && row.entryEndMinute !== null
                          ? `${minutesToClock(row.entryStartMinute)}–${minutesToClock(row.entryEndMinute)}`
                          : "All day"}
                    </td>
                    <td className="text-[13px] text-on-surface-variant">{row.exception.reason ?? "—"}</td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          className="rounded p-2 text-error hover:bg-error-container"
                          aria-label="Undo this change"
                          onClick={async () => {
                            try {
                              await api.delete(`/admin/exceptions/${row.exception.id}`);
                              await exceptions.refresh();
                              setNote({ tone: "rooms", text: "Change withdrawn — the normal timetable applies again." });
                            } catch (caught) {
                              setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not withdraw." });
                            }
                          }}
                        >
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
          <EmptyState title="No changes published" description="The normal weekly timetable is in force." />
        )}
      </Card>
    </div>
  );
}
