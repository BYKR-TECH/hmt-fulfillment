import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { loadExceptions, type ExceptionItem } from '@/lib/ops/data.ts';
import { relativeAge, type Tone } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead, StageBadge, Tabs } from '@/components/ops/ui';

type Search = Promise<Record<string, string | string[] | undefined>>;

const KINDS: { key: ExceptionItem['kind'] | ''; label: string; tone: Tone }[] = [
  { key: '', label: 'All', tone: 'neutral' },
  { key: 'ndr', label: 'Delivery failed', tone: 'bad' },
  { key: 'rto', label: 'Returns', tone: 'bad' },
  { key: 'stuck', label: 'No movement', tone: 'warn' },
  { key: 'not_picked', label: 'Not picked', tone: 'warn' },
  { key: 'booking_failed', label: 'Booking failed', tone: 'bad' },
  { key: 'review', label: 'Needs review', tone: 'warn' },
  { key: 'exception', label: 'Unknown status', tone: 'warn' },
  { key: 'lost', label: 'Lost', tone: 'bad' },
  { key: 'integration', label: 'Integrations', tone: 'info' }
];

export default async function ExceptionsPage({ searchParams }: { searchParams: Search }) {
  if (!(await allowed('exceptions.view'))) return <NoAccess />;
  const params = await searchParams;
  const kind = typeof params.kind === 'string' ? params.kind : '';
  const { items, counts, errorRows } = await loadExceptions();
  const shown = kind ? items.filter(item => item.kind === kind) : items;
  const tone = (k: string) => KINDS.find(entry => entry.key === k)?.tone ?? 'neutral';
  const label = (k: string) => KINDS.find(entry => entry.key === k)?.label ?? k;

  return (
    <>
      <PageHead eyebrow="Work" title="Exceptions"
        sub={items.length ? `${items.length} open item${items.length === 1 ? '' : 's'}. Delivery failures are due the same day.` : 'Nothing needs attention.'} />
      <Tabs items={KINDS.filter(entry => !entry.key || counts[entry.key]).map(entry => ({
        href: entry.key ? `/ops/exceptions?kind=${entry.key}` : '/ops/exceptions',
        label: entry.label,
        count: entry.key ? counts[entry.key] ?? 0 : items.length,
        active: kind === entry.key
      }))} />

      <Card flush>
        {shown.length ? (
          <ul className="ops-list">
            {shown.map(item => (
              <li key={item.key} style={{ alignItems: 'flex-start' }}>
                <div style={{ paddingTop: 2 }}><Badge tone={tone(item.kind)}>{label(item.kind)}</Badge></div>
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>
                    {item.order ? <Link href={`/ops/orders/${item.order.id}`} prefetch={false}>#{item.order.number} · {item.order.customer}</Link> : item.title}
                  </div>
                  {item.order ? <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{item.title}</div> : null}
                  <div className="muted" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.detail}</div>
                  {item.order?.shipment?.waybill ? <div className="faint" style={{ fontSize: 12, marginTop: 2 }}><span style={{ textTransform: 'capitalize' }}>{item.order.shipment.courier_code}</span> · <span className="mono">{item.order.shipment.waybill}</span>{item.order.phone ? ` · ${item.order.phone}` : ''}</div> : null}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  {item.order ? <StageBadge stage={item.order.stage} /> : null}
                  {item.group && item.group.count > 1 ? <div><Badge plain>{item.group.count}× logged</Badge></div> : null}
                  <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{relativeAge(item.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="Nothing here" icon={<CheckCircle2 size={20} />}>Delivery failures, returns, stuck parcels and integration errors show up here automatically.</Empty>}
      </Card>
      {counts.integration ? (
        <p className="faint" style={{ fontSize: 12.5 }}>
          Integration errors are grouped from the latest 1,000 of {errorRows.toLocaleString('en-IN')} open rows. The current automation logs the same failure on every run;
          the new job runner records each problem once.
        </p>
      ) : null}
    </>
  );
}
