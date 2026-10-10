/**
 * GET /api/customer/remedy — müşterinin telafi teklifleri (Seslerim → Telafi).
 *
 * Yalnız müşteriye görünür durumlar (`pending`, `accepted`, `expired`); onay kuyruğu ve
 * reddedilenler asla dönmez. Her teklifte insan diliyle seçim ("%20 İndirim"), puan türünde
 * hesaba geçen miktar ve kaynağın (yorumun) Seslerim anahtarı + kısa bağlamı vardır.
 * Bekleyenler en üstte; 50'den fazlası `hasMore` ile bildirilir (sessiz kesilme yok).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { listCustomerRemedies } from '@/lib/customer-voices/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.remedy.list', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const { items, hasMore } = await listCustomerRemedies(user.id);
    return ok({ offers: items, hasMore }, { legacySpread: true });
  }
);
