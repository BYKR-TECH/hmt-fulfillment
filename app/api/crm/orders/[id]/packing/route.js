import { NextResponse } from 'next/server';
import { updatePacking } from '@/lib/crm/data';

export async function POST(request, { params }) {
  const [{ id }, payload] = await Promise.all([params, request.json()]);
  const result = await updatePacking(id, payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
