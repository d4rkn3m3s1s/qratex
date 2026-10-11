/**
 * EMEKLİ: eski 48 saatlik birleşik zaman çizelgesi (kırık bağlantılar, mükerrer satırlar).
 * Yerine `GET /api/admin/trust/cases` ve `GET /api/admin/trust/alerts`. Tüketicisi kalmadı; 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.trust-timeline.retired', roles: ['ADMIN'] }, () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı; /api/admin/trust/cases ve /api/admin/trust/alerts kullanın.', { status: 410 });
});
