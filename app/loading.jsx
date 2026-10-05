export default function Loading() {
  return (
    <main className="content" aria-busy="true" aria-live="polite">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Hold My Throttle</p>
          <h1>Loading operations…</h1>
          <p className="muted">Getting the latest orders and shipment status.</p>
        </div>
      </header>
    </main>
  );
}
