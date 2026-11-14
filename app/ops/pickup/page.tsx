import Link from 'next/link';
import { CheckCircle2, FileDown, MapPin, RefreshCw } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { loadPickupBoard } from '@/lib/ops/data.ts';
import { ageInDays, formatDate } from '@/lib/ops/model.ts';
import { Badge, Card, Empty, NoAccess, PageHead, ShipmentBadge } from '@/components/ops/ui';
import { ActionButton, RequestPickupButton } from '@/components/ops/client';

export default async function PickupPage() {
  if (!(await allowed('shipping.pickup'))) return <NoAccess />;
  const { groups, notPicked } = await loadPickupBoard();
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const now = new Date();

  return (
    <>
      <PageHead
        eyebrow="Work"
        title="Pickup"
        sub={total ? `${total} parcel${total === 1 ? '' : 's'} booked and waiting for the courier. Request before 4 pm IST for same-day pickup.` : 'No parcels waiting for pickup.'}
        actions={<ActionButton url="/api/crm/pickups/refresh" done="Live tracking refreshed"><RefreshCw size={14} /> Refresh tracking</ActionButton>}
      />

      {notPicked.length ? (
        <div className="ops-notice warn">
          <div><strong>{notPicked.length} parcel{notPicked.length === 1 ? ' was' : 's were'} not picked up.</strong> They stay on this list; request pickup again for the next slot.</div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Card><Empty title="Nothing to pick up" icon={<CheckCircle2 size={20} />}>Booked parcels appear here until the courier scans them.</Empty></Card>
      ) : groups.map(group => {
        const requestable = group.rows.filter(row => row.shipment.state === 'booked').length;
        const requested = group.rows.filter(row => row.shipment.state === 'pickup_requested').length;
        const isDelhivery = group.courier === 'delhivery';
        return (
          <Card key={group.key}
            title={<><MapPin size={15} /> {group.location} <span className="tag" style={{ textTransform: 'capitalize' }}>{group.courier}</span></>}
            hint={`${group.rows.length} parcel${group.rows.length === 1 ? '' : 's'}${requested ? ` · ${requested} pickup requested` : ''}`}
            actions={isDelhivery && requestable && group.location !== 'No pickup location' ? <RequestPickupButton location={group.location} count={requestable} /> : null}
            flush>
            <div className="ops-table-wrap">
              <table className="ops-table stack">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>AWB</th>
                    <th>Status</th>
                    <th>Booked</th>
                    <th className="right" />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(({ order, shipment }) => {
                    const age = ageInDays(shipment.created_at, now);
                    return (
                      <tr key={shipment.id}>
                        <td>
                          <Link href={`/ops/orders/${order.id}`} prefetch={false} className="row-link">#{order.number}</Link>
                          <span className="sub">{order.customer} · {order.city || order.country}</span>
                        </td>
                        <td className="mono">{shipment.waybill}</td>
                        <td><ShipmentBadge state={shipment.state} /></td>
                        <td className="nowrap">
                          {formatDate(shipment.created_at)}
                          {age !== null && age >= 2 ? <span className="sub" style={{ color: 'var(--tone-warn-fg)' }}>{age} days waiting</span> : null}
                        </td>
                        <td className="right">
                          <div className="ops-actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            {shipment.label_url || shipment.courier_code === 'delhivery'
                              ? <a className="btn sm ghost" href={`/api/crm/shipments/${shipment.id}/label-file`} target="_blank" rel="noreferrer" title="Download label"><FileDown size={14} /><span className="ops-hide-mobile">Label</span></a>
                              : null}
                            <ActionButton url={`/api/crm/orders/${order.id}/shipments/${shipment.id}/mark-picked-up`} size="sm"
                              confirm={`Mark #${order.number} (${shipment.waybill}) as picked up? This marks the order Shipped in the store and sends the customer their tracking message.`}
                              done={`#${order.number} marked picked up`}>
                              Mark picked up
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {groups.length ? <p className="faint" style={{ fontSize: 12.5 }}>Courier pickup scans are picked up automatically every 15 minutes; <Badge plain>Mark picked up</Badge> is for when you have handed the parcel over and the scan has not arrived.</p> : null}
    </>
  );
}
