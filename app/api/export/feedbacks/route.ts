/**
 * Server-side feedback export: satır limiti, watermark, süreli erişim.
 * POST: export isteği; response CSV veya signed download URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, dealerScopeWhere } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { EXPORT_ROW_LIMIT, feedbackCSVColumns } from '@/lib/export-utils';
import { formatDateUTC } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const scope = dealerScopeWhere(session);
  const where = 'dealerId' in scope && scope.dealerId
    ? { qrCode: { dealerId: scope.dealerId }, deletedAt: null } as Record<string, unknown>
    : { deletedAt: null } as Record<string, unknown>;

  const feedbacks = await prisma.feedback.findMany({
    where: where as Record<string, unknown>,
    take: EXPORT_ROW_LIMIT,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true } },
      qrCode: { select: { name: true } },
    },
  });

  const rows = feedbacks.map((f) => ({
    createdAt: formatDateUTC(f.createdAt),
    userName: f.user?.name || 'Anonim',
    rating: f.rating,
    text: f.text || '',
    sentiment: f.sentiment || '',
    qrName: f.qrCode?.name || '',
    dealerReply: f.dealerReply || '',
  }));

  const header = feedbackCSVColumns.map((c) => `"${c.label}"`).join(',');
  const csvRows = rows.map((r) =>
    feedbackCSVColumns
      .map((c) => {
        const val = (r as Record<string, unknown>)[c.key];
        if (val == null) return '""';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return `"${val}"`;
      })
      .join(',')
  );
  const watermark = `#QRATEX Export | User: ${session.user.id} | ${new Date().toISOString()}`;
  const csv = [header, ...csvRows, `"${watermark}"`].join('\n');
  const BOM = '\uFEFF';

  return new NextResponse(BOM + csv, {
    headers: {
      ...PRIVATE_NO_STORE_HEADERS,
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="geri_bildirimler_${formatDateUTC(new Date())}.csv"`,
    },
  });
}
