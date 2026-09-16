// ===========================================================================
//  admin/People.tsx — administrator, room-booking agent and user accounts.
// ===========================================================================

import { useState } from "react";
import { KeyRound, Plus, UserPlus } from "lucide-react";
import { api, ApiError, type SessionUser } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";

type People = { admins: SessionUser[]; agents: SessionUser[]; students: SessionUser[] };

export default function AdminPeople() {
  const people = useApiData<People>(() => api.get("/admin/people"), []);
  const [note, setNote] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", role: "user" });

  const act = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    setNote(null);
    try {
      await action();
      setNote({ tone: "rooms", text: success });
      await people.refresh();
    } catch (caught) {
      setNote({ tone: "error", text: caught instanceof ApiError ? caught.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-stack-md">
      <PageHeader title="People & agents" subtitle="Manage administrator, room-booking agent, and student accounts." />

      {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

      {/* ---------- accounts ---------- */}
      <Card title="Create an account" subtitle="For agents and users who cannot register themselves." actions={<UserPlus className="h-5 w-5 text-on-surface-variant" />}>
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
              <option value="agent">Agent — may book rooms</option>
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
              { title: "Agents who may book rooms", rows: people.data.agents, kind: "agent" as const },
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
