/**
 * 5651 birleşik erişim kayıtları (AuditLog + CardAuditLog + SuspiciousActivity + erişim engeli).
 *
 *   GET ?source&q&user&from&to&cursor&size → { items, nextCursor }
 *
 * Kaynaklar arası keyset sayfalama (her kaynaktan en fazla size+1 satır). IP HER ZAMAN maskeli:
 * eski `includeSensitive=true` kaldırıldı (veri minimizasyonu; denetimsiz ham IP erişimi yok).
 */
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { logsQuerySchema } from '@/lib/admin-privacy/contract';
import { listUnifiedLogs } from '@/lib/admin-privacy/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.privacy.logs', roles: ['ADMIN'], query: logsQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listUnifiedLogs(prisma, query))
);
