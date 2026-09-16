import { useEffect, useMemo, useState } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { api, DAY_NAMES, minutesToClock, type BatchRow, type ExceptionRow, type TimetableRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Select, Spinner } from "@/components/ui";

const PERIODS = [
  { start: 510, label: "8:30–9:30" }, { start: 580, label: "9:40–10:40" },
  { start: 650, label: "10:50–11:50" }, { start: 760, label: "12:40–1:40" },
  { start: 830, label: "1:50–2:50" }, { start: 900, label: "3:00–4:00" },
] as const;
const YEARS = ["First", "Second", "Third", "Fourth", "Fifth"];
const SECTIONS = ["A", "B", "C", "D", "E"];

const KIND_LABEL: Record<ExceptionRow["exception"]["kind"], string> = {
  cancel: "Cancelled", move_room: "Room changed", retime: "Time changed", extra: "Extra class", holiday: "Holiday", room_closed: "Room closed",
};
const KIND_TONE: Record<ExceptionRow["exception"]["kind"], "rooms" | "bus" | "warning" | "error" | "neutral"> = {
  cancel: "rooms", move_room: "bus", retime: "warning", extra: "bus", holiday: "warning", room_closed: "error",
};
type SchedulePayload = { batches: BatchRow[]; entries: TimetableRow[] };

export default function Timetable() {
  const [year, setYear] = useState("1");
  const [section, setSection] = useState("E");
  const catalog = useApiData<SchedulePayload>(() => api.get("/rooms/timetable/classes"), []);
  const selected = catalog.data?.batches.find(batch => batch.code === `Y${year}-${section}`);
  const schedule = useApiData<SchedulePayload>(() => api.get("/rooms/timetable/classes", { batchId: selected?.id }), [selected?.id]);
  const changes = useApiData<{ from: string; to: string; exceptions: ExceptionRow[] }>(() => api.get("/rooms/changes/upcoming"), []);

  useEffect(() => {
    if (!selected && catalog.data?.batches.length) {
      const match = /^Y(\d)-([A-E])$/.exec(catalog.data.batches[0]!.code);
      if (match) { setYear(match[1]!); setSection(match[2]!); }
    }
  }, [catalog.data, selected]);

  const bySlot = useMemo(() => {
    const map = new Map<string, TimetableRow>();
    for (const row of schedule.data?.entries ?? []) map.set(`${row.entry.dayOfWeek}-${row.entry.startMinute}`, row);
    return map;
  }, [schedule.data]);

  return (
    <div className="space-y-stack-md">
      <PageHeader title="Class timetable" subtitle="Choose your batch and section to see the complete weekly schedule." />
      <Card title="Choose your class">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="field-label">Batch</span><Select value={year} onChange={event => setYear(event.target.value)}>{YEARS.map((name, i) => <option key={name} value={i + 1}>{name} Year</option>)}</Select></label>
          <label><span className="field-label">Section</span><Select value={section} onChange={event => setSection(event.target.value)}>{SECTIONS.map(value => <option key={value} value={value}>Section {value}</option>)}</Select></label>
        </div>
      </Card>

      {catalog.error || schedule.error ? <ErrorNote message={catalog.error ?? schedule.error ?? "Could not load timetable."} onRetry={() => { void catalog.refresh(); void schedule.refresh(); }} /> : null}
      {(catalog.loading || schedule.loading) && !schedule.data ? <Spinner label="Loading class timetable…" /> : null}

      {selected ? (
        <Card title={selected.name} subtitle="Monday–Friday · six university periods">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1050px] table-fixed">
              <thead><tr><th className="w-28">Day</th>{PERIODS.map((period, i) => <th key={period.start} className="text-center"><span className="block">Period {i + 1}</span><span className="tabular text-[11px] font-normal">{period.label}</span></th>)}</tr></thead>
              <tbody>{[1, 2, 3, 4, 5].map(day => (
                <tr key={day}><th className="text-left">{DAY_NAMES[day]}</th>{PERIODS.map(period => {
                  const row = bySlot.get(`${day}-${period.start}`);
                  return <td key={period.start} className="h-28 align-top text-center">{row ? (
                    <div className="space-y-1 rounded-lg bg-primary-container/60 p-2 text-on-primary-container">
                      <p className="font-bold">{row.subjectCode ?? "Class"}{row.entry.title && !row.entry.title.startsWith("DEPT:") ? ` (${row.entry.title})` : ""}</p>
                      {row.subjectName ? <p className="text-[11px] leading-tight">{row.subjectName}</p> : null}
                      <p className="inline-flex items-center gap-1 font-semibold"><MapPin className="h-3 w-3" />Room {row.roomNumber}</p>
                      {row.entry.teacher ? <p className="text-[11px]">{row.entry.teacher}</p> : null}
                    </div>
                  ) : <span className="text-on-surface-variant">—</span>}</td>;
                })}</tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      ) : catalog.data ? <EmptyState title="Class not found" description="This batch and section have not been configured." /> : null}

      <Card title="Changes in the next two weeks" subtitle="Cancellations, room changes and holidays published by the office." actions={<CalendarClock className="h-5 w-5 text-on-surface-variant" />}>
        {changes.loading && !changes.data ? <Spinner /> : null}
        {changes.data?.exceptions.length ? <ul className="space-y-2">{changes.data.exceptions.map(row => (
          <li key={row.exception.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant px-3 py-2.5">
            <span className="tabular text-[13px] font-semibold">{row.exception.onDate}</span><Badge tone={KIND_TONE[row.exception.kind]}>{KIND_LABEL[row.exception.kind]}</Badge>
            <span className="text-[13px] text-on-surface-variant">{row.roomNumber ? `Room ${row.roomNumber}` : ""}{row.newRoomNumber ? ` → Room ${row.newRoomNumber}` : ""}{row.batchName ? ` · ${row.batchName}` : ""}{row.exception.startMinute !== null && row.exception.endMinute !== null ? ` · ${minutesToClock(row.exception.startMinute)}–${minutesToClock(row.exception.endMinute)}` : ""}{row.exception.reason ? ` — ${row.exception.reason}` : ""}</span>
          </li>
        ))}</ul> : <EmptyState title="No changes published" description="The normal weekly timetable applies." />}
      </Card>
    </div>
  );
}
