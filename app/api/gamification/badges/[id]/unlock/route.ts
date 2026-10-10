import { defineRoute, ApiError } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/gamification/badges/[id]/unlock — KAPALI (410 Gone).
 *
 * Ürün kararı "TAM SÜRPRİZ" (Didar): müşteri hiçbir rozeti önden görmez, rozetler yalnız
 * davranışla kazanılır — puanla satın alma yok. Arayüzde bu yola giden düğme yıllardır
 * erişilemezdi (yalnız kazanılmış rozetler listeleniyor), ama uç canlıydı: API'yi doğrudan
 * çağıran biri katalogdaki `pointCost`'lu her gizli-olmayan rozeti satın alabiliyordu ve
 * sonra o rozeti davranışla kazandığında ödül puanı (`badgeRewardPoints`) kalıcı olarak
 * yanıyordu (`awardBadge` ALREADY_OWNED → kredi yok). Denetim: customer_badges Bulgu 2.
 *
 * Rozet mağazası ileride geri gelecekse açık bir özellik bayrağı arkasında, ayrı bir
 * `defineRoute` ucuyla ve `awardBadge({ source: 'purchase', reward: 'none' })` + `debitPoints`
 * aynı transaction'da yeniden yazılmalı (önceki uygulama git geçmişinde).
 */
export const POST = defineRoute(
  {
    name: 'gamification.badges.unlock',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
  },
  async () => {
    throw new ApiError('BADGE_SHOP_DISABLED', 'Rozetler puanla açılamaz; yalnızca kazanılarak açılır.', { status: 410 });
  },
);
