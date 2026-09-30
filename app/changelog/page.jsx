import { AppShell } from '@/components/app-shell';
import { getChangelog } from '@/lib/changelog';

export default async function ChangelogPage() {
  const { entries, error } = await getChangelog();
  return <AppShell>
    <header className="pageHeader"><div><p className="eyebrow">Release history</p><h1>Changelog</h1><p className="muted">What changed in each merged pull request. Updates appear automatically after merging.</p></div></header>
    {error ? <section className="panel"><div className="panelBody">{error}</div></section> : null}
    <div className="grid">
      {entries.map(entry => <section className="panel" key={entry.number}>
        <div className="panelHeader"><h2>{entry.title}</h2><a href={entry.url} target="_blank" rel="noopener noreferrer">PR #{entry.number}</a></div>
        <div className="panelBody"><p className="muted">{new Date(entry.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.description}</div></div>
      </section>)}
      {!error && !entries.length ? <p>No releases yet.</p> : null}
    </div>
  </AppShell>;
}
