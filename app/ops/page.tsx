import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, PackagePlus, Truck, XCircle } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { loadToday } from '@/lib/ops/data.ts';
import { formatDate, formatMoney, relativeAge, STAGE_META, type OrderStage } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead, StageBadge, Stat } from '@/components/ops/ui';

export default async function TodayPage() {
  const profile = await allowed('orders.view');
  if (!profile) return <NoAccess />;
  const today = await loadToday();
  const firstName = String(profile.full_name || profile.name || '').split(' ')[0];
  const greeting = greetingFor(new Date());
  const lastRun = today.runs[0];
  const pipeline: OrderStage[] = ['paid', 'booked', 'pickup_requested', 'shipped', 'out_for_delivery', 'delivered'];
  const pipelineTotal = pipeline.reduce((sum, stage) => sum + (today.stageCounts[stage] ?? 0), 0) || 1;
  const placedDelta = today.placedToday.length - today.placedYesterday.length;

  return (
    <>
      <PageHead
        eyebrow={new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={`${greeting}${firstName && !profile.local ? `, ${firstName}` : ''}`}
        sub={summaryLine(today.toBook.length, today.toPickUp.length, today.problems.length)}
        actions={
          <>
            <Link className="btn" href="/ops/pickup" prefetch={false}><Truck size={15} /> Pickup</Link>
            <Link className="btn primary" href="/ops/booking" prefetch={false}><PackagePlus size={15} /> Book orders</Link>
          </>
        }
      />

      <div className="ops-grid stats">
        <Stat label="To book" tone="info" value={today.toBook.length} href="/ops/booking"
          foot={today.oldestToBook !== null && today.toBook.length ? `Oldest waiting ${today.oldestToBook === 0 ? 'today' : `${today.oldestToBook}d`}` : 'Queue is clear'}
          emphasis={today.oldestToBook !== null && today.oldestToBook >= 2 ? 'attention' : undefined} />
        <Stat label="Awaiting pickup" tone="brand" value={today.toPickUp.length} href="/ops/pickup" foot="Booked, not yet collected" />
        <Stat label="On the way" tone="violet" value={today.moving.length} href="/ops/orders?stage=in_transit"
          foot={today.stuck.length ? `${today.stuck.length} with no scan for days` : 'All moving'} emphasis={today.stuck.length ? 'attention' : undefined} />
        <Stat label="Exceptions" tone="bad" value={today.problems.length + today.errorGroups.length} href="/ops/exceptions"
          foot={`${today.problems.length} shipments · ${today.errorGroups.length} integration issues`} emphasis={today.problems.length ? 'alarm' : undefined} />
        <Stat label="Delivered today" tone="ok" value={today.deliveredToday.length} href="/ops/orders?stage=delivered" foot="Since midnight IST" />
      </div>

      <div className="ops-grid two">
        <Card title="Pipeline" hint="Orders from the last 180 days by stage">
          <div className="ops-meter" aria-hidden="true" style={{ height: 10, marginBottom: 16 }}>
            {pipeline.map(stage => (
              <span key={stage} title={STAGE_META[stage].label}
                style={{ width: `${((today.stageCounts[stage] ?? 0) / pipelineTotal) * 100}%`, background: `var(--tone-${STAGE_META[stage].tone}-fg)`, opacity: stage === 'delivered' ? 0.55 : 0.9 }} />
            ))}
          </div>
          <div className="ops-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {pipeline.map(stage => (
              <Link key={stage} href={`/ops/orders?stage=${stage}`} prefetch={false} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="muted" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--tone-${STAGE_META[stage].tone}-fg)` }} />
                  {STAGE_META[stage].label}
                </span>
                <span className="num" style={{ fontSize: 20, fontWeight: 700 }}>{today.stageCounts[stage] ?? 0}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Orders today" hint="Paid orders placed since midnight IST">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="num" style={{ fontSize: 34, fontWeight: 750, letterSpacing: '-0.03em' }}>{today.placedToday.length}</span>
            <Badge tone={placedDelta > 0 ? 'ok' : placedDelta < 0 ? 'warn' : 'neutral'} plain>
              {placedDelta === 0 ? 'same as yesterday' : `${placedDelta > 0 ? '+' : ''}${placedDelta} vs yesterday`}
            </Badge>
          </div>
          <p className="muted" style={{ marginTop: 6 }}>{formatMoney(today.revenueToday)} in order value · {today.placedYesterday.length} yesterday</p>
        </Card>
      </div>

      <div className="ops-grid two">
        <Card title="Latest orders" actions={<Link className="btn ghost sm" href="/ops/orders" prefetch={false}>All orders <ArrowRight size={14} /></Link>} flush>
          {today.recent.length ? (
            <ul className="ops-list">
              {today.recent.map(order => (
                <li key={order.id}>
                  <div className="grow">
                    <Link href={`/ops/orders/${order.id}`} prefetch={false} className="title">#{order.number} · {order.customer}</Link>
                    <div className="sub">{order.items || 'No items'} · {[order.city, order.state].filter(Boolean).join(', ') || order.country}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StageBadge stage={order.stage} />
                    <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{relativeAge(order.placedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty title="No orders yet" />}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Automation" hint={lastRun ? `Last run ${relativeAge(lastRun.started_at)} · every 15 min` : 'No runs recorded'}
            actions={<Link className="btn ghost sm" href="/ops/automation" prefetch={false}>Details</Link>}>
            {lastRun ? (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12 }} aria-label="Recent runs">
                  {today.runs.slice().reverse().map(run => (
                    <span key={run.id} title={`${formatDate(run.started_at, true)} · ${run.status}`}
                      style={{ flex: 1, height: 22, borderRadius: 4, background: `var(--tone-${run.status === 'success' ? 'ok' : run.status === 'partial' ? 'warn' : run.status === 'running' ? 'info' : 'bad'}-bg)`, border: `1px solid var(--tone-${run.status === 'success' ? 'ok' : run.status === 'partial' ? 'warn' : run.status === 'running' ? 'info' : 'bad'}-fg)`, opacity: 0.8 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {lastRun.status === 'success' ? <CheckCircle2 size={16} color="var(--tone-ok-fg)" /> : lastRun.status === 'running' ? <CircleDashed size={16} color="var(--tone-info-fg)" /> : lastRun.status === 'partial' ? <AlertTriangle size={16} color="var(--tone-warn-fg)" /> : <XCircle size={16} color="var(--tone-bad-fg)" />}
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{lastRun.status}</span>
                  <span className="muted">· {runSummary(lastRun.counters)}</span>
                </div>
                {lastRun.error_summary ? <p className="muted" style={{ marginTop: 6, fontSize: 12.5, overflowWrap: 'anywhere' }}>{lastRun.error_summary.slice(0, 220)}</p> : null}
              </>
            ) : <Empty title="Automation has not run yet" />}
          </Card>

          <Card title="Needs attention" actions={<Link className="btn ghost sm" href="/ops/exceptions" prefetch={false}>Open exceptions</Link>} flush>
            {today.problems.length || today.errorGroups.length ? (
              <ul className="ops-list">
                {today.problems.slice(0, 4).map(order => (
                  <li key={order.id}>
                    <div className="grow">
                      <Link href={`/ops/orders/${order.id}`} prefetch={false} className="title">#{order.number} · {order.customer}</Link>
                      <div className="sub">{order.shipment?.courier_code ?? ''} {order.shipment?.waybill ?? ''}</div>
                    </div>
                    <StageBadge stage={order.stage} />
                  </li>
                ))}
                {today.errorGroups.slice(0, Math.max(0, 5 - Math.min(4, today.problems.length))).map(group => (
                  <li key={group.key}>
                    <div className="grow">
                      <div className="title">{group.integration} · {group.operation}</div>
                      <div className="sub">{group.message}</div>
                    </div>
                    <span className="faint nowrap" style={{ fontSize: 12 }}>{group.count > 1 ? `${group.count}× · ` : ''}{relativeAge(group.latest)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="Nothing needs attention" icon={<CheckCircle2 size={20} />} />}
          </Card>
        </div>
      </div>
    </>
  );
}

function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function summaryLine(toBook: number, toPickUp: number, problems: number): string {
  const parts = [
    toBook ? `${toBook} to book` : null,
    toPickUp ? `${toPickUp} waiting for pickup` : null,
    problems ? `${problems} exception${problems === 1 ? '' : 's'}` : null
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}.` : 'All queues are clear.';
}

function runSummary(counters: Record<string, number> | null): string {
  if (!counters) return 'no counters';
  const parts = [
    counters.wooPersisted ? `${counters.wooPersisted} Woo orders synced` : null,
    counters.booked ? `${counters.booked} booked` : null,
    counters.trackingUpdated ? `${counters.trackingUpdated} tracking updates` : null,
    counters.shipmentMessagesSent ? `${counters.shipmentMessagesSent} messages` : null,
    counters.autoBookDisabled ? `${counters.autoBookDisabled} left for manual booking` : null
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : `${counters.checked ?? 0} orders checked`;
}
