/** GET /api/dealer/qr-codes/summary — sayfalamadan bağımsız sunucu özeti (rapor Bulgu 5). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadQrSummary } from '@/lib/dealer/qr-codes/load.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.qr-codes.summary', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await loadQrSummary(tenant.dealerId))
);
