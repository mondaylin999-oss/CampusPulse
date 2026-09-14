// ===========================================================================
//  WhenPicker.tsx — "show me the campus at THIS moment".
//
//  Every status on this site answers a question about one instant. Usually
//  that instant is now, but not always: a student planning tomorrow morning,
//  or checking whether a room is free after their 3pm lecture, is asking about
//  a different one. The backend has taken ?date= and ?minute= from the start;
//  this is the control that finally exposes it.
//
//  Deliberately a pair of native <input type="date"> / <input type="time">
//  rather than a custom calendar: on a phone they open the platform's own
//  pickers, which are better than anything worth hand-rolling here, and they
//  are keyboard-accessible for free.
// ===========================================================================

import { CalendarDays, RotateCcw } from "lucide-react";
import { clockToMinutes, minutesToClock } from "@/lib/api";

export type When = {
  /** "YYYY-MM-DD", or "" for today. */
  date: string;
  /** Minutes since midnight, or null for "right now". */
  minute: number | null;
};

export const NOW: When = { date: "", minute: null };

export const isNow = (when: When) => !when.date && when.minute === null;

/** The query fragment the room endpoints understand. */
export const whenQuery = (when: When) => ({
  date: when.date || undefined,
  minute: when.minute ?? undefined,
});

export function WhenPicker({ value, onChange, className = "" }: { value: When; onChange: (next: When) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <label className="min-w-[140px] flex-1">
        <span className="field-label">Date</span>
        <input
          className="input"
          type="date"
          value={value.date}
          onChange={event => onChange({ ...value, date: event.target.value })}
          aria-label="Show the campus on this date"
        />
      </label>

      <label className="min-w-[110px] flex-1">
        <span className="field-label">Time</span>
        <input
          className="input"
          type="time"
          // An empty box means "now", so nothing is shown until a time is set.
          value={value.minute === null ? "" : minutesToClock(value.minute)}
          onChange={event => {
            const parsed = clockToMinutes(event.target.value);
            onChange({ ...value, minute: parsed });
          }}
          aria-label="Show the campus at this time"
        />
      </label>

      {isNow(value) ? (
        <p className="flex h-[42px] items-center gap-1.5 px-1 text-[12px] text-on-surface-variant">
          <CalendarDays className="h-3.5 w-3.5" /> Showing right now
        </p>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => onChange(NOW)}>
          <RotateCcw className="h-4 w-4" /> Back to now
        </button>
      )}
    </div>
  );
}
