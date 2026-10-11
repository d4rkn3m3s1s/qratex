/**
 * EMEKLİ UÇ (mimari-api B11 — sahipsiz uç). Tüm bayiler için ilk-AI-analizi taraması (canlıda ~11 sn) yapan, hiçbir ekranın çağırmadığı sahipsiz uç.
 * Tasarım sonrası hiçbir istemci bu yolu çağırmıyor; oran sınırsız ağır sorgu yüzeyi olarak
 * açık kalmasın diye 410 döner.
 */
import { ApiError, defineRoute } from '@/lib/http/define-route';

const gone = () => {
  throw new ApiError('GONE', 'Bu uç kaldırıldı.', { status: 410 });
};

export const GET = defineRoute({ name: 'admin.onboarding.install-to-value.retired', roles: ['ADMIN'] }, gone);
