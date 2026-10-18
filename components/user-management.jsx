'use client';

import { useState } from 'react';
import { PERMISSION_GROUPS, ROLE_TEMPLATES } from '@/lib/access-control';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata'
});

export function UserManagement({ initialUsers, audit }) {
  const [users, setUsers] = useState(initialUsers);
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  async function create(event) {
    event.preventDefault();
    if (pendingAction) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPendingAction('create');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: form.get('full_name'), email: form.get('email'), role: form.get('role'), custom_permissions: {} })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setNotice(data.error || 'Could not add the user.');
        return;
      }
      const data = await response.json();
      setUsers(current => [...current, data.user]);
      setNotice(`Created. Temporary password: ${data.temporary_password} — share it securely, then have the user reset it.`);
      formElement.reset();
    } finally {
      setPendingAction('');
    }
  }

  async function update(user, patch) {
    if (pendingAction) return;
    setPendingAction(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...user, ...patch })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setNotice(data.error || 'Could not update the user.');
        return;
      }
      const data = await response.json();
      if (data.user) setUsers(current => current.map(item => item.id === user.id ? data.user : item));
      setNotice(patch.action === 'reset_password' ? 'Password-reset email sent.' : 'User access updated.');
    } finally {
      setPendingAction('');
    }
  }

  return (
    <div className="adminUsers">
      <section className="panel">
        <div className="panelHeader"><h2>Add user</h2></div>
        <div className="panelBody">
          <form className="userCreate" onSubmit={create}>
            <label><span>Full name</span><input name="full_name" required /></label>
            <label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
            <label><span>Role</span><select name="role" defaultValue="viewer">{Object.keys(ROLE_TEMPLATES).map(role => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}</select></label>
            <button type="submit" disabled={Boolean(pendingAction)}>Add user</button>
          </form>
          {notice ? <p className="muted">{notice}</p> : null}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panelHeader"><h2>Users</h2></div>
        <div className="panelBody">{users.map(user => <UserCard key={user.id} user={user} busy={pendingAction === user.id} onUpdate={update} />)}</div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panelHeader"><h2>Access audit</h2></div>
        <div className="panelBody detailList">{audit.length ? audit.map(entry => <div className="detailRow" key={entry.id}><span>{formatDate(entry.created_at)}</span><strong>{entry.action.replaceAll('_', ' ')}</strong></div>) : <p className="muted">No access changes recorded yet.</p>}</div>
      </section>
    </div>
  );
}

function UserCard({ user, busy, onUpdate }) {
  function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customPermissions = {};
    for (const [key] of permissionEntries()) customPermissions[key] = form.get(key) === 'on';
    onUpdate(user, { role: form.get('role'), active: form.get('active') === 'on', custom_permissions: customPermissions });
  }

  return (
    <article className="userCard">
      <div><strong>{user.full_name || user.email}</strong><p className="muted">{user.email} · Last sign-in: {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'}</p></div>
      <form onSubmit={save}>
        <div className="userControls">
          <label><span>Role</span><select name="role" defaultValue={user.role}>{Object.keys(ROLE_TEMPLATES).map(key => <option value={key} key={key}>{key.replaceAll('_', ' ')}</option>)}</select></label>
          <label><input name="active" type="checkbox" defaultChecked={user.active} /> Active</label>
          <button type="submit" className="secondary" disabled={busy}>Save</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => onUpdate(user, { action: 'reset_password' })}>Reset password</button>
        </div>
        <details>
          <summary>Custom permissions</summary>
          <div className="permissionGrid">{permissionEntries().map(([key, label]) => <label key={key}><input name={key} type="checkbox" defaultChecked={user.custom_permissions?.[key] === true} />{label}</label>)}</div>
        </details>
      </form>
    </article>
  );
}

function permissionEntries() {
  return PERMISSION_GROUPS.flatMap(([module, label, actions]) => actions.map(action => [`${module}.${action}`, `${label}: ${action}`]));
}

function formatDate(value) {
  return DATE_TIME_FORMATTER.format(new Date(value));
}
