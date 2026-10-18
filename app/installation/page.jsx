import { OrderQueuePage } from '@/components/order-queue-page';
import { listOrders } from '@/lib/crm/data';

export default async function InstallationPage() {
  const orders = (await listOrders({ limit: 150 })).filter(order => {
    const paid = ['PAID', 'APPROVED', 'paid', 'approved'].includes(order.payment_status);
    return paid && ['installation_pending', 'issue_reported', 'warranty_case', 'fulfilled_no_tracking'].includes(order.internal_status);
  });
  return <OrderQueuePage eyebrow="Installation" title="Installation follow-up" description="Delivered orders, store/pickup fulfillments without tracking, guide/video follow-up, completed installs, and issue escalation." orders={orders} />;
}
