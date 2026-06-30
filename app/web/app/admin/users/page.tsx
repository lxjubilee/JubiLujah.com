'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

interface User {
  id: string;
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  roles: string[];
  last_login_at: string | null;
}

// The four admin-grantable roles. Every account also carries the baseline
// "View & Play" right (the `viewer` role), which is always on and can never be
// taken away — so it is shown as a locked pill, not a toggle.
const GRANTABLE_ROLES: { key: string; label: string }[] = [
  { key: 'reviewer', label: 'Reviewer' },
  { key: 'content_editor', label: 'Content Editor' },
  { key: 'executive', label: 'Executive' },
  { key: 'admin', label: 'Admin' },
];

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.get<User[]>('/api/admin/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setErr(null); };
  const fail = (e: unknown, fallback: string) =>
    setErr(e instanceof ApiError ? e.message : fallback);

  const toggleRole = async (u: User, role: string) => {
    setMsg(null); setErr(null);
    const granted = u.roles.filter((r) => GRANTABLE_ROLES.some((g) => g.key === r));
    const next = granted.includes(role) ? granted.filter((r) => r !== role) : [...granted, role];
    try {
      await api.patch(`/api/admin/users/${u.id}/roles`, { roles: next });
      flash(`Updated roles for ${u.display_name}`);
      load();
    } catch (e) { fail(e, 'Failed to update roles'); }
  };

  const saveName = async (u: User, first: string, last: string) => {
    setMsg(null); setErr(null);
    try {
      await api.patch(`/api/admin/users/${u.id}`, { first_name: first, last_name: last });
      flash(`Saved name for ${[first, last].filter(Boolean).join(' ')}`);
      load();
    } catch (e) { fail(e, 'Failed to save name'); }
  };

  const remove = async (u: User) => {
    setMsg(null); setErr(null);
    if (!window.confirm(`Remove ${u.display_name} (${u.email}) from the system? This permanently deletes the account and cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/users/${u.id}`);
      flash(`Removed ${u.display_name}`);
      load();
    } catch (e) { fail(e, 'Failed to remove account'); }
  };

  return (
    <>
      <h2 className="section-title">Users &amp; roles</h2>
      <p className="section-sub">
        Users are synced from JubileeInspire SSO on login. Every account has <strong>View &amp; Play</strong> rights, which can never be removed. Role and name changes here are shared across both platforms.
      </p>
      {msg && <div className="notice" style={{ borderColor: 'var(--success)' }}>{msg}</div>}
      {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}
      <table className="admin-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Last login</th><th>Roles</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow
              key={u.id}
              u={u}
              isSelf={me?.id === u.id}
              onSaveName={saveName}
              onToggleRole={toggleRole}
              onRemove={remove}
            />
          ))}
          {users.length === 0 && <tr><td colSpan={5} className="muted">No users yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: 110, padding: '5px 8px', fontSize: 12,
  background: 'var(--surface-2)', color: 'var(--ink)',
  border: '1px solid var(--line)', borderRadius: 6,
};
const btnStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, cursor: 'pointer',
  background: 'var(--surface-2)', color: 'var(--ink)',
  border: '1px solid var(--line)', borderRadius: 6,
};

function UserRow({
  u, isSelf, onSaveName, onToggleRole, onRemove,
}: {
  u: User;
  isSelf: boolean;
  onSaveName: (u: User, first: string, last: string) => void;
  onToggleRole: (u: User, role: string) => void;
  onRemove: (u: User) => void;
}) {
  const [first, setFirst] = useState(u.first_name ?? '');
  const [last, setLast] = useState(u.last_name ?? '');

  // Re-seed local inputs when the row reloads from the server.
  useEffect(() => { setFirst(u.first_name ?? ''); setLast(u.last_name ?? ''); }, [u.first_name, u.last_name]);

  const dirty = first !== (u.first_name ?? '') || last !== (u.last_name ?? '');
  const canSave = dirty && (first.trim() || last.trim());

  return (
    <tr>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input style={inputStyle} value={first} placeholder="First" onChange={(e) => setFirst(e.target.value)} />
          <input style={inputStyle} value={last} placeholder="Last" onChange={(e) => setLast(e.target.value)} />
          <button
            style={{ ...btnStyle, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            disabled={!canSave}
            onClick={() => onSaveName(u, first.trim(), last.trim())}
          >
            Save
          </button>
        </div>
      </td>
      <td className="muted">{u.email}</td>
      <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}</td>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span
            title="Every account can view and play. This cannot be removed."
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 999,
              background: 'var(--surface-2)', border: '1px solid var(--line)',
              color: 'var(--accent-gold)', whiteSpace: 'nowrap',
            }}
          >
            ✓ View &amp; Play · always on
          </span>
          {GRANTABLE_ROLES.map((r) => (
            <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={u.roles.includes(r.key)} onChange={() => onToggleRole(u, r.key)} />
              {r.label}
            </label>
          ))}
        </div>
      </td>
      <td>
        {isSelf
          ? <span className="muted" style={{ fontSize: 11 }}>(you)</span>
          : (
            <button
              style={{ ...btnStyle, color: 'var(--accent)', borderColor: 'var(--accent)' }}
              onClick={() => onRemove(u)}
            >
              Remove
            </button>
          )}
      </td>
    </tr>
  );
}
