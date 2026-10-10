/**
 * GET /api/dealer/segment-actions — Müşteriler → Segmentler sekmesi (eski Segment Aksiyon Merkezi).
 *
 * Etiketler ÖRTÜŞEBİLİR (Risk Altında · VIP · Sadık · Uyuyan · Yeni): eski tek-segment modeli uyuyan
 * VIP'leri gizliyordu. Hepsi YALNIZ bu işletmenin verisinden (P0-12); VIP işletmeye göredir (harcamada
 * üst %10). Her kartta bu işletmedeki harcama, ortalama risk ve bu segmente yapılan son aksiyon.
 *
 * Aksiyonlar artık bu uçtan endpoint adresi olarak DÖNMEZ (eski sözleşme 4/5 butonda 400 alıyordu):
 * önizle → onayla akışı `POST /api/dealer/customers/actions` ile sunucuda çözülür.
 * Geriye uyum: `segments[].name` (Türkçe ad) ve `totalCustomers` kökte de döner.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSegmentsOverview } from '@/lib/dealer-customers/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.customers.segments', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await getSegmentsOverview(tenant.dealerId), { legacySpread: true })
);
