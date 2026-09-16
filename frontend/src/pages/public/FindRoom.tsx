// ===========================================================================
//  FindRoom.tsx — "which rooms are available right now?"
//
//  The question a student actually asks has a length in it: "I need somewhere
//  for two hours". So the duration filter is not a nicety — a room that frees
//  up in ten minutes is the wrong answer to that question, and the backend
//  checks the whole window rather than just the next class.
// ===========================================================================

import { useMemo, useState } from "react";
import { useSearch } from "wouter";
import { Filter, Search } from "lucide-react";
import { api, ROOM_KINDS, ROOM_KIND_LABELS, type BuildingOverview, type RoomBoard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { PulseCounters, RoomTile } from "@/components/rooms";
import { NOW, WhenPicker, isNow, whenQuery, type When } from "@/components/WhenPicker";
import { Button, Card, EmptyState, ErrorNote, Notice, PageHeader, Select, Spinner } from "@/components/ui";

/** Seat counts worth filtering on — a tutorial group vs a whole year. */
const CAPACITIES = [0, 20, 30, 50, 100];

/** The lengths students actually ask for. */
const DURATIONS = [
  { minutes: 0, label: "Free now" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 180, label: "3 hours" },
];

export default function FindRoom() {
  const search = useSearch();
  const initialSearch = new URLSearchParams(search).get("search") ?? "";

  const [roomSearch, setRoomSearch] = useState(initialSearch);
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [minMinutes, setMinMinutes] = useState(0);
  const [kind, setKind] = useState("");
  const [minCapacity, setMinCapacity] = useState(0);
  const [when, setWhen] = useState<When>(NOW);

  const buildings = useApiData<BuildingOverview>(() => api.get("/rooms/buildings", whenQuery(when)), [when.date, when.minute]);

  const board = useApiData<RoomBoard>(
    () =>
      api.get<RoomBoard>("/rooms", {
        ...whenQuery(when),
        building: building || undefined,
        floor: floor || undefined,
        search: roomSearch.trim() || undefined,
        kind: kind || undefined,
        minCapacity: minCapacity || undefined,
        // With no duration asked for, "available" means available this minute.
        available: minMinutes ? undefined : true,
        minFreeMinutes: minMinutes || undefined,
      }),
    [building, floor, roomSearch, minMinutes, kind, minCapacity, when.date, when.minute],
    // Only poll while the page is showing NOW; a chosen moment does not move.
    { pollMs: isNow(when) ? 60_000 : undefined },
  );

  const filtered = Boolean(building || floor || roomSearch.trim() || minMinutes || kind || minCapacity);
  const reset = () => {
    setBuilding("");
    setFloor("");
    setRoomSearch("");
    setMinMinutes(0);
    setKind("");
    setMinCapacity(0);
  };

  const floorsOfBuilding = useMemo(() => {
    if (!building) return [];
    return buildings.data?.buildings.find(row => String(row.code) === building)?.floors ?? [];
  }, [building, buildings.data]);

  const rooms = board.data?.rooms ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Find an available room"
        subtitle={
          board.data
            ? `${board.data.moment.dateLabel} · ${board.data.moment.clock}${board.data.moment.isToday && isNow(when) ? "" : " — a chosen moment, not now"}`
            : "Reading the timetable…"
        }
        actions={filtered ? <Button variant="ghost" onClick={reset}>Reset filters</Button> : null}
      />

      {board.data?.holiday ? <Notice tone="warning">University holiday — {board.data.holiday.reason}.</Notice> : null}

      {/* ---------- filters ---------- */}
      <Card title="When do you need it?" accent="rooms">
        <WhenPicker value={when} onChange={setWhen} />
      </Card>

      <Card title="What do you need?" accent="rooms">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="field-label">Room number</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                className="input pl-9"
                inputMode="numeric"
                placeholder="e.g. 32 or 325"
                value={roomSearch}
                onChange={event => setRoomSearch(event.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="field-label">Building</span>
            <Select
              value={building}
              onChange={event => {
                setBuilding(event.target.value);
                setFloor("");
              }}
            >
              <option value="">Any building</option>
              {(buildings.data?.buildings ?? []).map(row => (
                <option key={row.id} value={row.code}>
                  {row.code} — {row.name} ({row.availableNow} free)
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="field-label">Floor</span>
            <Select value={floor} onChange={event => setFloor(event.target.value)} disabled={!building}>
              <option value="">{building ? "Any floor" : "Choose a building first"}</option>
              {floorsOfBuilding.map(row => (
                <option key={row.id} value={row.level}>
                  Floor {row.level} ({row.availableNow} free)
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="field-label">I need it for</span>
            <Select value={minMinutes} onChange={event => setMinMinutes(Number(event.target.value))}>
              {DURATIONS.map(option => (
                <option key={option.minutes} value={option.minutes}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="field-label">Room type</span>
            <Select value={kind} onChange={event => setKind(event.target.value)}>
              <option value="">Any type</option>
              {ROOM_KINDS.map(option => (
                <option key={option} value={option}>
                  {ROOM_KIND_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>

          <label className="block">
            <span className="field-label">Seats at least</span>
            <Select value={minCapacity} onChange={event => setMinCapacity(Number(event.target.value))}>
              {CAPACITIES.map(option => (
                <option key={option} value={option}>
                  {option ? `${option} people` : "Any size"}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <p className="mt-3 flex items-start gap-2 text-[12px] text-on-surface-variant">
          <Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {minMinutes
            ? `Showing rooms with nothing scheduled for the next ${DURATIONS.find(option => option.minutes === minMinutes)?.label.toLowerCase()}.`
            : "Showing rooms that are free at this minute. Ask for a length to be sure it stays free."}
        </p>
      </Card>

      {/* ---------- results ---------- */}
      {board.error ? <ErrorNote message={board.error} onRetry={() => void board.refresh()} /> : null}
      {board.loading && !board.data ? <Spinner label="Checking every room…" /> : null}

      {board.data ? (
        <>
          <PulseCounters available={board.data.summary.available} occupied={board.data.summary.occupied} total={board.data.summary.total} />

          {rooms.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map(room => (
                <RoomTile key={room.id} room={room} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No room matches that"
              description={
                minMinutes
                  ? "Nothing is free for that long right now. Try a shorter time, or another building."
                  : "Every room in that part of the campus is in use. Try another building or floor."
              }
            />
          )}
        </>
      ) : null}
    </div>
  );
}
