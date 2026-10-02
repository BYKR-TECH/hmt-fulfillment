export function PageLoading({ title = 'Loading workspace' }) {
  return <main className="routeState" role="status" aria-live="polite" aria-busy="true">
    <p className="eyebrow">Hold My Throttle · Operations</p>
    <h1>{title}</h1><p className="muted">Preparing your workspace…</p>
    <div aria-hidden="true">
      <div className="grid metrics">{[1, 2, 3, 4].map(item => <div className="skeleton skeletonCard" key={item} />)}</div>
      <div className="panel skeletonRows">{[1, 2, 3, 4].map(item => <div className="skeleton" key={item} />)}</div>
    </div>
  </main>;
}
