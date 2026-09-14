// ===========================================================================
//  Buildings.tsx — browse the campus the way it is laid out: building, then
//  floor, then the six rooms on that floor.
//
//  This is the "I know roughly where I am" path, as opposed to Find a Room's
//  "anywhere will do". It mirrors the numbering: building 3 -> floor 2 -> the
//  rooms 321…326.
// ===========================================================================

import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { Building2, ChevronRight, LayoutGrid, Map as MapIcon } from "lucide-react";
import { api, type BuildingOverview, type RoomBoard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { PulseCounters, RoomTile } from "@/components/rooms";
import { CampusMap } from "@/components/CampusMap";
import { Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner } from "@/components/ui";

export default function Buildings() {
  // Arriving from a room page: /buildings?view=map&building=3 opens the map
  // already looking at that building, so "view on map" lands somewhere useful
  // instead of on whichever building happens to be first.
  const search = useSearch();
  const params = new URLSearchParams(search);
  const askedBuilding = Number(params.get("building"));
  const askedMap = params.get("view") === "map";

  const buildings = useApiData<BuildingOverview>(() => api.get("/rooms/buildings"), [], { pollMs: 60_000 });
  const [buildingCode, setBuildingCode] = useState<number | null>(Number.isFinite(askedBuilding) && askedBuilding > 0 ? askedBuilding : null);
  const [floorLevel, setFloorLevel] = useState<number | null>(null);
  // Which way to choose a building: the chips, or the campus map. Remembered
  // for this browser, because it is a lasting preference rather than a step.
  const [view, setView] = useState<"list" | "map">(() => {
    if (askedMap) return "map"; // the link asked for the map explicitly
    try {
      return localStorage.getItem("campuspulse_buildings_view") === "map" ? "map" : "list";
    } catch {
      return "list";
    }
  });

  const chooseView = (next: "list" | "map") => {
    setView(next);
    try {
      localStorage.setItem("campuspulse_buildings_view", next);
    } catch {
      /* private browsing — the choice then lasts for this page only */
    }
  };

  // Open the first building automatically — an empty screen helps nobody. The
  // same guard covers a link naming a building that does not exist (an old
  // bookmark, a hand-edited URL): fall back rather than render nothing.
  useEffect(() => {
    const known = buildings.data?.buildings ?? [];
    if (!known.length) return;
    if (buildingCode === null || !known.some(row => row.code === buildingCode)) setBuildingCode(known[0]!.code);
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
        actions={
          <div className="flex rounded-lg border border-outline-variant p-0.5" role="group" aria-label="Choose a view">
            {([
              { key: "list" as const, label: "List", icon: <LayoutGrid className="h-4 w-4" /> },
              { key: "map" as const, label: "Map", icon: <MapIcon className="h-4 w-4" /> },
            ]).map(option => (
              <button
                key={option.key}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  view === option.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
                onClick={() => chooseView(option.key)}
                aria-pressed={view === option.key}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {buildings.error ? <ErrorNote message={buildings.error} onRetry={() => void buildings.refresh()} /> : null}
      {buildings.loading && !buildings.data ? <Spinner /> : null}

      {/* ---------- building chooser: the map… ---------- */}
      {view === "map" ? (
        <Card title="Campus map" subtitle="Each pin carries the number of rooms free in that building right now. Tap one to see them.">
          <CampusMap
            buildings={buildings.data?.buildings ?? []}
            selectedCode={buildingCode}
            onSelect={code => {
              setBuildingCode(code);
              setFloorLevel(null);
            }}
          />
        </Card>
      ) : null}

      {/* ---------- …or the chips ---------- */}
      <div className={`flex flex-wrap gap-2 ${view === "map" ? "hidden" : ""}`}>
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
