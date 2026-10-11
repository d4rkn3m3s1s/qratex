import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { getPricingOverview } from '@/lib/admin-pricing/pricing.server';
import type { PricingOverview } from '@/lib/admin-pricing/contract';
import { PricingConsole } from '@/components/admin/a-fiyatlandirma/pricing-console';

/**
 * Admin → Planlar ve fiyatlandırma (/admin/pricing).
 *
 * Sunucu önce: plan listesi, abone/MRR ve Stripe durumu sunucuda okunur; istemci adası
 * `initial` ile açılır. Ön yükleme düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("boş liste" gibi görünmez).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planlar ve fiyatlandırma',
  description: 'Abonelik planları, limitler, özellik matrisi, Stripe fiyat eşlemesi ve arşiv.',
};

export default async function AdminPricingPage() {
  let initial: PricingOverview | null = null;
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await getPricingOverview();
    } catch (err) {
      console.error('[admin/pricing] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return <PricingConsole initial={initial} />;
}
