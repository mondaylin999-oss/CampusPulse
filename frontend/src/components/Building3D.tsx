import { useRef, useState, type PointerEvent } from "react";
import { useLocation } from "wouter";
import { Rotate3D } from "lucide-react";
import { ROOM_KIND_LABELS, type RoomCard } from "@/lib/api";

const LIVE_ROOM_KINDS = new Set(["lecture", "lab", "seminar", "studio"]);

export function Building3D({ name, rooms }: { name: string; rooms: RoomCard[] }) {
  const [, navigate] = useLocation();
  const [rotation, setRotation] = useState({ x: -7, y: -18 });
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const floors = [...new Set(rooms.map(room => room.floorLevel))].sort((a, b) => b - a);

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
      <div><h3>{name} · 3D room view</h3><p>Drag to rotate. Select a room to open its details.</p></div>
      <span><Rotate3D className="h-4 w-4" /> Drag</span>
    </div>
    <div
      className="building-3d-stage"
      onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, rx: rotation.x, ry: rotation.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={move}
      onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <div className="building-3d-model" style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}>
        {floors.map((floor, index) => {
          const floorRooms = rooms.filter(room => room.floorLevel === floor).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
          return <div className="building-3d-floor" key={floor} style={{ transform: `translateY(${index * 54 - 135}px) translateZ(${index * 3}px)` }}>
            <div className="building-3d-floor-label">F{floor}</div>
            <div className="building-3d-windows">
              {floorRooms.map(room => {
                const neutral = !LIVE_ROOM_KINDS.has(room.kind);
                const state = neutral ? "neutral" : room.availability.status === "available" ? "available" : "occupied";
                return <button
                  key={room.id}
                  type="button"
                  className={`building-3d-room building-3d-room-${state}`}
                  title={neutral
                    ? `Room ${room.roomNumber} · ${room.name ?? ROOM_KIND_LABELS[room.kind]} · neutral category`
                    : `Room ${room.roomNumber} · ${ROOM_KIND_LABELS[room.kind]} · ${room.availability.status}`}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => navigate(`/rooms/${room.roomNumber}`)}
                >{room.roomNumber}</button>;
              })}
            </div>
          </div>;
        })}
        <div className="building-3d-roof" />
      </div>
    </div>
    <div className="building-3d-legend">
      <span><i className="bg-emerald-500" />Available lecture room / lab</span><span><i className="bg-red-500" />Occupied lecture room / lab</span><span><i className="bg-slate-400" />Department / library / office</span>
    </div>
  </section>;
}
