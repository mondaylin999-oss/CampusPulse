// ===========================================================================
//  RoomDetail.tsx — one room: what is in it now, when it frees up, what is
//  next, and the whole of today.
//
//  The address is spelled out (Room 325 -> Building 3, Floor 2, Room 5) so a
//  visitor who does not yet know the numbering learns it here.
// ===========================================================================

import { useRoute } from "wouter";
import { Link } from "wouter";
import { ArrowLeft, Building2, CalendarDays, MapPin, Users } from "lucide-react";
import { api, type RoomDetail as RoomDetailPayload, type RoomWeek } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { AvailabilityLine, SessionRow, StatusPill } from "@/components/rooms";
import { WeekGrid } from "@/components/WeekGrid";
import { BookRoom } from "@/components/BookRoom";
import { Card, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/ui";

export default function RoomDetail() {
  const [, params] = useRoute("/rooms/:roomNumber");
  const roomNumber = params?.roomNumber ?? "";

  const detail = useApiData<RoomDetailPayload>(() => api.get<RoomDetailPayload>(`/rooms/${roomNumber}`), [roomNumber], { pollMs: 60_000 });
  const week = useApiData<RoomWeek>(() => api.get<RoomWeek>(`/rooms/${roomNumber}/week`), [roomNumber]);

  if (detail.error) return <ErrorNote message={detail.error} onRetry={() => void detail.refresh()} />;
  if (!detail.data) return <Spinner label={`Checking room ${roomNumber}…`} />;

  const { room, availability, moment } = detail.data;

  return (
    <div className="space-y-stack-md">
      <Link href="/find" className="inline-flex items-center gap-1 text-[13px] font-semibold text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" /> Back to the room finder
      </Link>

      <PageHeader
        title={`Room ${room.roomNumber}`}
        subtitle={
          <span>
            {room.buildingName} (Building {room.buildingCode}) · Floor {room.floorLevel} · Room {room.position}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Only offered when the building is actually on the map — a link
                that leads to an empty map is worse than no link. */}
            {room.buildingLatitude && room.buildingLongitude ? (
              <Link href={`/buildings?view=map&building=${room.buildingCode}`} className="btn btn-ghost h-9 text-[13px]">
                <MapPin className="h-4 w-4" /> View on map
              </Link>
            ) : null}
            <StatusPill availability={availability} />
          </div>
        }
      />

      {/* ---------- the answer, in one card ---------- */}
      <Card accent={availability.status === "available" ? "rooms" : availability.status === "closed" ? "neutral" : "error"}>
        <p className="text-[17px] font-semibold leading-snug text-on-surface">
          <AvailabilityLine availability={availability} />
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-outline-variant px-3 py-2.5">
            <p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">Now</p>
            {availability.current ? (
              <>
                <p className="mt-1 text-[15px] font-semibold text-on-surface">{availability.current.label}</p>
                <p className="tabular text-[13px] text-on-surface-variant">
                  {availability.current.startTime} – {availability.current.endTime}
                  {availability.current.teacher ? ` · ${availability.current.teacher}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[15px] font-semibold text-secondary">Nobody is using it</p>
            )}
          </div>

          <div className="rounded-lg border border-outline-variant px-3 py-2.5">
            <p className="text-label font-semibold uppercase tracking-wider text-on-surface-variant">Next</p>
            {availability.next ? (
              <>
                <p className="mt-1 text-[15px] font-semibold text-on-surface">{availability.next.label}</p>
                <p className="tabular text-[13px] text-on-surface-variant">
                  {availability.next.startTime} – {availability.next.endTime}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[15px] font-semibold text-on-surface-variant">Nothing else today</p>
            )}
          </div>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> Seats {room.capacity}
          </span>
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> {room.kind}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> {moment.dateLabel} · {moment.clock}
          </span>
        </p>
        {room.notes ? <p className="mt-2 text-[13px] text-on-surface-variant">{room.notes}</p> : null}
      </Card>

      {/* ---------- booking ---------- */}
      <BookRoom room={room} moment={moment} onBooked={() => void detail.refresh()} />

      {/* ---------- today ---------- */}
      <Card title="Today in this room" subtitle={moment.dateLabel}>
        {availability.sessions.length ? (
          <ul className="space-y-2">
            {availability.sessions.map(session => (
              <SessionRow key={`${session.entryId ?? "x"}-${session.exceptionId ?? "x"}-${session.startMinute}`} session={session} nowMinute={moment.minute} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing scheduled today" description="This room is free all day." />
        )}
      </Card>

      {/* ---------- the normal week ---------- */}
      <Card title="Normal weekly timetable" subtitle="The gaps are the point — anything white is free in a normal week.">
        {week.loading && !week.data ? <Spinner /> : null}
        {week.data ? <WeekGrid week={week.data} todayDayOfWeek={moment.dayOfWeek} /> : null}
      </Card>

    </div>
  );
}
