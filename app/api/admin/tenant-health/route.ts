/**
 * EMEKLİ UÇ (mimari-api B11 — sahipsiz uç). Ağır tüm-bayi taraması (canlıda ~15 sn) yapan, hiçbir ekranın çağırmadığı sahipsiz uç; skor motoru churn-playbook iş akışında (lib/tenant-health) yaşamaya devam ediyor.
 * Tasarım sonrası hiçbir istemci bu yolu çağırmıyor; oran sınırsız ağır sorgu yüzeyi olarak
 * açık kalmasın diye 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

const gone = () => {
  throw new ApiError('GONE', 'Bayi sağlığı artık /admin/dealers-health ekranında hesaplanıyor.', { status: 410 });
};

export const GET = defineRoute({ name: 'admin.tenant-health.retired', roles: ['ADMIN'] }, gone);
