import Link from 'next/link';
import { FileSpreadsheet, Info } from 'lucide-react';
import { allowed } from '@/lib/ops/guard.ts';
import { Card, NoAccess, Notice, PageHead } from '@/components/ops/ui';

export default async function GstPage() {
  if (!(await allowed('gst.view'))) return <NoAccess />;
  return (
    <>
      <PageHead eyebrow="Records" title="GST report" sub="Monthly invoices for the CA." />
      <Notice tone="warn" icon={<Info size={16} />}>
        The new GST engine (CGST + SGST for Karnataka buyers, IGST for other states, exports under LUT, HSN summary, credit notes) is the next tax module.
        Until it ships, use the existing export — it prints a single 18% GST line and needs a manual state split.
      </Notice>
      <Card title="Current export">
        <Link className="btn" href="/gst-invoices" prefetch={false}><FileSpreadsheet size={15} /> Open GST invoices (old screen)</Link>
      </Card>
    </>
  );
}
