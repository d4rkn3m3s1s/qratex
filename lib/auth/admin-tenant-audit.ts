/**
 * Yöneticinin kiracılar arası erişim denetimi (guvenlik-bayi-api O6 ikinci yarısı).
 *
 * Yönetici, bayi uçlarını `?dealerId=` ile çağırarak HERHANGİ bir işletmenin verisini (müşteri
 * listesi, gelen kutusu, analitik…) okuyabilir. Gizli kapı API'de zorunlu (requireAuth) ama
 * "admin X, bayi Y'nin verisini görüntüledi" izi hiçbir yerde kalmıyordu. Bu modül her
 * `resolveDealerScope` admin çözümünde denetim kaydı yazar:
 *  - action `ADMIN_TENANT_ACCESS`, entity `Dealer`, entityId = bayi, newData = { context, method }.
 *  - Gürültü olmasın diye yönetici × bayi × bağlam başına `ADMIN_TENANT_AUDIT_WINDOW_MS` içinde
 *    TEK kayıt (paylaşılan Redis/DB sayacı). Sayaç altyapısı çökerse kayıt YİNE yazılır
 *    (denetim tarafına düşer); kayıt yazılamazsa istek düşmez (denetim yanıtı bozmaz).
 */
import { prisma } from '@/lib/prisma';

export const ADMIN_TENANT_ACCESS_ACTION = 'ADMIN_TENANT_ACCESS';
export const ADMIN_TENANT_AUDIT_WINDOW_MS = 30 * 60 * 1000;
/** Bütün işletmeleri kapsayan (bayi seçilmemiş) yönetici okuması için entityId. */
export const ADMIN_ALL_TENANTS = '*';

export interface AdminTenantAccess {
  adminId: string;
  dealerId: string;
  /** Uç/sayfa bağlamı (ör. defineRoute adı `dealer.customers.list`). */
  context?: string | null;
  method?: string | null;
}

function cleanContext(raw: string | null | undefined): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return /^[A-Za-z0-9_.:/-]{1,120}$/.test(v) ? v : 'unknown';
}

/** Kayıt yazıldıysa true; pencere içinde zaten yazılmışsa ya da yazılamadıysa false. Asla fırlatmaz. */
export async function recordAdminTenantAccess(input: AdminTenantAccess): Promise<boolean> {
  try {
    if (!input.adminId || !input.dealerId || input.adminId === input.dealerId) return false;
    const context = cleanContext(input.context);
    let first = true;
    try {
      const { checkRateLimitDb } = await import('@/lib/rate-limit');
      const rl = await checkRateLimitDb(
        `admin-tenant-audit:${input.adminId}:${input.dealerId}:${context}`,
        1,
        ADMIN_TENANT_AUDIT_WINDOW_MS
      );
      first = rl.ok;
    } catch {
      first = true; // sayaç yok → denetim tarafına düş
    }
    if (!first) return false;
    await prisma.auditLog.create({
      data: {
        userId: input.adminId,
        action: ADMIN_TENANT_ACCESS_ACTION,
        entity: 'Dealer',
        entityId: input.dealerId,
        newData: { context, method: input.method ? String(input.method).slice(0, 10).toUpperCase() : null },
      },
    });
    return true;
  } catch (err) {
    console.warn('[admin-tenant-audit] denetim kaydı yazılamadı:', err);
    return false;
  }
}
