import { redirect } from 'next/navigation';
import { sendCommunication } from '@/lib/crm/data';

export async function POST(request, { params }) {
  const [{ id }, form] = await Promise.all([params, request.formData()]);
  await sendCommunication(id, form.get('type'));
  redirect(`/orders/${id}`);
}
