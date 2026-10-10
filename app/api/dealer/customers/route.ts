/**
 * GET /api/dealer/customers — Müşteriler listesi (sunucu sayfalama, arama, filtre, sıralama).
 *
 *   ?q=&segment=at_risk|vip|loyal|dormant|new&risk=high|medium|low|unknown&band=waking|sleeping|lost
 *   &sort=spend|visits|avg|lastVisit|risk(.asc|.desc)&page=1&size=20
 *
 * Bütün metrikler YALNIZ bu işletmenin verisinden (`DealerCustomerStats` ya da canlı bayi kapsamlı
 * hesap; P0-12). E-posta herkese maskeli; ham kullanıcı kimliği dönmez (şifreli `ref`). Boş değerli
 * sıralamada boşlar her zaman sonda (eski "kayıp riski" sıralaması NULLS FIRST'tü).
 * Geriye uyum: eski istemciler için `customers`, `count`, `total` kökte de döner.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { CustomerListQuery } from '@/lib/dealer-customers/http';
import { listCustomers } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.customers.list',
    roles: ['DEALER', 'STAFF', 'ADMIN'],
    tenant: 'dealer',
    query: CustomerListQuery,
    rateLimit: 'read',
  },
  async ({ query, tenant }) => {
    const page = await listCustomers(tenant.dealerId, query);
    return ok({ ...page, customers: page.items, count: page.items.length }, { legacySpread: true });
  }
);
