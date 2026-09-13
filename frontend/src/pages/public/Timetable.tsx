// ===========================================================================
//  Timetable.tsx — the public timetable view.
//
//  Two things a student wants from a timetable page:
//    * the whole day for a whole floor, as a grid, so they can see the gaps
//    * the changes: what is cancelled, moved or added in the next fortnight
// ===========================================================================

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CalendarClock } from "lucide-react";
import { api, DAY_NAMES, minutesToClock, type BuildingRow, type ExceptionRow, type RoomBoard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Badge, Card, EmptyState, ErrorNote, Notice, PageHeader, Select, Spinner } from "@/components/ui";

/** The teaching day the grid draws, in whole hours. */
const FIRST_HOUR = 7;
const LAST_HOUR = 20;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_unused, index) => FIRST_HOUR + index);

const KIND_LABEL: Record<ExceptionRow["exception"]["kind"], string> = {
  cancel: "Cancelled",
  move_room: "Room changed",
  retime: "Time changed",
  extra: "Extra class",
  holiday: "Holiday",
  room_closed: "Room closed",
};

const KIND_TONE: Record<ExceptionRow["exception"]["kind"], "rooms" | "bus" | "warning" | "error" | "neutral"> = {
  cancel: "rooms",
  move_room: "bus",
  retime: "warning",
  extra: "bus",
  holiday: "warning",
  room_closed: "error",
};

export default function Timetable() {
  const buildings = useApiData<{ buildings: BuildingRow[] }>(() => api.get("/rooms/buildings"), []);
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!building && buildings.data?.buildings.length) setBuilding(String(buildings.data.buildings[0]!.code));
  }, [buildings.data, building]);

  const board = useApiData<RoomBoard>(
    () => api.get<RoomBoard>("/rooms", { building: building || undefined, floor: floor || undefined, date: date || undefined }),
    [building, floor, date],
  );
  const changes = useApiData<{ from: string; to: string; exceptions: ExceptionRow[] }>(() => api.get("/rooms/changes/upcoming"), []);

  const floors = buildings.data?.buildings.find(row => String(row.code) === building)?.floors ?? [];
  const rooms = board.data?.rooms ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Timetable"
        subtitle={board.data ? `${board.data.moment.dateLabel} — ${DAY_NAMES[board.data.moment.dayOfWeek]}` : "Loading…"}
      />

      <Card title="Choose a floor and a day">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">Building</span>
            <Select
              value={building}
              onChange={event => {
                setBuilding(event.target.value);
                setFloor("");
              }}
            >
              {(buildings.data?.buildings ?? []).map(row => (
                <option key={row.id} value={row.code}>
                  {row.code} — {row.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="field-label">Floor</span>
            <Select value={floor} onChange={event => setFloor(event.target.value)}>
              <option value="">All floors</option>
              {floors.map(row => (
                <option key={row.id} value={row.level}>
                  Floor {row.level}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="field-label">Date</span>
            <input className="input" type="date" value={date} onChange={event => setDate(event.target.value)} />
          </label>
        </div>
      </Card>

      {board.data?.holiday ? <Notice tone="warning">University holiday — {board.data.holiday.reason}. No classes are scheduled.</Notice> : null}
      {board.error ? <ErrorNote message={board.error} onRetry={() => void board.refresh()} /> : null}
      {board.loading && !board.data ? <Spinner label="Building the grid…" /> : null}

      {/* ---------- the day grid ----------
          One row per room, one column per hour. A block is drawn from its own
          start and end minutes, so a 09:00-10:30 class really is one and a
          half columns wide rather than being rounded to the hour. */}
      {board.data && rooms.length ? (
        <Card title="The whole day, room by room" subtitle="Scroll sideways on a phone — the times stay aligned.">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="flex border-b border-outline-variant pb-1">
                <div className="w-16 shrink-0 text-label font-semibold uppercase tracking-wider text-on-surface-variant">Room</div>
                <div className="relative flex-1">
                  <div className="flex">
                    {HOURS.map(hour => (
                      <div key={hour} className="tabular flex-1 text-center text-[11px] font-semibold text-on-surface-variant">
                        {minutesToClock(hour * 60)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <ul>
                {rooms.map(room => (
                  <li key={room.id} className="flex items-center border-b border-surface-container-high py-1.5">
                    <Link href={`/rooms/${room.roomNumber}`} className="tabular w-16 shrink-0 text-[13px] font-bold text-on-surface hover:underline">
                      {room.roomNumber}
                    </Link>
                    <div className="relative h-7 flex-1 rounded bg-surface-container-low">
                      {room.availability.sessions.map(session => {
                        const spanMinutes = (LAST_HOUR - FIRST_HOUR) * 60;
                        const left = ((session.startMinute - FIRST_HOUR * 60) / spanMinutes) * 100;
                        const width = ((session.endMinute - session.startMinute) / spanMinutes) * 100;
                        if (left > 100 || left + width < 0) return null; // outside the drawn day
                        return (
                          <span
                            key={`${session.entryId ?? "x"}-${session.exceptionId ?? "x"}-${session.startMinute}`}
                            className={`absolute top-0 flex h-7 items-center overflow-hidden rounded px-1.5 text-[10px] font-semibold ${
                              session.origin === "closure"
                                ? "bg-surface-container-highest text-on-surface-variant"
                                : session.origin === "timetable"
                                  ? "bg-error-container text-on-error-container"
                                  : "bg-warning-container text-on-warning-container"
                            }`}
                            style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` }}
                            title={`${session.startTime}–${session.endTime} ${session.label}`}
                          >
                            <span className="truncate">{session.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {board.data && !rooms.length ? <EmptyState title="No rooms to show" description="Choose another building or floor." /> : null}

      {/* ---------- upcoming changes ---------- */}
      <Card
        title="Changes in the next two weeks"
        subtitle="Cancellations, room changes and holidays the office has published."
        actions={<CalendarClock className="h-5 w-5 text-on-surface-variant" />}
      >
        {changes.loading && !changes.data ? <Spinner /> : null}
        {changes.data?.exceptions.length ? (
          <ul className="space-y-2">
            {changes.data.exceptions.map(row => (
              <li key={row.exception.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-outline-variant px-3 py-2.5">
                <span className="tabular text-[13px] font-semibold text-on-surface">{row.exception.onDate}</span>
                <Badge tone={KIND_TONE[row.exception.kind]}>{KIND_LABEL[row.exception.kind]}</Badge>
                <span className="min-w-0 flex-1 text-[13px] text-on-surface-variant">
                  {row.roomNumber ? `Room ${row.roomNumber}` : null}
                  {row.newRoomNumber ? ` → Room ${row.newRoomNumber}` : null}
                  {row.batchName ? ` · ${row.batchName}` : null}
                  {row.exception.startMinute !== null && row.exception.endMinute !== null
                    ? ` · ${minutesToClock(row.exception.startMinute)}–${minutesToClock(row.exception.endMinute)}`
                    : null}
                  {row.exception.reason ? ` — ${row.exception.reason}` : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No changes published" description="The normal weekly timetable applies." />
        )}
      </Card>
    </div>
  );
}
