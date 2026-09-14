// ===========================================================================
//  BookRoom.tsx — "Make a booking", on the room page.
//
//  WHAT A VISITOR SEES DEPENDS ON WHO THEY ARE, and the server decides — the
//  page asks /bookings/rules rather than guessing from the role, so there is
//  one answer to "may I book?" and the button can never offer something the
//  API would refuse:
//
//     staff (agent) / office   the form
//     signed in, not staff     an explanation of who may book
//     signed out               the same, plus a way to log in
//
//  The form asks for a start time and a NUMBER OF HOURS rather than an end
//  time, because that is how the need actually arrives — "I want this room for
//  two hours" — and it makes an invalid range impossible to type.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { CalendarPlus, Info, LogIn } from "lucide-react";
import { api, ApiError, minutesToClock, type BookingRules, type RoomDetail } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Button, Card, Field, Input, Notice, Select } from "@/components/ui";

/** The lengths people actually book for. */
const HOURS = [0.5, 1, 1.5, 2, 3, 4];

export function BookRoom({ room, moment, onBooked }: { room: RoomDetail["room"]; moment: RoomDetail["moment"]; onBooked: () => void }) {
  const rules = useApiData<BookingRules>(() => api.get("/bookings/rules"), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  // Default to today at the next whole hour — the commonest case, one tap away.
  const [form, setForm] = useState({
    onDate: moment.dateKey,
    start: minutesToClock(Math.min(23 * 60, Math.ceil((moment.isToday ? moment.minute : 9 * 60) / 60) * 60)),
    hours: 1,
    purpose: "",
    attendees: "",
  });

  if (!rules.data) return null;

  // ---- not allowed: explain, never show a button that would fail ----------
  if (!rules.data.mayBook) {
    return (
      <Card title="Need this room?" subtitle="Booking is for university staff.">
        <p className="text-[14px] leading-relaxed text-on-surface-variant">
          Rooms are held by staff accounts — departmental offices, society officers and lab technicians. Everyone else is welcome
          to use any room the board shows as free; there is nothing to book.
        </p>
        {!rules.data.signedIn ? (
          <Link href="/login" className="btn btn-ghost mt-3">
            <LogIn className="h-4 w-4" /> Staff log in
          </Link>
        ) : (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-on-surface-variant">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            If you need to hold rooms, ask the university office to give your account the booking role.
          </p>
        )}
      </Card>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    const startMinute = Number(form.start.split(":")[0]) * 60 + Number(form.start.split(":")[1]);
    try {
      await api.post("/bookings", {
        roomNumber: room.roomNumber,
        onDate: form.onDate,
        startMinute,
        endMinute: startMinute + form.hours * 60,
        purpose: form.purpose.trim() || undefined,
        attendees: form.attendees ? Number(form.attendees) : undefined,
      });
      setNote({ tone: "rooms", text: `Room ${room.roomNumber} is yours on ${form.onDate}, ${form.start} for ${form.hours} hour(s).` });
      setForm({ ...form, purpose: "", attendees: "" });
      setOpen(false);
      onBooked();
    } catch (caught) {
      // The server says exactly WHAT is in the way ("09:00-10:00 First Year
      // CS"), which is far more useful than "unavailable".
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "The booking could not be made." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Book this room"
      subtitle={`Up to ${rules.data.limits.maxMinutes / 60} hours at a time, up to ${rules.data.limits.maxDaysAhead} days ahead.`}
      accent="bus"
      actions={
        <Button variant={open ? "ghost" : "bus"} onClick={() => setOpen(!open)}>
          <CalendarPlus className="h-4 w-4" /> {open ? "Not now" : "Make a booking"}
        </Button>
      }
    >
      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {open ? (
        <form className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submit}>
          <Field label="Date">
            <Input type="date" value={form.onDate} onChange={event => setForm({ ...form, onDate: event.target.value })} required />
          </Field>
          <Field label="From">
            <Input type="time" value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} required />
          </Field>
          <Field label="For how long">
            <Select value={form.hours} onChange={event => setForm({ ...form, hours: Number(event.target.value) })}>
              {HOURS.map(hours => (
                <option key={hours} value={hours}>
                  {hours === 0.5 ? "30 minutes" : `${hours} hour${hours === 1 ? "" : "s"}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="People" hint={`Room seats ${room.capacity}.`}>
            <Input
              type="number"
              min={1}
              max={room.capacity}
              value={form.attendees}
              onChange={event => setForm({ ...form, attendees: event.target.value })}
              placeholder="optional"
            />
          </Field>
          <Field label="What for" className="sm:col-span-2 lg:col-span-3">
            <Input
              value={form.purpose}
              onChange={event => setForm({ ...form, purpose: event.target.value })}
              placeholder="Staff meeting, society rehearsal, make-up class…"
              maxLength={160}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="bus" busy={busy} className="w-full">
              Hold the room
            </Button>
          </div>
          <p className="text-[12px] text-on-surface-variant sm:col-span-2 lg:col-span-4">
            Everyone will see this room as occupied for that window, so please give it back if your plans change.
          </p>
        </form>
      ) : null}
    </Card>
  );
}
