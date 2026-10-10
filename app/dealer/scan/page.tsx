import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { getServerLocale } from '@/lib/server-locale';
import { loadKasaBootstrap } from '@/lib/dealer/kasa/server';
import type { KasaBootstrap } from '@/lib/dealer/kasa/types';
import { ErrorState } from '@/components/states';
import { KasaScreen } from '@/components/dealer/b-kasa-tuketim/kasa-screen';
import { KasaLoadError } from '@/components/dealer/b-kasa-tuketim/load-error';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Till', description: 'Scan the customer card, record the purchase, undo mistakes within 15 minutes.' }
    : { title: 'Kasa', description: 'Müşteri kartını okut, işlemi kaydet, hatalı kaydı 15 dakika içinde geri al.' };
}

/**
 * Bayi → Kasa modu (yol haritası; denetim raporu docs/audit/2026-10-08/bayi/dealer_scan.md).
 *
 * Sunucu önce: ürün kataloğu, hızlı tuşlar ve "bugün" akışı (özet + son 10 işlem) tek seferde
 * sunucuda yüklenir; istemci adası yalnız kamera/form/kuyruk etkileşimini taşır. Yükleme
 * başarısızsa görünür hata + yeniden dene (sıfır/boş liste uydurulmaz).
 */
export default async function DealerScanPage() {
  const auth = await requireAuth(['DEALER', 'STAFF']);
  if ('error' in auth) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" />
      </div>
    );
  }
  const scope = await resolveDealerScope(auth.session, { allowRoles: ['DEALER', 'STAFF'] });
  if (!scope.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ErrorState kind="forbidden" description={scope.message} />
      </div>
    );
  }

  let initial: KasaBootstrap | null = null;
  try {
    initial = await loadKasaBootstrap(scope.dealerId, scope.actorRole === 'STAFF' ? 'STAFF' : 'DEALER');
  } catch (err) {
    console.error('[dealer/scan] kasa açılışı yüklenemedi:', err);
  }
  if (!initial) return <KasaLoadError />;
  return <KasaScreen initial={initial} />;
}
