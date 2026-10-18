'use client';

import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      setMessage('Auth configuration is missing.');
      setBusy(false);
      return;
    }
    try {
      const supabase = createBrowserClient(supabaseUrl, anonKey);
      const { error } = await supabase.auth.signInWithPassword({
        email: form.get('email'),
        password: form.get('password')
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.assign('/');
    } finally {
      setBusy(false);
    }
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
            <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <Link className="muted" href="/forgot-password">Forgot password?</Link>
            {message ? <p className="muted">{message}</p> : null}
          </form>
        </div>
      </section>
    </main>
  );
}
