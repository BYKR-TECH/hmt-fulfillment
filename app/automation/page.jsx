import { AppShell } from '@/components/app-shell';
import { AutomationActions } from '@/components/automation-actions';
import { StatusPill } from '@/components/status-pill';
import { getAutomationDashboardData } from '@/lib/crm/automation';

export const dynamic = 'force-dynamic';

export default async function AutomationPage() {
  const data = await getAutomationDashboardData();
  const model = automationViewModel(data);

  return (
    <AppShell>
      <AutomationHeader status={model.status} />
      <AutomationError error={model.error} />
      <AutomationMetrics model={model} />
      <QueueMetrics queues={model.queueCards} />
      <RunWorkspace model={model} />
      <AutomationErrors errors={model.errors} />
    </AppShell>
  );
}

function AutomationHeader({ status }) { return <header className="pageHeader"><div><p className="eyebrow">Automation</p><h1>Shipment automation control tower</h1><p className="muted">Local Raspberry Pi cron should call the protected run API every 15 minutes.</p></div><div className="toolbar"><StatusPill value={status} /></div></header>; }
function AutomationError({ error }) { return error ? <section className="panel"><div className="panelBody"><span className="pill danger">{error}</span></div></section> : null; }
function AutomationMetrics({ model }) { return <section className="grid metrics"><article className="card metric"><span>Last run</span><strong>{model.lastRunAt}</strong><small>{model.lastRunTrigger}</small></article><article className="card metric"><span>Next expected</span><strong>{model.nextRunAt}</strong><small>15 minute timer</small></article><article className="card metric"><span>Booked</span><strong>{model.counters.booked || 0}</strong><small>{model.counters.queued || 0} queued</small></article><article className="card metric"><span>Updated</span><strong>{model.counters.wixUpdated || 0} / {model.counters.orderConfirmationsSent || 0}</strong><small>Wix / WhatsApp confirmations</small></article></section>; }
function QueueMetrics({ queues }) { return <section className="grid threeCol" style={{ marginTop: 14 }}>{queues.map(([label, value]) => <article className="card metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>; }
function RunWorkspace({ model }) { return <section className="grid twoCol" style={{ marginTop: 14 }}><AutomationActions batches={model.batches} /><section className="panel"><div className="panelHeader"><h2>Recent runs</h2></div><div className="panelBody grid">{model.runs.map(run => <div className="activityCard" key={run.id}><strong>{run.trigger}</strong><span className="subtle">{formatDate(run.started_at)}</span><div className="toolbar" style={{ marginTop: 8 }}><StatusPill value={run.status} /><span className="muted">{run.counters?.processed || 0} processed</span></div>{run.error_summary ? <p className="muted" style={{ marginTop: 8 }}>{run.error_summary}</p> : null}</div>)}{!model.runs.length ? <p className="muted">No automation runs recorded yet.</p> : null}</div></section></section>; }
function AutomationErrors({ errors }) { return <section className="panel"><div className="panelHeader"><h2>Open automation errors</h2></div><div className="panelBody grid">{errors.map(error => <div className="activityCard" key={error.id}><strong>{error.integration} · {error.operation}</strong><span className="subtle">{formatDate(error.occurred_at)}</span><p className="muted">{error.message}</p></div>)}{!errors.length ? <p className="muted">No open integration errors.</p> : null}</div></section>; }

function automationViewModel(data) {
  const queues = data.queues || {};
  const lastRun = data.lastRun;
  return {
    status: lastRun?.status || data.state?.lastResult?.status || 'not_run', error: data.ok ? '' : data.error,
    lastRunAt: lastRun?.started_at ? new Date(lastRun.started_at).toLocaleTimeString('en-IN') : '-', lastRunTrigger: lastRun?.trigger || 'Waiting',
    nextRunAt: data.nextRunHint ? new Date(data.nextRunHint).toLocaleTimeString('en-IN') : '-', counters: lastRun?.counters || data.state?.lastResult?.counters || {},
    queueCards: [['Ready to book', queues.readyToBook || 0], ['Blocked validation', queues.blockedValidation || 0], ['FedEx Excel pending', queues.fedexPending || 0], ['Awaiting FedEx AWB', queues.awaitingFedexAwb || 0], ['Wix failed', queues.wixFailed || 0], ['Chatwoot failed', queues.chatwootFailed || 0], ['Courier failed', queues.courierFailed || 0], ['Active tracking', queues.activeTracking || 0], ['Manual holds', queues.manualHolds || 0]],
    batches: data.fedexBatches || [], runs: data.runs || [], errors: data.errors || []
  };
}

function formatDate(value) { return value ? new Date(value).toLocaleString('en-IN') : ''; }
