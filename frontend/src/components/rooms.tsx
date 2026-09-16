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
import { Clock, DoorClosed, DoorOpen } from "lucide-react";
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
  available: "border-secondary/50",
  soon: "border-warning/50",
  occupied: "border-error/40",
  closed: "border-outline-variant",
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
  return (
    <Link
      href={`/rooms/${room.roomNumber}`}
      className={`card card-pad flex flex-col gap-2 border-2 transition-colors hover:bg-surface-container-low ${TONE_BORDER[tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tabular text-[22px] font-bold leading-none text-on-surface">{room.roomNumber}</p>
          <p className="mt-1 truncate text-[12px] text-on-surface-variant">
            {room.name ?? ROOM_KIND_LABELS[room.kind]} · {room.buildingName} · floor {room.floorLevel}
          </p>
        </div>
        <StatusPill availability={room.availability} />
      </div>
      <p className="text-[13px] leading-snug">
        <AvailabilityLine availability={room.availability} />
      </p>
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
