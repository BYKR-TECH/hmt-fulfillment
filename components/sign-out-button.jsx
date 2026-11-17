'use client';

import { LogOut } from 'lucide-react';
import { createBrowserAuthClient } from '@/lib/supabase/browser';

export function SignOutButton() {
  async function handleSignOut() {
    const supabase = createBrowserAuthClient();
    if (!supabase) { window.location.href = '/login'; return; }
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <button
      onClick={handleSignOut}
      className="navItem"
      style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', marginTop: 'auto' }}
      aria-label="Sign out"
    >
      <LogOut size={17} aria-hidden="true" />
      <span>Sign out</span>
    </button>
  );
}
