// ===========================================================================
//  Profile.tsx — the signed-in account and password.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Cpu, Database, KeyRound, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, StatTile } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", agent: "Agent", user: "Student" };

export default function Profile() {
  const { user, health } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "rooms" | "error"; text: string } | null>(null);

  if (!user) return null;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ tone: "rooms", text: "Password changed. Use the new one next time you sign in." });
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not change the password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account and this installation." />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Signed in as" value={user.name ?? user.username ?? "—"} hint={`@${user.username ?? "—"}`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Role" value={ROLE_LABEL[user.role]} tone={user.role === "admin" ? "bus" : "rooms"} />
        <StatTile label="System" value={health ? "Ready" : "Not answering"} icon={<Cpu className="h-4 w-4" />} hint={health?.campusTime ? `${health.campusTime} Yangon` : undefined} />
        <StatTile label="Records" value={health?.database?.startsWith("connected") ? "Saved" : "Unavailable"} icon={<Database className="h-4 w-4" />} hint="Everything you do is written to the campus records" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Username</dt>
              <dd className="tabular font-semibold">{user.username ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Email</dt>
              <dd className="font-medium">{user.email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Status</dt>
              <dd>
                <Badge tone={user.status === "active" ? "rooms" : "error"}>{user.status}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Last signed in</dt>
              <dd className="tabular">{dateTime(user.lastSignedIn)}</dd>
            </div>
            {health?.campusTime ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Myanmar time</dt>
                <dd className="tabular">{health.campusTime}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card title="Change password" accent="rooms">
          <form className="space-y-4" onSubmit={changePassword}>
            <Field label="Current password">
              <Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 6 characters.">
              <Input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
            </Field>
            <Button type="submit" busy={busy}>
              <KeyRound className="h-4 w-4" /> Update password
            </Button>
          </form>
        </Card>
      </div>

    </>
  );
}
