import { CheckCircle2, CircleDashed, Power, XCircle } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { loadAutomation } from '@/lib/ops/data.ts';
import { formatDate, relativeAge } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead } from '@/components/ops/ui';

const COUNTER_LABELS: Record<string, string> = {
  wooPulled: 'Woo orders read', wooPersisted: 'Woo orders saved', checked: 'Orders checked', booked: 'Booked', autoBookDisabled: 'Left for manual booking',
  trackingPolled: 'AWBs tracked', trackingUpdated: 'Tracking updates', trackingEvents: 'New scans', shipmentMessagesSent: 'Shipment messages',
  wooStatusesChanged: 'Woo statuses changed', wooUpdated: 'Woo write-backs', failed: 'Failures', abandonedCartsSynced: 'Carts synced'
};

export default async function AutomationPage() {
  if (!(await allowed('automation.view'))) return <NoAccess />;
  const { runs, settings } = await loadAutomation();
  const autoBookEnv = process.env.AUTO_BOOK_ENABLED === 'true';
  const wixEnv = process.env.WIX_ORDER_SYNC_ENABLED === 'true';
  const autoBooking = settings.find(row => row.key === 'auto_booking')?.value as { enabled?: boolean; dryRun?: boolean } | undefined;
  const ok = runs.filter(run => run.status === 'success').length;

  return (
    <>
      <PageHead eyebrow="System" title="Automation" sub="Runs every 15 minutes on the Pi: pulls Woo orders, polls tracking, writes back to Woo and sends WhatsApp messages." />
      <div className="ops-grid stats">
        <SwitchStat label="Auto-booking" on={autoBookEnv && Boolean(autoBooking?.enabled)} detail={autoBookEnv ? (autoBooking?.enabled ? (autoBooking.dryRun ? 'On (dry run)' : 'On') : 'Switch on, lanes off') : 'Off — AUTO_BOOK_ENABLED is not set'} />
        <SwitchStat label="Wix sync" on={wixEnv} detail={wixEnv ? 'On' : 'Off — Wix is closing'} />
        <SwitchStat label="Tracking poll" on detail="Delhivery, FedEx, Shiprocket" />
        <SwitchStat label="WhatsApp (Chatwoot)" on detail="Order confirmed + shipped templates" />
        <div className="ops-stat"><span className="label">Healthy runs</span><span className="value">{runs.length ? `${Math.round((ok / runs.length) * 100)}%` : '—'}</span><span className="foot">Last {runs.length} runs</span></div>
      </div>
      <Card title="Recent runs" flush>
        {runs.length ? (
          <ul className="ops-list">
            {runs.map(run => {
              const counters = Object.entries(run.counters ?? {}).filter(([key, value]) => COUNTER_LABELS[key] && Number(value) > 0);
              const seconds = run.finished_at ? Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000) : null;
              return (
                <li key={run.id} style={{ alignItems: 'flex-start' }}>
                  <div style={{ paddingTop: 2 }}>
                    {run.status === 'success' ? <CheckCircle2 size={17} color="var(--tone-ok-fg)" /> : run.status === 'running' ? <CircleDashed size={17} color="var(--tone-info-fg)" /> : <XCircle size={17} color={run.status === 'partial' ? 'var(--tone-warn-fg)' : 'var(--tone-bad-fg)'} />}
                  </div>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{formatDate(run.started_at, true)} <span className="muted" style={{ fontWeight: 400 }}>· {run.trigger}{seconds !== null ? ` · ${seconds}s` : ''}</span></div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {counters.length ? counters.map(([key, value]) => <span key={key} className="tag">{COUNTER_LABELS[key]} {value}</span>) : <span className="faint" style={{ fontSize: 12.5 }}>Nothing to do</span>}
                    </div>
                    {run.error_summary ? <div style={{ fontSize: 12.5, color: 'var(--tone-bad-fg)', marginTop: 4, overflowWrap: 'anywhere' }}>{run.error_summary.slice(0, 400)}</div> : null}
                  </div>
                  <span className="faint nowrap" style={{ fontSize: 12 }}>{relativeAge(run.started_at)}</span>
                </li>
              );
            })}
          </ul>
        ) : <Empty title="No runs recorded" />}
      </Card>
    </>
  );
}

function SwitchStat({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="ops-stat">
      <span className="label"><Power size={13} color={on ? 'var(--tone-ok-fg)' : 'var(--faint)'} /> {label}</span>
      <span style={{ marginTop: 4 }}><Badge tone={on ? 'ok' : 'neutral'}>{on ? 'On' : 'Off'}</Badge></span>
      <span className="foot">{detail}</span>
    </div>
  );
}
