import { DAY_SHORT, type RoomWeek } from "@/lib/api";

const PERIODS = [
  { start: 510, end: 570, label: "8:30–9:30" },
  { start: 580, end: 640, label: "9:40–10:40" },
  { start: 650, end: 710, label: "10:50–11:50" },
  { start: 760, end: 820, label: "12:40–1:40" },
  { start: 830, end: 890, label: "1:50–2:50" },
  { start: 900, end: 960, label: "3:00–4:00" },
] as const;

export function WeekGrid({ week, todayDayOfWeek }: { week: RoomWeek; todayDayOfWeek?: number }) {
  const weekdays = [1, 2, 3, 4, 5].map(dayOfWeek => week.days.find(day => day.dayOfWeek === dayOfWeek) ?? { dayOfWeek, sessions: [] });

  return <div className="overflow-x-auto">
    <table className="data-table min-w-[820px] table-fixed">
      <thead><tr><th className="w-32">Class period</th>{weekdays.map(day => <th key={day.dayOfWeek} className={`text-center ${day.dayOfWeek === todayDayOfWeek ? "text-secondary" : ""}`}>{DAY_SHORT[day.dayOfWeek]}{day.dayOfWeek === todayDayOfWeek ? <span className="ml-1 text-[9px] uppercase">Today</span> : null}</th>)}</tr></thead>
      <tbody>{PERIODS.map((period, index) => <tr key={period.start}>
        <th className="text-left"><span className="block text-[12px]">Period {index + 1}</span><span className="tabular text-[11px] font-normal text-on-surface-variant">{period.label}</span></th>
        {weekdays.map(day => {
          const session = day.sessions.find(item => item.startMinute < period.end && item.endMinute > period.start);
          return <td key={day.dayOfWeek} className={`h-20 text-center ${day.dayOfWeek === todayDayOfWeek ? "bg-secondary-container/10" : ""}`}>
            {session ? <div className="rounded-lg border border-error/30 bg-error-container p-2 text-on-error-container" title={`${session.startTime}–${session.endTime}`}>
              <p className="text-[12px] font-bold">{session.batchCode ?? session.batchName ?? "Occupied"}</p>
              <p className="mt-0.5 text-[10px] leading-tight">{session.subjectCode ?? session.subjectName ?? session.title ?? "Scheduled class"}</p>
            </div> : <span className="inline-flex rounded-full bg-secondary-container px-2 py-1 text-[10px] font-semibold text-on-secondary-container">Available</span>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
    <p className="mt-2 text-[11px] text-on-surface-variant">The university uses these six fixed periods from Monday to Friday. Red cells are scheduled; green cells are available.</p>
  </div>;
}