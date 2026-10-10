import type { Metadata } from 'next';
import { isWallModuleEnabled, loadWallFeed, resolveDisplayToken } from '@/lib/dealer/voc-wall/server';
import { WallTvClient } from '@/components/dealer/b-voc-duvari/wall-tv-client';
import { WallNotice } from '@/components/dealer/b-voc-duvari/wall-notice';
import type { WallFeedDto } from '@/lib/dealer/voc-wall/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Müşteri sesi ekranı',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * Mağaza TV'si — oturumsuz, salt-okunur, iptal edilebilir bağlantı (`/dealer/voc-wall` →
 * "Ekran bağlantıları"). Bayi panelinin hiçbir parçası yüklenmez; yalnız yayınlanabilir alanlar.
 * Kritik veri sunucuda yüklenir; istemci yalnız arka plan yenilemesi yapar.
 */
export default async function WallDisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let feed: WallFeedDto;
  try {
    const resolved = await resolveDisplayToken(token);
    if (!resolved.ok) {
      return (
        <WallNotice
          title={resolved.reason === 'expired' ? 'Bu ekran bağlantısının süresi doldu.' : 'Bu ekran bağlantısı geçerli değil.'}
          description="İşletme yöneticisi Müşteri sesi duvarı sayfasından yeni bir ekran bağlantısı oluşturabilir."
        />
      );
    }
    if (!(await isWallModuleEnabled())) {
      return <WallNotice title="Müşteri sesi ekranı şu an kapalı." description="Bu özellik geçici olarak devre dışı." />;
    }
    feed = await loadWallFeed(resolved.dealerId, resolved.config, resolved.display.qrCodeId);
  } catch (err) {
    console.error('[wall] ekran yüklenemedi', err);
    return <WallNotice title="Ekran şu an yüklenemedi." description="Birkaç saniye sonra sayfayı yenileyin." />;
  }
  return <WallTvClient token={token} initial={feed} />;
}
