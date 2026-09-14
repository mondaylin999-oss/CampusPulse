// ===========================================================================
//  WeekGrid.tsx — one room's normal week as a calendar, not a list.
//
//  A list of "Monday: 09:00-10:00 …, 10:00-11:00 …" tells you what is booked.
//  A grid tells you what is FREE, because the gaps are visible as gaps — which
//  is the only question this site exists to answer.
//
//  Blocks are positioned from their own start and end minutes, so a 09:00-10:30
//  class really is one and a half rows tall rather than being rounded to the
//  hour.
// ===========================================================================

import { DAY_SHORT, minutesToClock, type RoomWeek } from "@/lib/api";

/** The window the grid draws. Anything outside it is clamped into view. */
const FIRST_HOUR = 7;
const LAST_HOUR = 20;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_unused, index) => FIRST_HOUR + index);
const SPAN = (LAST_HOUR - FIRST_HOUR) * 60;
const ROW_HEIGHT = 44; // px per hour

export function WeekGrid({ week, todayDayOfWeek }: { week: RoomWeek; todayDayOfWeek?: number }) {
  const height = (LAST_HOUR - FIRST_HOUR) * ROW_HEIGHT;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* ---------- day headings ---------- */}
        <div className="flex">
          <div className="w-12 shrink-0" />
          {week.days.map(day => {
            const today = day.dayOfWeek === todayDayOfWeek;
            return (
              <div
                key={day.dayOfWeek}
                className={`flex-1 pb-1 text-center text-[12px] font-bold ${today ? "text-secondary" : "text-on-surface-variant"}`}
              >
                {DAY_SHORT[day.dayOfWeek]}
                {today ? <span className="ml-1 text-[10px] font-semibold uppercase">today</span> : null}
              </div>
            );
          })}
        </div>

        {/* ---------- the grid itself ---------- */}
        <div className="flex" style={{ height }}>
          {/* hour rail */}
          <div className="relative w-12 shrink-0">
            {HOURS.slice(0, -1).map(hour => (
              <div
                key={hour}
                className="tabular absolute right-1 -translate-y-1/2 text-[10px] font-semibold text-on-surface-variant"
                style={{ top: ((hour - FIRST_HOUR) * 60 * height) / SPAN }}
              >
                {minutesToClock(hour * 60)}
              </div>
            ))}
          </div>

          {week.days.map(day => {
            const today = day.dayOfWeek === todayDayOfWeek;
            return (
              <div
                key={day.dayOfWeek}
                className={`relative flex-1 border-l border-outline-variant ${today ? "bg-secondary-container/20" : ""}`}
              >
                {/* hour lines */}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-surface-container-high"
                    style={{ top: ((hour - FIRST_HOUR) * 60 * height) / SPAN }}
                  />
                ))}

                {day.sessions.map(session => {
                  const top = ((session.startMinute - FIRST_HOUR * 60) / SPAN) * height;
                  const rawHeight = ((session.endMinute - session.startMinute) / SPAN) * height;
                  if (top > height || top + rawHeight < 0) return null; // wholly outside the drawn day
                  const clippedTop = Math.max(0, top);
                  return (
                    <div
                      key={session.id}
                      className="absolute inset-x-0.5 overflow-hidden rounded border border-error/30 bg-error-container px-1 py-0.5 text-[10px] leading-tight text-on-error-container"
                      style={{ top: clippedTop, height: Math.max(14, Math.min(height - clippedTop, rawHeight - (clippedTop - top))) }}
                      title={`${session.startTime}–${session.endTime} · ${[session.batchName, session.subjectName ?? session.title].filter(Boolean).join(" — ")}`}
                    >
                      <span className="tabular block font-bold">{session.startTime}</span>
                      <span className="block truncate">{session.batchCode ?? session.batchName ?? session.subjectCode ?? session.title ?? "Booked"}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-on-surface-variant">
          Shaded blocks are scheduled classes; everything white is free in the normal week. One-off changes are shown on the day itself, above.
        </p>
      </div>
    </div>
  );
}
