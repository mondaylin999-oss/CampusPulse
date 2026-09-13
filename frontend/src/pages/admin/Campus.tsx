// ===========================================================================
//  admin/Campus.tsx — the things the office sets up once: buildings, floors,
//  rooms, and the batches and subjects the timetable refers to.
//
//  A room number is never typed. Pick the building, the floor and the position
//  along the floor and the number follows from the rule — which is also how
//  the database stores it, so the two can never drift apart.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Building2, GraduationCap, Plus, Trash2 } from "lucide-react";
import { api, ApiError, type AdminRoom, type BatchRow, type BuildingRow, type SubjectRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";

export default function Campus() {
  const campus = useApiData<{ buildings: BuildingRow[]; rooms: AdminRoom[] }>(() => api.get("/admin/campus"), []);
  const academics = useApiData<{ batches: BatchRow[]; subjects: SubjectRow[] }>(() => api.get("/admin/academics"), []);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  const say = (tone: "rooms" | "error", text: string) => setNote({ tone, text });
  const fail = (caught: unknown) => say("error", caught instanceof ApiError ? caught.message : "That did not work.");

  return (
    <div className="space-y-stack-md">
      <PageHeader title="Campus & rooms" subtitle="Buildings, floors and rooms — plus the classes and subjects the timetable uses." />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {campus.error ? <ErrorNote message={campus.error} onRetry={() => void campus.refresh()} /> : null}
      {campus.loading && !campus.data ? <Spinner /> : null}

      <BuildingsCard
        buildings={campus.data?.buildings ?? []}
        onChanged={async (message: string) => {
          say("rooms", message);
          await campus.refresh();
        }}
        onError={fail}
      />

      <RoomsCard
        buildings={campus.data?.buildings ?? []}
        rooms={campus.data?.rooms ?? []}
        onChanged={async (message: string) => {
          say("rooms", message);
          await campus.refresh();
        }}
        onError={fail}
      />

      <AcademicsCard
        batches={academics.data?.batches ?? []}
        subjects={academics.data?.subjects ?? []}
        onChanged={async (message: string) => {
          say("rooms", message);
          await academics.refresh();
        }}
        onError={fail}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuildingsCard({
  buildings,
  onChanged,
  onError,
}: {
  buildings: BuildingRow[];
  onChanged: (message: string) => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [form, setForm] = useState({ code: "", name: "", shortName: "", floors: "6" });
  const [busy, setBusy] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/buildings", {
        code: Number(form.code),
        name: form.name.trim(),
        shortName: form.shortName.trim() || undefined,
        floors: form.floors ? Number(form.floors) : undefined,
      });
      setForm({ code: "", name: "", shortName: "", floors: "6" });
      await onChanged("Building added, with its floors.");
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Buildings" subtitle="The first digit of every room number." actions={<Building2 className="h-5 w-5 text-on-surface-variant" />}>
      {buildings.length ? (
        <ul className="mb-4 space-y-2">
          {buildings.map(row => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant px-3 py-2.5">
              <span className="tabular flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-[15px] font-bold text-on-primary">{row.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-on-surface">{row.name}</span>
                <span className="block text-[12px] text-on-surface-variant">
                  {row.floors.length} floors · {row.roomCount} rooms · numbers begin {row.code}11
                </span>
              </span>
              <button
                className="rounded p-2 text-error hover:bg-error-container"
                aria-label={`Delete ${row.name}`}
                onClick={async () => {
                  if (!window.confirm(`Delete ${row.name} and every room in it? This cannot be undone.`)) return;
                  try {
                    await api.delete(`/admin/buildings/${row.id}`);
                    await onChanged("Building removed.");
                  } catch (caught) {
                    onError(caught);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No buildings yet" description="Add the first building to start the campus." />
      )}

      <form className="grid gap-3 sm:grid-cols-4" onSubmit={add}>
        <Field label="Code (1–9)">
          <Input type="number" min={1} max={9} value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} required />
        </Field>
        <Field label="Name">
          <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Science Block" required />
        </Field>
        <Field label="Short name">
          <Input value={form.shortName} onChange={event => setForm({ ...form, shortName: event.target.value })} placeholder="SB" />
        </Field>
        <Field label="Floors to create">
          <Input type="number" min={0} max={9} value={form.floors} onChange={event => setForm({ ...form, floors: event.target.value })} />
        </Field>
        <div className="sm:col-span-4">
          <Button type="submit" busy={busy}>
            <Plus className="h-4 w-4" /> Add building
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function RoomsCard({
  buildings,
  rooms,
  onChanged,
  onError,
}: {
  buildings: BuildingRow[];
  rooms: AdminRoom[];
  onChanged: (message: string) => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [form, setForm] = useState({ buildingCode: "", floorLevel: "", position: "", name: "", kind: "lecture", capacity: "40" });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const floors = buildings.find(row => String(row.code) === form.buildingCode)?.floors ?? [];
  // The number is shown as it is typed, so there is no surprise on save.
  const preview =
    form.buildingCode && form.floorLevel && form.position ? `${form.buildingCode}${form.floorLevel}${form.position}` : "—";

  const shown = rooms.filter(row => !filter.trim() || row.room.roomNumber.startsWith(filter.trim()));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/rooms", {
        buildingCode: Number(form.buildingCode),
        floorLevel: Number(form.floorLevel),
        position: Number(form.position),
        name: form.name.trim() || undefined,
        kind: form.kind,
        capacity: Number(form.capacity),
      });
      setForm({ ...form, position: "", name: "" });
      await onChanged(`Room ${preview} added.`);
    } catch (caught) {
      onError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Rooms"
      subtitle={`${rooms.length} on the system`}
      actions={<Input className="h-9 w-32" placeholder="Filter 3…" value={filter} onChange={event => setFilter(event.target.value)} />}
    >
      <form className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" onSubmit={add}>
        <Field label="Building">
          <Select value={form.buildingCode} onChange={event => setForm({ ...form, buildingCode: event.target.value, floorLevel: "" })} required>
            <option value="">—</option>
            {buildings.map(row => (
              <option key={row.id} value={row.code}>
                {row.code} — {row.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Floor">
          <Select value={form.floorLevel} onChange={event => setForm({ ...form, floorLevel: event.target.value })} required>
            <option value="">—</option>
            {floors.map(row => (
              <option key={row.id} value={row.level}>
                {row.level}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position (1–9)">
          <Input type="number" min={1} max={9} value={form.position} onChange={event => setForm({ ...form, position: event.target.value })} required />
        </Field>
        <Field label="Kind">
          <Select value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>
            {["lecture", "lab", "seminar", "studio", "office"].map(kind => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seats">
          <Input type="number" min={1} value={form.capacity} onChange={event => setForm({ ...form, capacity: event.target.value })} />
        </Field>
        <Field label="Room number" hint="Worked out from the three digits.">
          <div className="input tabular flex items-center text-[17px] font-bold">{preview}</div>
        </Field>
        <div className="sm:col-span-3 lg:col-span-6">
          <Button type="submit" busy={busy}>
            <Plus className="h-4 w-4" /> Add room
          </Button>
        </div>
      </form>

      {shown.length ? (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Building</th>
                <th>Floor</th>
                <th>Kind</th>
                <th className="text-right">Seats</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={row.room.id}>
                  <td className="tabular font-semibold">{row.room.roomNumber}</td>
                  <td>{row.buildingName}</td>
                  <td className="tabular">{row.room.floorLevel}</td>
                  <td>{row.room.kind}</td>
                  <td className="tabular text-right">{row.room.capacity}</td>
                  <td>
                    <button
                      onClick={async () => {
                        try {
                          await api.patch(`/admin/rooms/${row.room.id}`, { active: !row.room.active });
                          await onChanged(row.room.active ? `Room ${row.room.roomNumber} taken off the board.` : `Room ${row.room.roomNumber} is back.`);
                        } catch (caught) {
                          onError(caught);
                        }
                      }}
                    >
                      <Badge tone={row.room.active ? "rooms" : "error"}>{row.room.active ? "In use" : "Withdrawn"}</Badge>
                    </button>
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        className="rounded p-2 text-error hover:bg-error-container"
                        aria-label={`Delete room ${row.room.roomNumber}`}
                        onClick={async () => {
                          if (!window.confirm(`Delete room ${row.room.roomNumber} and its timetable?`)) return;
                          try {
                            await api.delete(`/admin/rooms/${row.room.id}`);
                            await onChanged("Room deleted.");
                          } catch (caught) {
                            onError(caught);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No rooms" description="Add a room above, or clear the filter." />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function AcademicsCard({
  batches,
  subjects,
  onChanged,
  onError,
}: {
  batches: BatchRow[];
  subjects: SubjectRow[];
  onChanged: (message: string) => Promise<void>;
  onError: (caught: unknown) => void;
}) {
  const [batch, setBatch] = useState({ code: "", name: "", department: "", yearLevel: "" });
  const [subject, setSubject] = useState({ code: "", name: "", department: "" });
  const [busy, setBusy] = useState(false);

  return (
    <Card title="Classes & subjects" subtitle="What the timetable points at." actions={<GraduationCap className="h-5 w-5 text-on-surface-variant" />}>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- batches ---- */}
        <div>
          <p className="field-label">Classes / batches</p>
          <ul className="mb-3 space-y-1.5">
            {batches.map(row => (
              <li key={row.id} className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-[13px]">
                <span className="font-bold text-on-surface">{row.code}</span>
                <span className="min-w-0 flex-1 truncate text-on-surface-variant">{row.name}</span>
                <button
                  className="rounded p-1.5 text-error hover:bg-error-container"
                  aria-label={`Delete ${row.code}`}
                  onClick={async () => {
                    try {
                      await api.delete(`/admin/batches/${row.id}`);
                      await onChanged("Class removed.");
                    } catch (caught) {
                      onError(caught);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {!batches.length ? <li className="text-[13px] text-on-surface-variant">None yet.</li> : null}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={async event => {
              event.preventDefault();
              setBusy(true);
              try {
                await api.post("/admin/batches", {
                  code: batch.code.trim(),
                  name: batch.name.trim(),
                  department: batch.department.trim() || undefined,
                  yearLevel: batch.yearLevel ? Number(batch.yearLevel) : undefined,
                });
                setBatch({ code: "", name: "", department: "", yearLevel: "" });
                await onChanged("Class added.");
              } catch (caught) {
                onError(caught);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Code">
              <Input value={batch.code} onChange={event => setBatch({ ...batch, code: event.target.value })} placeholder="CS-1" required />
            </Field>
            <Field label="Name">
              <Input value={batch.name} onChange={event => setBatch({ ...batch, name: event.target.value })} placeholder="First Year CS" required />
            </Field>
            <Field label="Department">
              <Input value={batch.department} onChange={event => setBatch({ ...batch, department: event.target.value })} />
            </Field>
            <Field label="Year">
              <Input type="number" min={1} max={8} value={batch.yearLevel} onChange={event => setBatch({ ...batch, yearLevel: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" busy={busy} variant="ghost">
                <Plus className="h-4 w-4" /> Add class
              </Button>
            </div>
          </form>
        </div>

        {/* ---- subjects ---- */}
        <div>
          <p className="field-label">Subjects</p>
          <ul className="mb-3 space-y-1.5">
            {subjects.map(row => (
              <li key={row.id} className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-[13px]">
                <span className="font-bold text-on-surface">{row.code}</span>
                <span className="min-w-0 flex-1 truncate text-on-surface-variant">{row.name}</span>
                <button
                  className="rounded p-1.5 text-error hover:bg-error-container"
                  aria-label={`Delete ${row.code}`}
                  onClick={async () => {
                    try {
                      await api.delete(`/admin/subjects/${row.id}`);
                      await onChanged("Subject removed.");
                    } catch (caught) {
                      onError(caught);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {!subjects.length ? <li className="text-[13px] text-on-surface-variant">None yet.</li> : null}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={async event => {
              event.preventDefault();
              setBusy(true);
              try {
                await api.post("/admin/subjects", {
                  code: subject.code.trim(),
                  name: subject.name.trim(),
                  department: subject.department.trim() || undefined,
                });
                setSubject({ code: "", name: "", department: "" });
                await onChanged("Subject added.");
              } catch (caught) {
                onError(caught);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Code">
              <Input value={subject.code} onChange={event => setSubject({ ...subject, code: event.target.value })} placeholder="CS-1101" required />
            </Field>
            <Field label="Name">
              <Input value={subject.name} onChange={event => setSubject({ ...subject, name: event.target.value })} placeholder="Programming I" required />
            </Field>
            <Field label="Department" className="sm:col-span-2">
              <Input value={subject.department} onChange={event => setSubject({ ...subject, department: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" busy={busy} variant="ghost">
                <Plus className="h-4 w-4" /> Add subject
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}
