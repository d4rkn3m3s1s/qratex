/**
 * GET — klan odası BFF'i (tek çağrı): kimlik, haftalık hedef, savaş + son sonuç, kadro
 * (katkıya göre), lig (kendi sıran dahil) ve klan günlüğü. Klansız kullanıcıya keşif ligi.
 * Sayfa ilk render'ı aynı `getSquadOverview` ile sunucuda üretir; istemci yalnız yeniler.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSquadOverview } from '@/lib/squads/overview';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.squads.overview', roles: ['CUSTOMER'], module: 'squads', rateLimit: 'read' },
  async ({ user }) => ok(await getSquadOverview(user.id))
);
