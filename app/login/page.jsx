'use client';

import { useState } from 'react';
import { createBrowserAuthClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const supabase = createBrowserAuthClient();
    if (!supabase) {
      setMessage('Auth configuration is missing.');
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: form.get('email'),
      password: form.get('password')
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    window.location.href = new URLSearchParams(window.location.search).get('next') || '/';
  }

  return (
    <main className="content" style={{ maxWidth: 460, margin: '8vh auto' }}>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Hold My Throttle</p>
            <h1>Operator sign in</h1>
          </div>
        </div>
        <div className="panelBody">
          <form className="grid" onSubmit={submit}>
            <label>
              <span>Email</span>
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" name="password" autoComplete="current-password" required />
            </label>
            <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <a className="muted" href="/forgot-password">Forgot password?</a>
            {message ? <p className="muted">{message}</p> : null}
          </form>
        </div>
      </section>
    </main>
  );
}
