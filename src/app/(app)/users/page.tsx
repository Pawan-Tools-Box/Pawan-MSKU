"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { apiFetch, fmtDateTime, useApi } from "@/components/api";
import { useSession } from "@/components/session";
import { Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Panel, Select, Spinner, StatusBadge, useFeedback } from "@/components/ui";
import type { UserRow } from "@/server/auth";

const ROLE_HELP: Record<string, string> = {
  ADMIN: "Everything: Master SKUs, platforms, fields, imports, exports, mapping, users, audit logs and settings.",
  STAFF: "Search, view, add listings, map and re-map SKUs, resolve Unmapped SKUs. Import and export if allowed in Settings.",
  VIEWER: "Search and view only. Export if allowed in Settings.",
};

function UserModal({ user, onClose, onSaved }: { user?: UserRow; onClose: () => void; onSaved: () => void }) {
  const fb = useFeedback();
  const [f, setF] = useState({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? "STAFF", status: user?.status ?? "ACTIVE", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (user) await apiFetch(`/api/users/${user.id}`, { method: "PATCH", body: { name: f.name, role: f.role, status: f.status, password: f.password || undefined } });
      else await apiFetch("/api/users", { body: f });
      fb.success(user ? "User saved" : `${f.name} can now sign in`);
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={user ? `Edit ${user.name}` : "Add user"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>{user ? "Save user" : "Add user"}</Button></>}>
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" required><Input type="email" value={f.email} disabled={!!user} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as UserRow["role"] })}><option value="ADMIN">Admin</option><option value="STAFF">Staff</option><option value="VIEWER">Viewer</option></Select></Field>
          {user && <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (cannot sign in)</option></Select></Field>}
        </div>
        <p className="rounded-md bg-canopy-50 px-3 py-2 text-[12.5px] text-canopy-800">{ROLE_HELP[f.role]}</p>
        <Field label={user ? "New password" : "Password"} required={!user} hint={user ? "Leave empty to keep the current password. Setting one signs the user out everywhere." : "At least 8 characters, with letters and numbers."}>
          <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { me } = useSession();
  const { data, loading, error, reload } = useApi<{ users: UserRow[] }>("/api/users");
  const [modal, setModal] = useState<{ user?: UserRow } | null>(null);
  return (
    <>
      <PageHeader title="Users" description="People who can sign in, and what each of them is allowed to do." actions={<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setModal({})}>Add user</Button>} />
      <Panel pad={false}>
        {error ? <div className="p-4"><ErrorNote>{error}</ErrorNote></div> : loading && !data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="w-[1%]"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}{u.id === me.user.id && <span className="ml-2 text-[12px] font-normal text-ink-3">you</span>}</td>
                    <td>{u.email}</td>
                    <td><Badge tone={u.role === "ADMIN" ? "info" : "neutral"}>{u.role.charAt(0) + u.role.slice(1).toLowerCase()}</Badge></td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="whitespace-nowrap text-ink-2">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Never"}</td>
                    <td><Button size="sm" onClick={() => setModal({ user: u })}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {modal && <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </>
  );
}
