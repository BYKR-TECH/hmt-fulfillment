import { NextResponse } from 'next/server';
import { getOrder, updateOrder } from '@/lib/crm/data';
import { isValidOrderStatus } from '@/lib/crm/constants';

export async function GET(_request, { params }) {
  const { id } = await params;
  const detail = await getOrder(id);
  return NextResponse.json(detail);
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const payload = await request.json();
  if (payload.internal_status !== undefined && !isValidOrderStatus(payload.internal_status)) {
    return NextResponse.json({ ok: false, error: 'Choose a valid order status.' }, { status: 400 });
  }
  const result = await updateOrder(id, payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
