import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Building2, Layers3, Rotate3D, Users } from "lucide-react";
import { ROOM_KIND_LABELS, type RoomCard } from "@/lib/api";
import { AvailabilityLine, StatusPill } from "@/components/rooms";

const LIVE_ROOM_KINDS = new Set(["lecture", "lab", "seminar", "studio"]);
const START_ROTATION = { x: -7, y: -18 };

type Props = {
  name: string;
  rooms: RoomCard[];
  selectedFloor: number | null;
  onFloorChange: (floor: number | null) => void;
};

export function Building3D({ name, rooms, selectedFloor, onFloorChange }: Props) {
  const [, navigate] = useLocation();
  const [rotation, setRotation] = useState(START_ROTATION);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const floors = useMemo(() => [...new Set(rooms.map(room => room.floorLevel))].sort((a, b) => b - a), [rooms]);
  const visibleFloors = selectedFloor === null ? floors : floors.filter(floor => floor === selectedFloor);
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;

  useEffect(() => {
    setSelectedRoomId(null);
    setRotation(START_ROTATION);
  }, [name]);

  useEffect(() => {
    if (selectedRoom && selectedFloor !== null && selectedRoom.floorLevel !== selectedFloor) setSelectedRoomId(null);
  }, [selectedFloor, selectedRoom]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setRotation({
      x: Math.max(-25, Math.min(12, drag.current.rx - (event.clientY - drag.current.y) * 0.12)),
      y: drag.current.ry + (event.clientX - drag.current.x) * 0.2,
    });
  };

  return <section className="building-3d-shell" aria-label={`Interactive 3D view of ${name}`}>
    <div className="building-3d-photo" aria-hidden="true" />
    <div className="building-3d-head">
      <div>
        <p className="building-3d-eyebrow"><Building2 className="h-3.5 w-3.5" /> Interactive building</p>
        <h3>{name}</h3>
        <p>Choose a floor, rotate the building, then select a room.</p>
      </div>
      <button type="button" onClick={() => setRotation(START_ROTATION)}><Rotate3D className="h-4 w-4" /> Reset view</button>
    </div>

    <div className="building-3d-floor-picker" aria-label="Choose floor for 3D view">
      <Layers3 className="h-4 w-4" />
      <button type="button" className={selectedFloor === null ? "active" : ""} onClick={() => onFloorChange(null)}>All floors</button>
      {[...floors].reverse().map(floor => (
        <button type="button" key={floor} className={selectedFloor === floor ? "active" : ""} onClick={() => onFloorChange(floor)}>Floor {floor}</button>
      ))}
    </div>

    <div className="building-3d-workspace">
      <div className="building-3d-canvas">
        <div
          className="building-3d-stage"
          onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, rx: rotation.x, ry: rotation.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={move}
          onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current = null; }}
        >
          <div className="building-3d-model" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}>
            {visibleFloors.map((floor, index) => {
              const floorRooms = rooms.filter(room => room.floorLevel === floor).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
              const offset = index * 54 - ((visibleFloors.length - 1) * 27);
              return <div className="building-3d-floor" key={floor} style={{ transform: `translateY(${offset}px) translateZ(${index * 3}px)` }}>
                <div className="building-3d-floor-label">F{floor}</div>
                <div className="building-3d-windows">
                  {floorRooms.map(room => {
                    const neutral = !LIVE_ROOM_KINDS.has(room.kind);
                    const state = neutral ? "neutral" : room.availability.status === "available" ? "available" : "occupied";
                    return <button
                      key={room.id}
                      type="button"
                      className={`building-3d-room building-3d-room-${state} ${selectedRoomId === room.id ? "building-3d-room-selected" : ""}`}
                      aria-pressed={selectedRoomId === room.id}
                      title={`Room ${room.roomNumber} · ${ROOM_KIND_LABELS[room.kind]}`}
                      onPointerDown={event => event.stopPropagation()}
                      onClick={() => setSelectedRoomId(room.id)}
                    >{room.roomNumber}</button>;
                  })}
                </div>
              </div>;
            })}
            <div className="building-3d-roof" style={{ top: `${-((visibleFloors.length - 1) * 27 + 58)}px` }} />
          </div>
        </div>
        <div className="building-3d-legend">
          <span><i className="bg-emerald-500" />Available</span><span><i className="bg-red-500" />Occupied</span><span><i className="bg-slate-400" />Department / library / office</span>
        </div>
      </div>

      <aside className="building-3d-inspector" aria-live="polite">
        {selectedRoom ? <>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Selected room</p><p className="tabular mt-1 text-[30px] font-bold leading-none">{selectedRoom.roomNumber}</p></div>
            <StatusPill availability={selectedRoom.availability} />
          </div>
          <p className="mt-4 text-[14px] leading-snug"><AvailabilityLine availability={selectedRoom.availability} /></p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
            <div><dt>Category</dt><dd>{ROOM_KIND_LABELS[selectedRoom.kind]}</dd></div>
            <div><dt>Location</dt><dd>Floor {selectedRoom.floorLevel}</dd></div>
            <div><dt>Capacity</dt><dd><Users className="h-3.5 w-3.5" /> {selectedRoom.capacity} seats</dd></div>
            <div><dt>Building</dt><dd>{selectedRoom.buildingName}</dd></div>
          </dl>
          {selectedRoom.name ? <p className="mt-3 rounded-lg bg-surface-container px-3 py-2 text-[12px] font-semibold">{selectedRoom.name}</p> : null}
          <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => navigate(`/rooms/${selectedRoom.roomNumber}`)}>Open room details <ArrowRight className="h-4 w-4" /></button>
        </> : <div className="building-3d-empty">
          <Building2 className="h-8 w-8" />
          <p>Select a room on the building</p>
          <span>Its live status, category, capacity and next session will appear here.</span>
        </div>}
      </aside>
    </div>
  </section>;
}
