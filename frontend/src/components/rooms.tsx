// ===========================================================================
//  rooms.tsx — the handful of shapes the room screens repeat.
//
//  The status indicator is the single most important thing on this site: a
//  student glancing at their phone while walking must read it in one look. So
//  it is colour AND a dot AND a word — never colour alone, which would be
//  invisible to a colour-blind reader and unreadable in bright sunlight.
//
//     🟢 AVAILABLE      free right now
//     🟡 ENDING SOON    free, but a class starts within 15 minutes
//     🔴 OCCUPIED       a class is in the room now
//     ⚫ CLOSED         the room itself is out of use today
// ===========================================================================

import { Link } from "wouter";
import { ArrowRight, Building2, Clock, DoorClosed, DoorOpen, Users } from "lucide-react";
import { ROOM_KIND_LABELS, type EffectiveSession, type RoomAvailability, type RoomCard } from "@/lib/api";

type Tone = "available" | "soon" | "occupied" | "closed";

function toneOf(availability: RoomAvailability): Tone {
  if (availability.status === "closed") return "closed";
  if (availability.status === "occupied") return "occupied";
  return availability.endingSoon ? "soon" : "available";
}

const TONE_TEXT: Record<Tone, string> = {
  available: "Available",
  soon: "Free briefly",
  occupied: "Occupied",
  closed: "Closed",
};

const TONE_CHIP: Record<Tone, string> = {
  available: "bg-secondary-container text-on-secondary-container",
  soon: "bg-warning-container text-on-warning-container",
  occupied: "bg-error-container text-on-error-container",
  closed: "bg-surface-container-highest text-on-surface-variant",
};

const TONE_DOT: Record<Tone, string> = {
  available: "bg-secondary",
  soon: "bg-warning",
  occupied: "bg-error",
  closed: "bg-outline",
};

const TONE_BORDER: Record<Tone, string> = {
  available: "border-l-secondary",
  soon: "border-l-warning",
  occupied: "border-l-error",
  closed: "border-l-outline",
};

export function StatusPill({ availability }: { availability: RoomAvailability }) {
  const tone = toneOf(availability);
  return (
    <span className={`chip ${TONE_CHIP[tone]} normal-case tracking-normal`}>
      <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {TONE_TEXT[tone]}
    </span>
  );
}

/** The one line under the room number that answers "so, can I use it?". */
export function AvailabilityLine({ availability }: { availability: RoomAvailability }) {
  const { status, freeAtTime, freeForLabel, next, current } = availability;

  if (status === "closed") return <span className="text-on-surface-variant">{current?.note ?? "Out of use today"}</span>;

  if (status === "occupied")
    return (
      <span className="text-on-surface-variant">
        {current?.label ?? "In use"} · <span className="tabular font-semibold text-on-surface">free at {freeAtTime}</span>
      </span>
    );

  return (
    <span className="text-on-surface-variant">
      <span className="font-semibold text-secondary">Free for {freeForLabel}</span>
      {next ? <> · next {next.label} at <span className="tabular">{next.startTime}</span></> : <> · nothing else booked today</>}
    </span>
  );
}

