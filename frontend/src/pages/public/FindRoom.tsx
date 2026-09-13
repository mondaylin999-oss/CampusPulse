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
import { api, type BuildingRow, type RoomBoard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { PulseCounters, RoomTile } from "@/components/rooms";
import { Card, EmptyState, ErrorNote, Notice, PageHeader, Select, Spinner } from "@/components/ui";

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

  const buildings = useApiData<{ buildings: BuildingRow[] }>(() => api.get("/rooms/buildings"), []);

  const board = useApiData<RoomBoard>(
    () =>
      api.get<RoomBoard>("/rooms", {
        building: building || undefined,
        floor: floor || undefined,
        search: roomSearch.trim() || undefined,
        // With no duration asked for, "available" means available this minute.
        available: minMinutes ? undefined : true,
        minFreeMinutes: minMinutes || undefined,
      }),
    [building, floor, roomSearch, minMinutes],
    { pollMs: 60_000 },
  );

  const floorsOfBuilding = useMemo(() => {
    if (!building) return [];
    return buildings.data?.buildings.find(row => String(row.code) === building)?.floors ?? [];
  }, [building, buildings.data]);

  const rooms = board.data?.rooms ?? [];

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Find an available room"
        subtitle={board.data ? `${board.data.moment.dateLabel} · ${board.data.moment.clock}` : "Reading the timetable…"}
      />

      {board.data?.holiday ? <Notice tone="warning">University holiday — {board.data.holiday.reason}.</Notice> : null}

      {/* ---------- filters ---------- */}
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
                  {row.code} — {row.name}
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
                  Floor {row.level}
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
