/**
 * `GET /api/dealer/settings` — Ayarlar okuma modeli (İşletme, Hesabım, AI, bildirim cihazları,
 * Güvenlik). Sayfa ilk yüklemede aynı veriyi sunucuda üretir; bu uç istemci adasının
 * yeniden yükleme / "güncel hâli yükle" yolu. Yan etki yok, LLM yok.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadDealerSettings } from '@/lib/dealer-settings/load.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.settings.get', roles: ['DEALER'], rateLimit: { max: 120, windowMs: 60_000, by: 'user' } },
  async ({ user, session, request }) => {
    const snapshot = await loadDealerSettings(user.id, {
      jti: (session as { jti?: string }).jti ?? null,
      userAgent: request.headers.get('user-agent'),
    });
    return ok(snapshot);
  }
);
