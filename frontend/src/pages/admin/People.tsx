// ===========================================================================
//  admin/People.tsx — accounts, and THE DRIVER PERMISSION QUEUE.
//
//  Nobody becomes a bus driver by signing up. A student asks; the request
//  lands here; approving it is what promotes the account and creates the bus.
//  Refusing leaves the account exactly as it was.
// ===========================================================================

import { useState } from "react";
import { BadgeCheck, KeyRound, Plus, ShieldOff, UserPlus, X } from "lucide-react";
import { api, ApiError, type DriverApplicationRow, type SessionUser } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";

type People = { admins: SessionUser[]; drivers: SessionUser[]; students: SessionUser[] };

export default function AdminPeople() {
  const people = useApiData<People>(() => api.get("/admin/people"), []);
  const applications = useApiData<{ applications: DriverApplicationRow[] }>(() => api.get("/admin/driver-applications"), []);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "user" });

  const act = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setNote(null);
    try {
      await action();
      setNote({ tone: "rooms", text: success });
      await Promise.all([people.refresh(), applications.refresh()]);
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  };

  const pending = (applications.data?.applications ?? []).filter(row => row.application.status === "pending");
  const decided = (applications.data?.applications ?? []).filter(row => row.application.status !== "pending");

  return (
    <div className="space-y-stack-md">
      <PageHeader title="People & drivers" subtitle="Accounts, and who is allowed to run a school bus." />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      {applications.error ? <ErrorNote message={applications.error} onRetry={() => void applications.refresh()} /> : null}

      {/* ---------- the queue ---------- */}
      <Card
        title="Driver permission requests"
        subtitle="Approving one promotes the account and registers the bus."
        accent={pending.length ? "warning" : undefined}
      >
        {applications.loading && !applications.data ? <Spinner /> : null}

        {pending.length ? (
          <ul className="space-y-3">
            {pending.map(row => (
              <li key={row.application.id} className="rounded-lg border border-warning/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-on-surface">{row.applicantName ?? row.applicantUsername}</p>
                    <p className="text-[12px] text-on-surface-variant">
                      @{row.applicantUsername} · asked {dateTime(row.application.createdAt)}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[13px] text-on-surface-variant">
                      <li>Bus: {row.application.plateNumber ?? "not given"} · {row.application.totalSeats ?? "?"} seats</li>
                      <li>Phone: {row.application.phone ?? "not given"} · Licence: {row.application.licenseNumber ?? "not given"}</li>
                      {row.application.message ? <li className="italic">“{row.application.message}”</li> : null}
                    </ul>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="bus"
                      busy={busy === `app-${row.application.id}`}
                      onClick={() =>
                        void act(
                          `app-${row.application.id}`,
                          () => api.patch(`/admin/driver-applications/${row.application.id}`, { approve: true }),
                          `${row.applicantName ?? row.applicantUsername} can now run a school bus.`,
                        )
                      }
                    >
                      <BadgeCheck className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      variant="danger"
                      busy={busy === `app-${row.application.id}`}
                      onClick={() => {
                        const reason = window.prompt("Why is this being refused? (the applicant sees this)") ?? undefined;
                        void act(
                          `app-${row.application.id}`,
                          () => api.patch(`/admin/driver-applications/${row.application.id}`, { approve: false, note: reason }),
                          "Request refused.",
                        );
                      }}
                    >
                      <X className="h-4 w-4" /> Refuse
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing waiting" description="No open driver permission requests." />
        )}

        {decided.length ? (
          <div className="mt-4 overflow-x-auto">
            <p className="field-label">Already decided</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Decision</th>
                  <th>When</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {decided.map(row => (
                  <tr key={row.application.id}>
                    <td>{row.applicantName ?? row.applicantUsername}</td>
                    <td>
                      <Badge tone={row.application.status === "approved" ? "rooms" : "error"}>
                        {row.application.status === "approved" ? "Approved" : "Refused"}
                      </Badge>
                    </td>
                    <td>{dateTime(row.application.decidedAt)}</td>
                    <td className="text-[13px] text-on-surface-variant">{row.application.decisionNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* ---------- accounts ---------- */}
      <Card title="Create an account" subtitle="For staff who cannot register themselves." actions={<UserPlus className="h-5 w-5 text-on-surface-variant" />}>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={event => {
            event.preventDefault();
            void act(
              "create",
              () =>
                api.post("/admin/people", {
                  name: form.name.trim(),
                  username: form.username.trim() || undefined,
                  email: form.email.trim() || undefined,
                  password: form.password || undefined,
                  role: form.role,
                }),
              "Account created.",
            ).then(() => setForm({ name: "", username: "", email: "", password: "", role: "user" }));
          }}
        >
          <Field label="Name">
            <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Username">
            <Input value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="auto" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Password">
            <Input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="default" />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
              <option value="user">Student</option>
              <option value="driver">Bus driver</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" busy={busy === "create"}>
              <Plus className="h-4 w-4" /> Create account
            </Button>
          </div>
        </form>
      </Card>

      {people.error ? <ErrorNote message={people.error} onRetry={() => void people.refresh()} /> : null}
      {people.loading && !people.data ? <Spinner /> : null}

      {people.data
        ? (
            [
              { title: "Administrators", rows: people.data.admins, kind: "admin" as const },
              { title: "Bus drivers", rows: people.data.drivers, kind: "driver" as const },
              { title: "Students", rows: people.data.students, kind: "user" as const },
            ] as const
          ).map(group => (
            <Card key={group.title} title={group.title} subtitle={`${group.rows.length} account${group.rows.length === 1 ? "" : "s"}`}>
              {group.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Status</th>
                        <th>Last signed in</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(row => (
                        <tr key={row.id}>
                          <td>{row.name ?? "—"}</td>
                          <td className="tabular">@{row.username}</td>
                          <td>
                            <StatusBadge status={row.status} />
                          </td>
                          <td>{dateTime(row.lastSignedIn)}</td>
                          <td>
                            <div className="flex flex-wrap justify-end gap-1">
                              <button
                                className="rounded p-2 text-on-surface-variant hover:bg-surface-container-high"
                                title="Reset the password"
                                aria-label="Reset password"
                                onClick={() => {
                                  const password = window.prompt(`New password for @${row.username} (at least 6 characters)`);
                                  if (!password) return;
                                  void act(`pw-${row.id}`, () => api.patch(`/admin/people/${row.id}`, { password }), "Password changed.");
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded px-2 py-1 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high"
                                onClick={() =>
                                  void act(
                                    `st-${row.id}`,
                                    () => api.patch(`/admin/people/${row.id}`, { status: row.status === "active" ? "inactive" : "active" }),
                                    row.status === "active" ? "Account switched off." : "Account switched on.",
                                  )
                                }
                              >
                                {row.status === "active" ? "Disable" : "Enable"}
                              </button>
                              {group.kind === "driver" ? (
                                <button
                                  className="rounded p-2 text-error hover:bg-error-container"
                                  title="Take driver permission back"
                                  aria-label="Revoke driver permission"
                                  onClick={() => {
                                    if (!window.confirm(`Take driver permission back from ${row.name ?? row.username}? Their bus and its routes are kept.`)) return;
                                    void act(`rv-${row.id}`, () => api.post(`/admin/people/${row.id}/revoke-driver`), "Driver permission taken back.");
                                  }}
                                >
                                  <ShieldOff className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Nobody here" description="No accounts with this role." />
              )}
            </Card>
          ))
        : null}
    </div>
  );
}
