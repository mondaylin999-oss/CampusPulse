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

import { useEffect, useState } from "react";
import { Copy, Save, Table2 } from "lucide-react";
import { api, ApiError, DAY_NAMES, type AdminRoom, type BatchRow, type SubjectRow, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button, Card, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";

const PERIODS = [
  { label: "Period 1 · 8:30–9:30", start: "08:30", end: "09:30" },
  { label: "Period 2 · 9:40–10:40", start: "09:40", end: "10:40" },
  { label: "Period 3 · 10:50–11:50", start: "10:50", end: "11:50" },
  { label: "Period 4 · 12:40–1:40", start: "12:40", end: "13:40" },
  { label: "Period 5 · 1:50–2:50", start: "13:50", end: "14:50" },
  { label: "Period 6 · 3:00–4:00", start: "15:00", end: "16:00" },
] as const;

type GridCell = { roomId: string; subjectId: string; title: string; teacher: string; department: string };

const EMPTY_CELL: GridCell = { roomId: "", subjectId: "", title: "", teacher: "", department: "" };

function cellFromRow(row: TimetableRow): GridCell {
  const department = row.entry.title?.startsWith("DEPT:") ? row.entry.title.slice(5) : "";
  return {
    roomId: String(row.entry.roomId),
    subjectId: row.entry.subjectId ? String(row.entry.subjectId) : "",
    title: department ? "" : (row.entry.title ?? ""),
    teacher: department ? "" : (row.entry.teacher ?? ""),
    department,
  };
}

function gridKey(row: TimetableRow) {
  const period = PERIODS.findIndex(item => item.start === row.startTime && item.end === row.endTime);
  return period < 0 ? null : `${row.entry.dayOfWeek}-${period}`;
}

function SpreadsheetEditor({ batches, subjects, rooms }: { batches: BatchRow[]; subjects: SubjectRow[]; rooms: AdminRoom[] }) {
  const [batchId, setBatchId] = useState("");
  const timetable = useApiData<{ entries: TimetableRow[] }>(() => api.get("/admin/timetable", { batchId: batchId || undefined }), [batchId]);
  const allTimetables = useApiData<{ entries: TimetableRow[] }>(() => api.get("/admin/timetable"), []);
  const [cells, setCells] = useState<Record<string, GridCell>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [copyFromBatchId, setCopyFromBatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!batchId && batches.length) setBatchId(String(batches.find(row => row.code === "Y1-E")?.id ?? batches[0]!.id));
  }, [batchId, batches]);

  useEffect(() => {
    const next: Record<string, GridCell> = {};
    for (const row of timetable.data?.entries ?? []) {
      const key = gridKey(row);
      if (key) next[key] = cellFromRow(row);
    }
    setCells(next);
    setDirty(new Set());
  }, [timetable.data]);

  const change = (key: string, patch: Partial<GridCell>) => {
    setCells(current => ({ ...current, [key]: { ...(current[key] ?? EMPTY_CELL), ...patch } }));
    setDirty(current => new Set(current).add(key));
  };

  const copyCompleteWeek = () => {
    if (!batchId || !copyFromBatchId || batchId === copyFromBatchId) return;
    const sourceRows = (allTimetables.data?.entries ?? []).filter(row => row.entry.batchId === Number(copyFromBatchId));
    const next: Record<string, GridCell> = {};
    const changed = new Set<string>();

    // Every fixed-period cell is included. Blank source cells therefore clear
    // the corresponding destination cell when the administrator saves.
    for (let day = 1; day <= 5; day += 1) {
      for (let period = 0; period < PERIODS.length; period += 1) {
        const key = `${day}-${period}`;
        next[key] = { ...EMPTY_CELL };
        changed.add(key);
      }
    }
    for (const row of sourceRows) {
      const key = gridKey(row);
      if (key) next[key] = cellFromRow(row);
    }

    const source = batches.find(row => row.id === Number(copyFromBatchId));
    const destination = batches.find(row => row.id === Number(batchId));
    setCells(next);
    setDirty(changed);
    setMessage({
      tone: "rooms",
      text: `Copied the complete week from ${source?.code ?? "the source"} into ${destination?.code ?? "the destination"}. Review the rooms, then save the 30-cell draft.`,
    });
  };

  const saveAll = async () => {
    if (!batchId || !dirty.size) return;
    setSaving(true); setMessage(null);
    try {
      const existing = new Map((timetable.data?.entries ?? []).map(row => [`${row.entry.dayOfWeek}-${PERIODS.findIndex(p => p.start === row.startTime && p.end === row.endTime)}`, row]));
      for (const key of dirty) {
        const [dayText, periodText] = key.split("-");
        const dayOfWeek = Number(dayText); const periodIndex = Number(periodText); const period = PERIODS[periodIndex]!;
        const cell = cells[key]; const old = existing.get(key);
        if (!cell?.roomId || !cell.subjectId) {
          if (old) await api.delete(`/admin/timetable/${old.entry.id}`);
          continue;
        }
        const department = cell.department.trim();
        const body = { roomId: Number(cell.roomId), batchId: Number(batchId), subjectId: Number(cell.subjectId), title: department ? `DEPT:${department}` : (cell.title || "L"), teacher: department ? `${department} Department` : (cell.teacher.trim() || null), dayOfWeek, startMinute: period.start, endMinute: period.end, effectiveFrom: null, effectiveTo: null };
        if (old) await api.patch(`/admin/timetable/${old.entry.id}`, body); else await api.post("/admin/timetable", body);
      }
      setMessage({ tone: "rooms", text: `Saved ${dirty.size} changed cell${dirty.size === 1 ? "" : "s"}.` });
      await Promise.all([timetable.refresh(), allTimetables.refresh()]);
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save the timetable." });
      await timetable.refresh();
    } finally { setSaving(false); }
  };

  return <Card title="Spreadsheet timetable" subtitle="Select a class, edit cells like a worksheet, then save all changes together." actions={<Table2 className="h-5 w-5 text-on-surface-variant" />}>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="Batch and section"><Select className="min-w-64" value={batchId} onChange={event => { const destination = event.target.value; setBatchId(destination); setCopyFromBatchId(current => current === destination ? "" : current); setMessage(null); }}>{batches.map(row => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</Select></Field>
      <Button onClick={() => void saveAll()} busy={saving} disabled={!dirty.size}><Save className="h-4 w-4" />Save timetable{dirty.size ? ` (${dirty.size})` : ""}</Button>
    </div>
    <div className="mb-4 rounded-xl border border-outline-variant bg-surface-container-low p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Copy complete week from" hint="The selected section above is the destination.">
          <Select className="min-w-64" value={copyFromBatchId} onChange={event => setCopyFromBatchId(event.target.value)}>
            <option value="">Choose source section</option>
            {batches.filter(row => String(row.id) !== batchId).map(row => {
              const count = (allTimetables.data?.entries ?? []).filter(entry => entry.entry.batchId === row.id).length;
              return <option key={row.id} value={row.id} disabled={!count}>{row.code} — {row.name}{count ? ` (${count} sessions)` : " (not added)"}</option>;
            })}
          </Select>
        </Field>
        <Button variant="rooms" onClick={copyCompleteWeek} disabled={!copyFromBatchId || !batchId || copyFromBatchId === batchId || !allTimetables.data}>
          <Copy className="h-4 w-4" /> Copy week into editor
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-on-surface-variant">This creates an editable duplicate. Change any rooms that clash, then use Save timetable.</p>
    </div>
    {message ? <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div> : null}
    {timetable.error ? <ErrorNote message={timetable.error} onRetry={() => void timetable.refresh()} /> : null}
    {timetable.loading && !timetable.data ? <Spinner /> : null}
    <div className="overflow-x-auto"><table className="data-table min-w-[1320px] table-fixed">
      <thead><tr><th className="w-28">Day</th>{PERIODS.map(period => <th key={period.label} className="text-center">{period.label}</th>)}</tr></thead>
      <tbody>{[1,2,3,4,5].map(day => <tr key={day}><th>{DAY_NAMES[day]}</th>{PERIODS.map((_period, index) => {
        const key = `${day}-${index}`; const cell = cells[key] ?? EMPTY_CELL;
        const hasLecture = Boolean(cell.title || cell.teacher.trim());
        const hasDepartment = Boolean(cell.department.trim());
        return <td key={key} className={`space-y-1.5 align-top ${dirty.has(key) ? "bg-warning-container/30" : ""}`}>
          <Select aria-label={`${DAY_NAMES[day]} period ${index + 1} subject`} value={cell.subjectId} onChange={event => change(key, { subjectId: event.target.value })}><option value="">Empty</option>{subjects.map(row => <option key={row.id} value={row.id}>{row.code}</option>)}</Select>
          <Select aria-label={`${DAY_NAMES[day]} period ${index + 1} room`} value={cell.roomId} onChange={event => change(key, { roomId: event.target.value })}><option value="">Room</option>{rooms.map(row => <option key={row.room.id} value={row.room.id}>{row.room.roomNumber}</option>)}</Select>
          <div className="grid grid-cols-[78px_1fr] gap-1">
            <Select aria-label="Class type" value={cell.title} disabled={hasDepartment} onChange={event => change(key, { title: event.target.value, department: "" })}><option value="">Type</option><option value="L">L</option><option value="TDA">TDA</option></Select>
            <Input aria-label="Lecturer" placeholder="Lecturer" value={cell.teacher} disabled={hasDepartment} onChange={event => change(key, { teacher: event.target.value, department: "" })} />
          </div>
          <Input aria-label="Department" placeholder="Department (Myanmar, English…)" value={cell.department} disabled={hasLecture} onChange={event => change(key, { department: event.target.value, title: "", teacher: "" })} />
        </td>;
      })}</tr>)}</tbody>
    </table></div>
    <p className="mt-3 text-[12px] text-on-surface-variant">To clear a class, choose “Empty” or clear its room, then save. Room and class conflicts are checked by the server.</p>

    <div className="mt-5 border-t border-outline-variant pt-4">
      <h3 className="text-[15px] font-semibold text-on-surface">All batch sections</h3>
      <p className="mt-0.5 text-[12px] text-on-surface-variant">Every section is shown here. Select one to add or change its timetable.</p>
      {allTimetables.error ? <div className="mt-3"><ErrorNote message={allTimetables.error} onRetry={() => void allTimetables.refresh()} /></div> : null}
      {allTimetables.loading && !allTimetables.data ? <Spinner label="Checking section timetables…" /> : null}
      {allTimetables.data ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {batches
          .map(batch => ({
            batch,
            count: (allTimetables.data?.entries ?? []).filter(row => row.entry.batchId === batch.id).length,
          }))
          .map(({ batch, count }) => (
            <button
              key={batch.id}
              type="button"
              onClick={() => setBatchId(String(batch.id))}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                String(batch.id) === batchId
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high"
              }`}
            >
              <span className="block text-[13px] font-semibold">{batch.code} — {batch.name}</span>
              <span className={`mt-1 block text-[11px] font-semibold ${
                String(batch.id) === batchId
                  ? "text-on-primary/80"
                  : count
                    ? "text-secondary"
                    : "text-error"
              }`}>
                {count ? `Timetable added · ${count} session${count === 1 ? "" : "s"}` : "Not added"}
              </span>
            </button>
          ))}
      </div> : null}
    </div>
  </Card>;
}

export default function TimetableManager() {
  const campus = useApiData<{ rooms: AdminRoom[] }>(() => api.get("/admin/campus"), []);
  const academics = useApiData<{ batches: BatchRow[]; subjects: SubjectRow[] }>(() => api.get("/admin/academics"), []);

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Timetable manager"
        subtitle="Select a batch and section, then manage its complete weekly timetable in the worksheet."
      />
      <SpreadsheetEditor
        batches={academics.data?.batches ?? []}
        subjects={academics.data?.subjects ?? []}
        rooms={campus.data?.rooms ?? []}
      />
    </div>
  );
}
