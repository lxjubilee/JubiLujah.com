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
  is_active?: boolean;
  last_login_at: string | null;
}

// A role click does not save: it opens this confirm first, as kJubilee's Users
// screen does. Admin opens this whole console, so this is the last place a
// misread row is caught.
interface PendingRole { u: User; role: string; grant: boolean }

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

  const [pending, setPending] = useState<PendingRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingErr, setPendingErr] = useState<string | null>(null);

  // Shown before the click; the API enforces both rules regardless.
  const adminCount = users.filter((x) => x.roles.includes('admin') && x.is_active !== false).length;

  const toggleRole = (u: User, role: string) => {
    setMsg(null); setErr(null); setPendingErr(null);
    setPending({ u, role, grant: !u.roles.includes(role) });
  };

  const applyRole = async () => {
    if (!pending) return;
    const { u, role, grant } = pending;
    const granted = u.roles.filter((r) => GRANTABLE_ROLES.some((g) => g.key === r));
    const next = grant ? [...granted, role] : granted.filter((r) => r !== role);
    setBusy(true); setPendingErr(null);
    try {
      await api.patch(`/api/admin/users/${u.id}/roles`, { roles: next });
      setPending(null);
      flash(`Updated roles for ${u.display_name}`);
      load();
    } catch (e) {
      setPendingErr(e instanceof ApiError ? e.message : 'Failed to update roles');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setPending(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, busy]);

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
        Users are synced from JubileeInspire SSO on login. Every account has <strong>View &amp; Play</strong> rights, which can never be removed. <strong>Admin</strong> opens this console. You cannot change your own roles, and the only admin cannot lose Admin. A role change is read from the database on every request, so it takes effect immediately.
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
              onlyAdmin={u.roles.includes('admin') && adminCount <= 1}
              onSaveName={saveName}
              onToggleRole={toggleRole}
              onRemove={remove}
            />
          ))}
          {users.length === 0 && <tr><td colSpan={5} className="muted">No users yet.</td></tr>}
        </tbody>
      </table>

      {pending && (
        <div
          role="presentation"
          onClick={() => { if (!busy) setPending(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="jp-role-confirm"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420, padding: '22px 24px',
              background: 'var(--surface)', color: 'var(--ink)',
              border: '1px solid var(--line)', borderRadius: 10,
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 id="jp-role-confirm" style={{ margin: '0 0 8px', fontSize: 17 }}>Switch role?</h3>
            <p style={{ margin: '0 0 18px', fontSize: 14, overflowWrap: 'anywhere' }}>
              {pending.u.display_name || pending.u.email} · <strong>{roleLabel(pending.role)}</strong>
              {pending.grant ? ' off → on' : ' on → off'}
            </p>
            {pendingErr && (
              <p style={{ margin: '-6px 0 16px', fontSize: 13, color: 'var(--accent)' }}>{pendingErr}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btnStyle} onClick={() => setPending(null)} disabled={busy}>Cancel</button>
              <button
                style={{
                  ...btnStyle,
                  color: pending.grant ? 'var(--ink)' : 'var(--accent)',
                  borderColor: pending.grant ? 'var(--accent-gold)' : 'var(--accent)',
                  opacity: busy ? 0.6 : 1,
                }}
                onClick={applyRole}
                disabled={busy}
              >
                {busy ? 'Switching…' : 'Switch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const roleLabel = (key: string) => GRANTABLE_ROLES.find((r) => r.key === key)?.label ?? key;

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
  u, isSelf, onlyAdmin, onSaveName, onToggleRole, onRemove,
}: {
  u: User;
  isSelf: boolean;
  onlyAdmin: boolean;
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
      <td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '-'}</td>
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
          {GRANTABLE_ROLES.map((r) => {
            // The two rules the API enforces anyway, shown before the click.
            const why = isSelf ? 'You cannot change your own roles.'
              : r.key === 'admin' && onlyAdmin ? 'The only admin cannot lose Admin.'
              : undefined;
            return (
              <label
                key={r.key}
                title={why}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: why ? 0.55 : 1 }}
              >
                <input
                  type="checkbox"
                  checked={u.roles.includes(r.key)}
                  disabled={Boolean(why)}
                  onChange={() => onToggleRole(u, r.key)}
                />
                {r.label}
              </label>
            );
          })}
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
