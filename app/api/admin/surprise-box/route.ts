/**
 * GET /api/admin/surprise-box — hediye kutusu KAMPANYALARI (sunucu sayfalı, arama + durum).
 * Otomatik günlük kutular bu listeye karışmaz (eski filtresiz `take: 200` hatası, rapor Bulgu 3).
 * Modül kapalıyken de admin listeyi görür; sayfa uyarı bandı gösterir, gönderim sunucuda kapalıdır.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { campaignListQuerySchema } from '@/lib/admin-surprise-boxes/contract';
import { listCampaigns } from '@/lib/admin-surprise-boxes/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.surpriseBox.list', roles: ['ADMIN'], query: campaignListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listCampaigns(query))
);
