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
  // JSX try/catch DIŞINDA kurulur (react-hooks/error-boundaries): try yalnız veriyi çözer.
  let outcome:
    | { kind: 'ok'; feed: WallFeedDto }
    | { kind: 'notice'; title: string; description: string };
  try {
    const resolved = await resolveDisplayToken(token);
    if (!resolved.ok) {
      outcome = {
        kind: 'notice',
        title: resolved.reason === 'expired' ? 'Bu ekran bağlantısının süresi doldu.' : 'Bu ekran bağlantısı geçerli değil.',
        description: 'İşletme yöneticisi Müşteri sesi duvarı sayfasından yeni bir ekran bağlantısı oluşturabilir.',
      };
    } else if (!(await isWallModuleEnabled())) {
      outcome = { kind: 'notice', title: 'Müşteri sesi ekranı şu an kapalı.', description: 'Bu özellik geçici olarak devre dışı.' };
    } else {
      outcome = { kind: 'ok', feed: await loadWallFeed(resolved.dealerId, resolved.config, resolved.display.qrCodeId) };
    }
  } catch (err) {
    console.error('[wall] ekran yüklenemedi', err);
    outcome = { kind: 'notice', title: 'Ekran şu an yüklenemedi.', description: 'Birkaç saniye sonra sayfayı yenileyin.' };
  }
  if (outcome.kind === 'notice') return <WallNotice title={outcome.title} description={outcome.description} />;
  return <WallTvClient token={token} initial={outcome.feed} />;
}
