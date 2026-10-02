'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export function PageError({ reset }) {
  return <main className="routeState">
    <section className="panel empty" role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h1>Unable to load this workspace</h1>
      <p>Your request could not be completed. Try again to reload the page.</p>
      <div className="emptyActions"><button onClick={reset}>Try again</button><Link className="button secondary" href="/">Back to dashboard</Link></div>
    </section>
  </main>;
}