/** One room on the floor grid / search results. The whole tile is the link. */
export function RoomTile({ room }: { room: RoomCard }) {
  const tone = toneOf(room.availability);
  const { availability } = room;
  return (
    <Link
      href={`/rooms/${room.roomNumber}`}
      aria-label={`Room ${room.roomNumber}, ${TONE_TEXT[tone]}`}
      className={`card group flex min-h-56 flex-col overflow-hidden border-l-4 p-4 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-raised ${TONE_BORDER[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">Room</p>
          <p className="tabular mt-0.5 text-[32px] font-bold leading-none tracking-tight text-on-surface">{room.roomNumber}</p>
        </div>
        <StatusPill availability={room.availability} />
      </div>

      <div className="mt-4 flex-1">
        {availability.status === "available" ? (
          <>
            <p className={`text-[17px] font-bold ${tone === "soon" ? "text-warning" : "text-secondary"}`}>
              Available for {availability.freeForLabel}
            </p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-on-surface-variant">
              {availability.next ? <>Next: {availability.next.label} at <span className="tabular font-semibold text-on-surface">{availability.next.startTime}</span></> : "Nothing else scheduled today"}
            </p>
          </>
        ) : availability.status === "occupied" ? (
          <>
            <p className="text-[17px] font-bold text-error">Available at <span className="tabular">{availability.freeAtTime}</span></p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-on-surface-variant">
              Now: {availability.current?.label ?? "In use"}
              {availability.current ? <> · <span className="tabular">{availability.current.startTime}–{availability.current.endTime}</span></> : null}
            </p>
          </>
        ) : (
          <>
            <p className="text-[17px] font-bold text-on-surface">Unavailable today</p>
            <p className="mt-1 text-[13px] text-on-surface-variant">{availability.current?.note ?? "This room is temporarily out of use."}</p>
          </>
        )}
      </div>

      {room.name ? <p className="mb-2 truncate text-[12px] font-semibold text-on-surface">{room.name}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-outline-variant pt-3 text-[11px] font-semibold text-on-surface-variant">
        <span className="rounded-full bg-primary-container px-2 py-1 text-on-primary-container">{ROOM_KIND_LABELS[room.kind]}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-1">
          <Building2 className="h-3 w-3" /> Building {room.buildingCode} · Floor {room.floorLevel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-1">
          <Users className="h-3 w-3" /> {room.capacity}
        </span>
        <ArrowRight className="ml-auto h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}

/** A row in "today in this room" — the whole day, in order. */
export function SessionRow({ session, nowMinute, onGiveBack }: { session: EffectiveSession; nowMinute?: number; onGiveBack?: (bookingId: number) => void }) {
  const live = nowMinute !== undefined && session.startMinute <= nowMinute && nowMinute < session.endMinute;
  const done = nowMinute !== undefined && session.endMinute <= nowMinute;
  const changed = session.origin !== "timetable";
  const booked = session.origin === "booking";

  return (
    <li
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        live ? "border-error/50 bg-error-container/30" : done ? "border-outline-variant opacity-60" : booked ? "border-tertiary/40" : "border-outline-variant"
      }`}
    >
      <span className="tabular w-[92px] shrink-0 text-[13px] font-semibold text-on-surface">
        {session.startTime}–{session.endTime}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-on-surface">{session.label}</span>
        {session.teacher ? <span className="block truncate text-[12px] text-on-surface-variant">{session.teacher}</span> : null}
        {changed && session.note ? (
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              booked ? "bg-tertiary-container text-on-tertiary-container" : "bg-warning-container text-on-warning-container"
            }`}
          >
            {session.note}
          </span>
        ) : null}
      </span>
      {live ? (
        <span className="chip bg-error-container text-on-error-container normal-case tracking-normal">
          <Clock className="h-3 w-3" /> now
        </span>
      ) : null}
      {onGiveBack && session.bookingId ? (
        <button
          className="rounded px-2 py-1 text-[11px] font-semibold text-error hover:bg-error-container"
          onClick={() => onGiveBack(session.bookingId!)}
        >
          Give back
        </button>
      ) : null}
    </li>
  );
}

/** The green/red headline used on the home page and above the floor grid. */
export function PulseCounters({ available, occupied, total }: { available: number; occupied: number; total: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="card card-pad border-secondary/40 text-center">
        <p className="tabular text-[26px] font-bold leading-none text-secondary">{available}</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-[12px] font-semibold text-on-surface-variant">
          <DoorOpen className="h-3.5 w-3.5" /> Available
        </p>
      </div>
      <div className="card card-pad border-error/40 text-center">
        <p className="tabular text-[26px] font-bold leading-none text-error">{occupied}</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-[12px] font-semibold text-on-surface-variant">
          <DoorClosed className="h-3.5 w-3.5" /> Occupied
        </p>
      </div>
      <div className="card card-pad text-center">
        <p className="tabular text-[26px] font-bold leading-none text-on-surface">{total}</p>
        <p className="mt-1 text-[12px] font-semibold text-on-surface-variant">Rooms</p>
      </div>
    </div>
  );
}
