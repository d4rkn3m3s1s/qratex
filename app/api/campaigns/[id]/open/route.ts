/**
 * GET /api/campaigns/:id/open — kampanya push bildirimine dokunulduğunda açılan izlenen bağlantı.
 *
 * Oturumlu MÜŞTERİ ise kişi başına bir kez `campaign_push_open` olayı yazar (performans hunisinin
 * "açıldı" adımı; ölçümde yalnız gerçek alıcılar sayılır, sahte tıklama huniyi şişiremez) ve
 * işletmenin mekân sayfasına yönlendirir. Oturum yoksa ya da kampanya bulunamazsa yalnız
 * yönlendirir (kayıt yok). Hata kullanıcıyı asla boş sayfada bırakmaz.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { defineRoute } from '@/lib/http/define-route';
import { PUSH_OPEN_EVENT } from '@/components/dealer/b-kampanyalar/server/performance';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) });

function redirectTo(request: Request, path: string): Response {
  const res = NextResponse.redirect(new URL(path, request.url), 302);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

export const GET = defineRoute(
  { name: 'campaigns.push-open', roles: 'public', rateLimit: 'read', params },
  async ({ params: p, request }) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: p.id }, select: { id: true, dealerId: true, status: true } });
    if (!campaign) return redirectTo(request, '/customer');
    const target = `/customer/places/${encodeURIComponent(campaign.dealerId)}`;
    try {
      // Yetki DB'den (rol, askı, oturum sürümü); müşteri değilse yalnız yönlendirilir.
      const auth = await requireAuth(['CUSTOMER']);
      const userId = 'error' in auth ? null : auth.session.user.id;
      if (userId && (campaign.status === 'sent' || campaign.status === 'archived')) {
        const seen = await prisma.analyticsEvent.findFirst({
          where: { userId, event: PUSH_OPEN_EVENT, data: { path: ['campaignId'], equals: campaign.id } },
          select: { id: true },
        });
        if (!seen) {
          await prisma.analyticsEvent.create({
            data: { userId, event: PUSH_OPEN_EVENT, category: 'campaign', data: { campaignId: campaign.id, dealerId: campaign.dealerId } },
          });
        }
      }
    } catch (err) {
      // Ölçüm kaydı yazılamasa da müşteri mekân sayfasına ulaşır.
      console.error('[campaign-open] açılma kaydedilemedi', campaign.id, err);
    }
    return redirectTo(request, target);
  }
);
