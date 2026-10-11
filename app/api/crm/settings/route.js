import { requirePermission } from '@/lib/current-user';
import { NextResponse } from 'next/server';
import { getCrmSettings, saveCrmSettings } from '@/lib/crm/data-settings';

export async function GET() {
  await requirePermission('settings.view');
  return NextResponse.json({ settings: await getCrmSettings() });
}

export async function POST(request) {
  const actor = await requirePermission('settings.manage');
  const payload = await request.json();
  const result = await saveCrmSettings(payload, actor);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
