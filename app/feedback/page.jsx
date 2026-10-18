import { OrderQueuePage } from '@/components/order-queue-page';
import { listOrders } from '@/lib/crm/data';

export default async function FeedbackPage() {
  const orders = (await listOrders({ limit: 150 })).filter(order => {
    const paid = ['PAID', 'APPROVED', 'paid', 'approved'].includes(order.payment_status);
    const eligibleStatus = ['installation_pending', 'fulfilled_no_tracking', 'completed', 'issue_reported'].includes(order.internal_status);
    return paid && eligibleStatus && ['feedback_pending', 'positive_feedback', 'negative_feedback', 'review_requested', 'issue_escalated'].includes(order.feedback_status);
  });
  return <OrderQueuePage eyebrow="Feedback" title="Feedback and review queue" description="Day 3, 7, 14, and 30 follow-ups for installation checks, product feedback, reviews, photos, and videos." orders={orders} />;
}
