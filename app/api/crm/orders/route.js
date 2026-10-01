import { NextResponse } from 'next/server';
import { createManualOrder, listOrders, listOrdersPage } from '@/lib/crm/data';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has('page')) {
    const result = await listOrdersPage({
      query: searchParams.get('q') || '', status: searchParams.get('status') || '',
      source: searchParams.get('source') || '', page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize') || 50
    });
    return NextResponse.json(result);
  }
  const orders = await listOrders({
    query: searchParams.get('q') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    limit: Number(searchParams.get('limit') || 100)
  });
  return NextResponse.json({ orders });
}

export async function POST(request) {
  const payload = await request.json();
  const result = await createManualOrder(payload);
  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
