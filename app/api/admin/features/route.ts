/**
 * EMEKLİ: serbest anahtarlı FeatureFlag CRUD'u. Bu uçla yazılan bayrakları hiçbir kod okumuyordu
 * (denetim raporu admin_features Bulgu 1). Yerine Özellik ve Deney Kontrolü:
 *   GET  /api/admin/feature-control/rollouts            → kademeli açılış kuralları + yetim bayraklar
 *   PUT  /api/admin/feature-control/rollouts/:key       → yalnız katalog modülü için kural
 *   POST /api/admin/feature-control/flags/:id/archive   → yetim bayrağı arşivle (silme yok)
 * Bütün metotlar 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

const gone = () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı. Özellik bayrakları artık /admin/features üzerinden modül açılış kuralı olarak yönetiliyor.', { status: 410 });
};

export const GET = defineRoute({ name: 'admin.features.retired.get', roles: ['ADMIN'] }, gone);
export const POST = defineRoute({ name: 'admin.features.retired.post', roles: ['ADMIN'] }, gone);
export const PUT = defineRoute({ name: 'admin.features.retired.put', roles: ['ADMIN'] }, gone);
export const PATCH = defineRoute({ name: 'admin.features.retired.patch', roles: ['ADMIN'] }, gone);
export const DELETE = defineRoute({ name: 'admin.features.retired.delete', roles: ['ADMIN'] }, gone);
