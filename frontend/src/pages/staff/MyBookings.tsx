// ===========================================================================
//  staff/MyBookings.tsx — the rooms this account is holding.
//
//  For an agent these are their own; for the administrator it is every
//  upcoming booking on the campus, because the office needs to be able to free
//  a room somebody has walked away from. The server decides which list comes
//  back — this screen does not ask for one or the other.
//
//  Past bookings are kept and shown greyed: they are a record of who had the
//  room, which is the first question asked when two groups both turn up.
// ===========================================================================

import { useState } from "react";
import { Link } from "wouter";
import { CalendarCheck, Search, Undo2 } from "lucide-react";
import { api, ApiError, type RoomBookingRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner } from "@/components/ui";

export default function MyBookings() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useApiData<{ bookings: RoomBookingRow[] }>(() => api.get("/bookings"), []);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  const isAdmin = user?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const rows = data?.bookings ?? [];
  const live = rows.filter(row => row.booking.status !== "cancelled" && row.booking.onDate >= today);
  const past = rows.filter(row => row.booking.status === "cancelled" || row.booking.onDate < today);

  const giveBack = async (row: RoomBookingRow) => {
    if (!window.confirm(`Give room ${row.roomNumber} back on ${row.booking.onDate}, ${row.startTime}–${row.endTime}?`)) return;
    setBusy(row.booking.id);
    setNote(null);
    try {
      await api.delete(`/bookings/${row.booking.id}`);
      setNote({ tone: "rooms", text: `Room ${row.roomNumber} is free again.` });
      await refresh();
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not give the room back." });
    } finally {
      setBusy(null);
    }
  };

  const table = (list: RoomBookingRow[], muted = false) => (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Date</th>
            <th>Time</th>
            <th>What for</th>
            {isAdmin ? <th>Held by</th> : null}
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody className={muted ? "opacity-60" : ""}>
          {list.map(row => (
            <tr key={row.booking.id}>
              <td>
                <Link href={`/rooms/${row.roomNumber}`} className="tabular font-semibold hover:underline">
                  {row.roomNumber}
                </Link>
                <span className="ml-2 text-[12px] text-on-surface-variant">{row.buildingName}</span>
              </td>
              <td className="tabular">{row.booking.onDate}</td>
              <td className="tabular">
                {row.startTime}–{row.endTime}
              </td>
              <td>{row.booking.purpose ?? "—"}</td>
              {isAdmin ? <td>{row.ownerName ?? row.ownerUsername ?? "—"}</td> : null}
              <td>
                <Badge tone={row.booking.status === "cancelled" ? "error" : "bus"}>
                  {row.booking.status === "cancelled" ? "Given back" : "Held"}
                </Badge>
              </td>
              <td>
                <div className="flex justify-end">
                  {row.booking.status !== "cancelled" && row.booking.onDate >= today ? (
                    <Button variant="ghost" className="h-8 text-[12px]" busy={busy === row.booking.id} onClick={() => void giveBack(row)}>
                      <Undo2 className="h-3.5 w-3.5" /> Give back
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-stack-md">
      <PageHeader
        title={isAdmin ? "Room bookings" : "Rooms I am holding"}
        subtitle={isAdmin ? "Every upcoming booking on the campus." : "Give a room back as soon as your plans change — somebody else may need it."}
        actions={
          <Link href="/find" className="btn btn-ghost">
            <Search className="h-4 w-4" /> Find a room to book
          </Link>
        }
      />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner /> : null}

      <Card title="Coming up" subtitle={`${live.length} room${live.length === 1 ? "" : "s"} held`} accent="bus">
        {live.length ? (
          table(live)
        ) : (
          <EmptyState
            title="Nothing held"
            description="Open any free room and press “Make a booking”."
            action={
              <Link href="/find" className="btn btn-bus">
                <CalendarCheck className="h-4 w-4" /> Find a free room
              </Link>
            }
          />
        )}
      </Card>

      {past.length ? (
        <Card title="Finished and given back" subtitle="Kept as a record of who had the room.">
          {table(past, true)}
        </Card>
      ) : null}
    </div>
  );
}
