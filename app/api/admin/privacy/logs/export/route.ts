/**
 * 5651 kayıtlarının kanıt dışa aktarımı (CSV). Aynı filtreler; en fazla 5000 satır.
 * Yanıt başlığında içerik özeti (SHA-256) döner ve dışa aktarım AuditLog'a yazılır
 * (kim, ne zaman, hangi filtreyle, kaç satır, hangi özet).
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { logsQuerySchema } from '@/lib/admin-privacy/contract';
import { listUnifiedLogs, logsToCsv } from '@/lib/admin-privacy/server';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const EXPORT_MAX_ROWS = 5000;

export const GET = defineRoute(
  { name: 'admin.privacy.logs.export', roles: ['ADMIN'], query: logsQuerySchema, rateLimit: 'sensitive' },
  async ({ query, user, request }) => {
    const page = await listUnifiedLogs(prisma, { ...query, cursor: query.cursor }, { maxRows: EXPORT_MAX_ROWS });
    const csv = logsToCsv(page.items);
    const digest = createHash('sha256').update(csv, 'utf8').digest('hex');
    const truncated = page.nextCursor !== null;
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actorType: 'user',
        action: 'compliance_log_export',
        entity: 'ComplianceLog',
        newData: {
          filters: { source: query.source, q: query.q ?? null, user: query.user ?? null, from: query.from ?? null, to: query.to ?? null },
          rows: page.items.length,
          truncated,
          sha256: digest,
        },
        ...getAuditRequestMeta(request),
      },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="qratex-5651-kayitlari-${stamp}.csv"`,
        'x-content-sha256': digest,
        'x-row-count': String(page.items.length),
        'x-truncated': truncated ? '1' : '0',
        'access-control-expose-headers': 'x-content-sha256, x-row-count, x-truncated',
      },
    });
  }
);
