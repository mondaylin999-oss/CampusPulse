// ===========================================================================
//  Home.tsx — the front door, for a visitor with no account.
//
//  The brief for this page is "do not overload it". So it holds exactly four
//  things, in the order a student standing in a corridor needs them:
//     1. how many rooms are free RIGHT NOW
//     2. a box to type a room number into
//     3. the two big actions: Find a Room, School Bus
//     4. a few rooms that are free, so the answer is on screen already
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Bus, Clock, Search } from "lucide-react";
import { api, type CampusPulseSummary } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { PulseCounters } from "@/components/rooms";
import { Card, ErrorNote, Notice, Spinner } from "@/components/ui";

export default function Home() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");

  // Polled, because the whole promise of this page is that it is current.
  const { data, loading, error, refresh } = useApiData<CampusPulseSummary>(() => api.get<CampusPulseSummary>("/rooms/pulse"), [], { pollMs: 60_000 });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const room = query.trim();
    if (!room) return;
    // Three digits is a room; anything shorter is a filter on the board.
    navigate(/^\d{3}$/.test(room) ? `/rooms/${room}` : `/find?search=${encodeURIComponent(room)}`);
  };

  return (
    <div className="space-y-stack-md">
      {/* ---------- headline ---------- */}
      <section className="card overflow-hidden">
        <div className="bg-primary px-5 py-6 text-on-primary sm:px-8 sm:py-8">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider opacity-80">
            <Clock className="h-4 w-4" />
            <span className="tabular">{data?.moment.serverTimeLabel ?? "—"}</span>
          </p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-headline-lg">
            Need an empty classroom?
          </h1>
          <p className="mt-1 max-w-xl text-[14px] opacity-80">
            Every room's status is worked out from the university timetable and the clock — no login, no waiting, no walking
            the corridors.
          </p>

          <form onSubmit={search} className="mt-5 flex gap-2">
            <input
              className="input h-11 flex-1 bg-surface-container-lowest"
              inputMode="numeric"
              placeholder="Room number, e.g. 325"
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label="Search for a room by number"
            />
            <button className="btn btn-rooms h-11 px-5" type="submit">
              <Search className="h-4 w-4" /> Check
            </button>
          </form>
        </div>
      </section>

      {/* ---------- the two big actions ---------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/find" className="card card-pad flex items-center justify-between gap-3 border-secondary/40 hover:bg-surface-container-low">
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-on-secondary">
              <Search className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold text-on-surface">Find Available Room</span>
              <span className="block text-[12px] text-on-surface-variant">Free now, or free for the next 2 hours</span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-on-surface-variant" />
        </Link>

        <Link href="/bus" className="card card-pad flex items-center justify-between gap-3 border-tertiary/40 hover:bg-surface-container-low">
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-tertiary text-on-tertiary">
              <Bus className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold text-on-surface">School Bus</span>
              <span className="block text-[12px] text-on-surface-variant">Transport ways, pickup nodes, contacts and monthly fees</span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-on-surface-variant" />
        </Link>
      </div>

      {/* ---------- live counts ---------- */}
      {error ? <ErrorNote message={error} onRetry={() => void refresh()} /> : null}
      {loading && !data ? <Spinner label="Reading the timetable…" /> : null}

      {data ? (
        <>
          {data.holiday ? <Notice tone="warning">University holiday today — {data.holiday.reason}. No classes are scheduled.</Notice> : null}

          <PulseCounters available={data.available} occupied={data.occupied} total={data.total} />

          <Card
            title="Free right now"
            subtitle={`${data.moment.dateLabel} · ${data.moment.clock}`}
            actions={
              <Link href="/find" className="btn btn-ghost h-9 text-[13px]">
                See all
              </Link>
            }
          >
            {data.sample.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.sample.map(room => (
                  <li key={room.roomNumber}>
                    <Link href={`/rooms/${room.roomNumber}`} className="flex items-center justify-between gap-3 rounded-lg border border-secondary/40 px-3 py-2.5 hover:bg-surface-container-low">
                      <span>
                        <span className="tabular block text-[17px] font-bold text-on-surface">{room.roomNumber}</span>
                        <span className="block text-[11px] text-on-surface-variant">{room.buildingName}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[12px] font-semibold text-secondary">{room.freeForLabel}</span>
                        {room.nextAt ? <span className="tabular block text-[11px] text-on-surface-variant">until {room.nextAt}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-on-surface-variant">Every room is in use at the moment. Try again in a few minutes.</p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
