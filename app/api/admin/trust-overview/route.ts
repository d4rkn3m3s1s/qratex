/**
 * EMEKLİ: eski Trust komuta merkezi özeti. Yerine `GET /api/admin/trust/overview` (doğru sayımlar:
 * HIGH uyarılar dahil, bayraklı hesaplar rol kırılımlı). Tüketicisi kalmadı; 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.trust-overview.retired', roles: ['ADMIN'] }, () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı; /api/admin/trust/overview kullanın.', { status: 410 });
});
