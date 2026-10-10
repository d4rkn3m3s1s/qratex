import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { loadCustomerSettings, SettingsUserNotFoundError } from '@/lib/customer-settings/load.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/me/settings — Ayarlar okuma modeli (sayfa ile aynı yükleyici).
 * İstemci adası yalnız bir mutasyondan sonra ya da sunucu yüklemesi düştüğünde çağırır.
 * Okuma hatası "varsayılan değerler" olarak DÖNMEZ (zarf v2 hata + `retryable`).
 */
export const GET = defineRoute(
  { name: 'customer.me.settings.get', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user, session, request }) => {
    try {
      const snapshot = await loadCustomerSettings(user.id, {
        jti: (session as { jti?: string }).jti ?? null,
        userAgent: request.headers.get('user-agent'),
      });
      return ok(snapshot);
    } catch (err) {
      if (err instanceof SettingsUserNotFoundError) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
      throw err;
    }
  },
);
