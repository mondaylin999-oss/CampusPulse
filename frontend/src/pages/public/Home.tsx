import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Building2, Bus, CalendarClock, Clock, DoorOpen, Search } from "lucide-react";
import { api, type CampusPulseSummary } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { ErrorNote, Notice, Spinner } from "@/components/ui";

export default function Home() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const { data, loading, error, refresh } = useApiData<CampusPulseSummary>(() => api.get<CampusPulseSummary>("/rooms/pulse"), [], { pollMs: 60_000 });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const room = query.trim();
    if (!room) return;
    navigate(/^\d{3}$/.test(room) ? `/rooms/${room}` : `/find?search=${encodeURIComponent(room)}`);
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-card">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary-container/70 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-container px-3 py-1.5 text-[12px] font-semibold text-on-primary-container">
              <Clock className="h-3.5 w-3.5" />
              <span className="tabular">Live · {data?.moment.serverTimeLabel ?? "University room finder"}</span>
            </div>
            <h1 className="mt-4 max-w-2xl text-[30px] font-bold leading-[1.08] tracking-[-0.035em] text-on-surface sm:text-[40px]">
              Find a room before you start walking.
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
              Check every classroom against the live university timetable. No account is needed.
            </p>

            <form onSubmit={search} className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-variant" />
                <input
                  className="input h-12 w-full bg-surface-container-lowest pl-11 text-[16px] shadow-sm"
                  inputMode="numeric"
                  placeholder="Enter a room number, e.g. 325"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  aria-label="Search for a room by number"
                />
              </label>
              <button className="btn btn-primary h-12 justify-center px-6" type="submit">Check room</button>
            </form>
          </div>

          <div className="rounded-2xl border border-secondary/25 bg-secondary-container/55 p-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-on-secondary-container">Available now</p>
            <div className="mt-2 flex items-end gap-3">
              <span className="tabular text-[52px] font-bold leading-none text-secondary">{data?.available ?? "—"}</span>
              <span className="pb-1 text-[14px] text-on-secondary-container">of {data?.total ?? "—"} rooms</span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-secondary/20 pt-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-on-secondary-container"><span className="h-2.5 w-2.5 rounded-full bg-error" />{data?.occupied ?? "—"} occupied</span>
              <Link href="/find" className="inline-flex items-center gap-1 font-bold text-secondary hover:underline">View all <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner label="Reading the timetable…" /> : null}
      {data?.holiday ? <Notice tone="warning">University holiday today — {data.holiday.reason}. No classes are scheduled.</Notice> : null}

      <section>
        <div className="mb-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-primary">Start here</p>
          <h2 className="mt-1 text-[22px] font-bold text-on-surface">What do you need?</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/find" className="group card flex min-h-32 items-center gap-4 border-secondary/35 p-5 transition hover:-translate-y-0.5 hover:shadow-raised">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-on-secondary"><DoorOpen className="h-7 w-7" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold text-on-surface">Find an available room</span>
              <span className="mt-1 block text-[13px] text-on-surface-variant">Filter by building, floor, or how long you need it.</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-secondary transition-transform group-hover:translate-x-1" />
          </Link>

          <Link href="/bus" className="group card flex min-h-32 items-center gap-4 border-tertiary/35 p-5 transition hover:-translate-y-0.5 hover:shadow-raised">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-tertiary text-on-tertiary"><Bus className="h-7 w-7" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold text-on-surface">School transport</span>
              <span className="mt-1 block text-[13px] text-on-surface-variant">Browse transport ways, contacts, pickup nodes, and fees.</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-tertiary transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {data ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-[20px] font-bold text-on-surface">Rooms you can use now</h2>
              <p className="mt-0.5 text-[13px] text-on-surface-variant">A quick selection with the longest free time first.</p>
            </div>
            <Link href="/find" className="btn btn-ghost h-9 text-[13px]">See every room <ArrowRight className="h-4 w-4" /></Link>
          </div>

          <div className="p-4 sm:p-5">
            {data.sample.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.sample.map(room => (
                  <li key={room.roomNumber}>
                    <Link href={`/rooms/${room.roomNumber}`} className="group flex min-h-36 flex-col rounded-xl border border-secondary/30 bg-secondary-container/20 p-4 transition hover:border-secondary/60 hover:bg-secondary-container/35">
                      <div className="flex items-start justify-between gap-3">
                        <span>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Room</span>
                          <span className="tabular block text-[28px] font-bold leading-none text-on-surface">{room.roomNumber}</span>
                        </span>
                        <span className="chip bg-secondary-container text-on-secondary-container normal-case tracking-normal"><span className="h-2 w-2 rounded-full bg-secondary" />Available</span>
                      </div>
                      <p className="mt-4 text-[15px] font-bold text-secondary">Free for {room.freeForLabel}</p>
                      <div className="mt-auto flex items-end justify-between gap-3 pt-2 text-[12px] text-on-surface-variant">
                        <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{room.buildingName} · Floor {room.floorLevel}</span>
                        {room.nextAt ? <span className="tabular inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />Next {room.nextAt}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-5 text-center text-[14px] text-on-surface-variant">Every room is in use right now. Check again in a few minutes.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
