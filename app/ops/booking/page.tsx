import Link from 'next/link';
import { CheckCircle2, Info } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { isStale, loadBookingQueue, type OpsOrder } from '@/lib/ops/data.ts';
import { bookingDefaults } from '@/lib/ops/booking-defaults.ts';
import { ageInDays, formatDate, formatMoney, LANE_LABEL, type Lane } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, Notice, PageHead, StageBadge } from '@/components/ops/ui';
import { BookButton, type BookableOrder, type BookingDefaults } from '@/components/ops/client';

const LANES: Lane[] = ['domestic', 'intl_standard', 'intl_express'];

export default async function BookingQueuePage() {
  if (!(await allowed('shipping.book'))) return <NoAccess />;
  const [{ queue, failed }, defaults] = await Promise.all([loadBookingQueue(), bookingDefaults()]);
  const now = new Date();
  const live = queue.filter(order => !isStale(order, now));
  const stale = queue.filter(order => isStale(order, now));

  return (
    <>
      <PageHead
        eyebrow="Work"
        title="Booking queue"
        sub={live.length ? `${live.length} paid order${live.length === 1 ? '' : 's'} waiting for an AWB, oldest first.` : 'Nothing waiting to be booked.'}
      />
      <Notice icon={<Info size={16} />}>
        Auto-booking is <strong>off</strong> for every lane, so orders wait here for you. Booking creates the AWB and label only.
        Woo moves to <em>Shipped</em> when the courier picks the parcel up.
      </Notice>

      {live.length === 0 ? (
        <Card><Empty title="Queue is clear" icon={<CheckCircle2 size={20} />}>New paid orders appear here within 15 minutes of checkout.</Empty></Card>
      ) : LANES.map(lane => {
        const orders = live.filter(order => order.lane === lane);
        if (!orders.length) return null;
        return (
          <Card key={lane} title={<>{LANE_LABEL[lane]} <Badge plain>{orders.length}</Badge></>} hint={laneHint(lane)} flush>
            <QueueTable orders={orders} failed={failed} defaults={defaults} now={now} />
          </Card>
        );
      })}

      {stale.length ? (
        <Card title={<>Paid over 30 days ago, never booked <Badge tone="warn" plain>{stale.length}</Badge></>}
          hint="Usually shipped outside Ops or abandoned. Check each one, then book it or cancel it in the store." flush>
          <QueueTable orders={stale} failed={failed} defaults={defaults} now={now} />
        </Card>
      ) : null}
    </>
  );
}

function laneHint(lane: Lane): string {
  if (lane === 'domestic') return 'India · default Delhivery Express';
  if (lane === 'intl_express') return 'Outside India, express shipping chosen · default FedEx';
  return 'Outside India, standard shipping · Delhivery international or FedEx';
}

function QueueTable({ orders, failed, defaults, now }: { orders: OpsOrder[]; failed: Set<string>; defaults: BookingDefaults; now: Date }) {
  return (
    <div className="ops-table-wrap">
      <table className="ops-table stack">
        <thead>
          <tr>
            <th>Order</th>
            <th>Ship to</th>
            <th className="ops-hide-narrow">Items</th>
            <th className="right">Value</th>
            <th>Waiting</th>
            <th>Checks</th>
            <th className="right" />
          </tr>
        </thead>
        <tbody>
          {orders.map(order => {
            const waiting = ageInDays(order.placedAt, now);
            const bookable: BookableOrder = {
              id: order.id, number: order.number, customer: order.customer, phone: order.phone, address1: order.address1,
              postalCode: order.postalCode, country: order.country, total: order.total, lane: order.lane, review: order.review
            };
            return (
              <tr key={order.id}>
                <td>
                  <Link href={`/ops/orders/${order.id}`} prefetch={false} className="row-link">#{order.number}</Link>
                  <span className="sub">{order.source === 'woocommerce' ? 'Woo' : order.source} · {formatDate(order.placedAt, true)}</span>
                </td>
                <td>
                  {order.customer}
                  <span className="sub">{[order.city, order.postalCode, order.country !== 'IN' ? order.country : ''].filter(Boolean).join(' · ') || 'No address'}</span>
                </td>
                <td className="ops-hide-narrow" style={{ maxWidth: 280 }}><span className="sub" style={{ color: 'var(--ink-2)', whiteSpace: 'normal' }}>{order.items || '—'}</span></td>
                <td className="right num">{formatMoney(order.total, order.currency)}</td>
                <td className="nowrap">
                  <Badge tone={waiting !== null && waiting >= 2 ? 'warn' : 'neutral'} plain>{waiting === null ? '—' : waiting === 0 ? 'Today' : `${waiting}d`}</Badge>
                </td>
                <td style={{ maxWidth: 260 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {order.stage === 'on_hold' ? <StageBadge stage="on_hold" /> : null}
                    {failed.has(order.id) ? <Badge tone="bad">Last booking failed</Badge> : null}
                    {order.review.map(flag => <span key={flag.reason} className="sub" style={{ color: `var(--tone-${flag.tone}-fg)`, whiteSpace: 'normal' }}>{flag.reason}</span>)}
                    {!order.review.length && !failed.has(order.id) && order.stage !== 'on_hold' ? <Badge tone="ok" plain>Ready</Badge> : null}
                  </div>
                </td>
                <td className="right"><BookButton order={bookable} defaults={defaults} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
