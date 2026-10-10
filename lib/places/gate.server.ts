/**
 * Keşfet erişim kapısı — API seviyesinde (menü gizlemek yetmez; denetim: discovery ucu kapılıydı,
 * innovation/kampanya/etkinlik uçları kapısızdı). Sayfa ve BFF aynı kararı kullanır.
 *
 *  - `places`: müşteri menüsünde "nearby" (Keşfet) görünür + `discovery` modülü açık (rol: customer).
 *  - `deals`: yukarıdakine ek olarak `customer_campaigns` modülü açık.
 */
import { ApiError } from '@/lib/http/define-route';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';

export type PlacesGatePart = 'places' | 'deals';

type GateRequest = { headers: { get(name: string): string | null } };

export async function assertPlacesAccess(userId: string, request: GateRequest | undefined, part: PlacesGatePart = 'places'): Promise<void> {
  const ctx = { userId, request, routeKey: '/customer/places' };
  const menu = await assertMenuItemVisible('nearby', 'customer', ctx);
  if (menu) throw new ApiError('MODULE_DISABLED', 'Keşfet bölümü yönetici tarafından geçici olarak kapatıldı.');
  const discovery = await assertModuleEnabled('discovery', { ...ctx, role: 'customer' });
  if (discovery) throw new ApiError('MODULE_DISABLED', 'Keşfet bölümü yönetici tarafından geçici olarak kapatıldı.');
  if (part === 'deals') {
    const campaigns = await assertModuleEnabled('customer_campaigns', { ...ctx, role: 'customer' });
    if (campaigns) throw new ApiError('MODULE_DISABLED', 'Fırsatlar yönetici tarafından geçici olarak kapatıldı.');
  }
}

/**
 * Sunucu bileşeni için kapı kararı (API ile aynı kurallar). Kapı dışı bir hata (ör. olay
 * yazılamadı) görünümü kilitlemez; veri uçları kararı ayrıca uygular.
 */
export async function resolvePlacesAccess(userId: string): Promise<{ places: boolean; deals: boolean }> {
  const check = async (part: PlacesGatePart) => {
    try {
      await assertPlacesAccess(userId, undefined, part);
      return true;
    } catch (e) {
      return !(e instanceof ApiError);
    }
  };
  const places = await check('places');
  if (!places) return { places: false, deals: false };
  return { places, deals: await check('deals') };
}
