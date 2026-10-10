/**
 * Müşteri modül kapısı — API ve sayfa aynı kararı verir (spending-overview B2, donations B2).
 * Hem genel modül anahtarı hem müşteri rolüne özel görünürlük hem de menü gizleme kontrol edilir.
 */
import { ApiError } from '@/lib/http/define-route';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';

type GateContext = { userId?: string | null; request?: { headers: { get(name: string): string | null } }; routeKey?: string };

/** Kapalıysa true. Asla fırlatmaz (DB hatasında modül-gate kendi varsayılanına düşer). */
export async function isCustomerModuleBlocked(moduleKey: string, menuKey: string | null, ctx: GateContext = {}): Promise<boolean> {
  try {
    const blocked = await assertModuleEnabled(moduleKey, { role: 'customer', ...ctx });
    if (blocked) return true;
    if (menuKey) {
      const hidden = await assertMenuItemVisible(menuKey, 'customer', ctx);
      if (hidden) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** API içinde: kapalıysa 403 `MODULE_DISABLED` fırlatır. */
export async function assertCustomerModule(moduleKey: string, menuKey: string | null, ctx: GateContext = {}): Promise<void> {
  if (await isCustomerModuleBlocked(moduleKey, menuKey, ctx)) throw new ApiError('MODULE_DISABLED');
}
