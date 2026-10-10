/**
 * Müşteriler → aksiyonlar (segment, geri kazanım bandı ya da seçili müşteriler).
 *
 *   GET  → son 90 günün çalışma geçmişi + 14 günlük geri dönüş atfı (gönderilen → geri gelen → ciro).
 *   POST { mode: 'preview' | 'execute', audience, action } → önizleme (alıcı sayısı, elenenler ve
 *        nedenleri, örnek ileti, teklif seçenekleri) ya da onaylı gönderim.
 *
 * Alıcıları SUNUCU çözer; tercih (İYS/izin), 7 günlük sıklık tavanı, gönderim ve günlük tavan
 * uygulanır (lib/dealer-customers/actions.server.ts). Yalnız işletme sahibi gönderebilir;
 * personel ve yönetici (bayi adına) salt-okunur. `Idempotency-Key` ile çift tık tekrar oynatılır.
 */
import { after } from 'next/server';
import { defineRoute, ok } from '@/lib/http/define-route';
import { ActionBody } from '@/lib/dealer-customers/http';
import { executeAction, previewAction } from '@/lib/dealer-customers/actions.server';
import { listActionHistory } from '@/lib/dealer-customers/server';
import { sendMarketingPush } from '@/lib/marketing-delivery';
import type { ActionAudience, ActionSpec } from '@/lib/dealer-customers/types';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.customers.actions.history', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => {
    const items = await listActionHistory(tenant.dealerId, new Date(), { days: 90, limit: 30 });
    return ok({ items: items.map(({ segmentTag: _omit, ...rest }) => rest) });
  }
);

export const POST = defineRoute(
  {
    name: 'dealer.customers.actions',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: ActionBody,
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, tenant, user }) => {
    const audience = body.audience as ActionAudience;
    const spec = body.action as ActionSpec;
    if (body.mode === 'preview') {
      return ok(await previewAction(tenant.dealerId, audience, spec));
    }
    const { push, ...result } = await executeAction(tenant.dealerId, user.id, audience, spec);
    if (push.length > 0) {
      after(async () => {
        for (const job of push) {
          try {
            await sendMarketingPush(job.userIds, { title: job.title, message: job.message, url: job.url });
          } catch (err) {
            console.error('[dealer.customers.actions] push gönderilemedi:', err);
          }
        }
      });
    }
    return ok(result);
  }
);
