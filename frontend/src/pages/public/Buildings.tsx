// ===========================================================================
//  Buildings.tsx — browse the campus the way it is laid out: building, then
//  floor, then the six rooms on that floor.
//
//  This is the "I know roughly where I am" path, as opposed to Find a Room's
//  "anywhere will do". It mirrors the numbering: building 3 -> floor 2 -> the
//  rooms 321…326.
// ===========================================================================

import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { api, type BuildingOverview, type RoomBoard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { PulseCounters, RoomTile } from "@/components/rooms";
import { Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner } from "@/components/ui";

export default function Buildings() {
  const buildings = useApiData<BuildingOverview>(() => api.get("/rooms/buildings"), [], { pollMs: 60_000 });
  const [buildingCode, setBuildingCode] = useState<number | null>(null);
  const [floorLevel, setFloorLevel] = useState<number | null>(null);

  // Open the first building automatically — an empty screen helps nobody.
  useEffect(() => {
    if (buildingCode === null && buildings.data?.buildings.length) setBuildingCode(buildings.data.buildings[0]!.code);
  }, [buildings.data, buildingCode]);

  const building = buildings.data?.buildings.find(row => row.code === buildingCode) ?? null;

  const board = useApiData<RoomBoard>(
    () => api.get<RoomBoard>("/rooms", { building: buildingCode ?? undefined, floor: floorLevel ?? undefined }),
    [buildingCode, floorLevel],
    { pollMs: 60_000 },
  );

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title="Buildings & rooms"
        subtitle={board.data ? `${board.data.moment.dateLabel} · ${board.data.moment.clock}` : "Reading the timetable…"}
      />

      {buildings.error ? <ErrorNote message={buildings.error} onRetry={() => void buildings.refresh()} /> : null}
      {buildings.loading && !buildings.data ? <Spinner /> : null}

      {/* ---------- building chooser ---------- */}
      <div className="flex flex-wrap gap-2">
        {(buildings.data?.buildings ?? []).map(row => {
          const active = row.code === buildingCode;
          return (
            <button
              key={row.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors ${
                active ? "border-primary bg-primary text-on-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high"
              }`}
              onClick={() => {
                setBuildingCode(row.code);
                setFloorLevel(null);
              }}
            >
              <Building2 className="h-4 w-4" />
              <span className="tabular">{row.code}</span>
              <span className="hidden sm:inline">{row.name}</span>
              <span
                className={`tabular ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  active
                    ? "bg-on-primary/20 text-on-primary"
                    : row.availableNow
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-error-container text-on-error-container"
                }`}
              >
                {row.availableNow} free
              </span>
            </button>
          );
        })}
      </div>

      {/* ---------- floor chooser ---------- */}
      {building ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">Floor</span>
          <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
          <button
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
              floorLevel === null ? "border-secondary bg-secondary-container text-on-secondary-container" : "border-outline-variant text-on-surface hover:bg-surface-container-high"
            }`}
            onClick={() => setFloorLevel(null)}
          >
            All
          </button>
          {building.floors.map(floor => (
            <button
              key={floor.id}
              className={`tabular rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
                floorLevel === floor.level
                  ? "border-secondary bg-secondary-container text-on-secondary-container"
                  : "border-outline-variant text-on-surface hover:bg-surface-container-high"
              }`}
              onClick={() => setFloorLevel(floor.level)}
              title={`${floor.availableNow} of ${floor.roomCount} rooms free`}
            >
              {floor.level}
              <span className={`ml-1.5 text-[10px] font-bold ${floor.availableNow ? "text-secondary" : "text-error"}`}>{floor.availableNow}</span>
            </button>
          ))}
        </div>
      ) : null}

      {board.data?.holiday ? <Notice tone="warning">University holiday — {board.data.holiday.reason}.</Notice> : null}
      {board.error ? <ErrorNote message={board.error} onRetry={() => void board.refresh()} /> : null}
      {board.loading && !board.data ? <Spinner label="Checking the rooms…" /> : null}

      {board.data && building ? (
        <>
          <PulseCounters available={board.data.summary.available} occupied={board.data.summary.occupied} total={board.data.summary.total} />

          <Card
            title={floorLevel ? `${building.name} — Floor ${floorLevel}` : building.name}
            subtitle={floorLevel ? `Rooms ${building.code}${floorLevel}1 onwards` : `${building.roomCount} rooms over ${building.floors.length} floors`}
          >
            {board.data.rooms.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {board.data.rooms.map(room => (
                  <RoomTile key={room.id} room={room} />
                ))}
              </div>
            ) : (
              <EmptyState title="No rooms here yet" description="The office has not added rooms to this floor." />
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
