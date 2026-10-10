import { permanentRedirect } from 'next/navigation';

/**
 * Emekli (§6.2 PARÇALA): /dealer/innovation → Pazarlama › Teklifler. Kısa süreli teklif burada;
 * segment taslakları Kampanyalar'a, masa sinyali Gelen Kutusu › Vakalar'a, haftalık özet Bugün'e
 * taşındı (Teklifler sayfası `from=innovation` ile yeni yerleri gösterir). Sorgu parametreleri korunur.
 */
export default async function RetiredDealerInnovationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null && k !== 'from') sp.append(k, x);
  sp.set('from', 'innovation');
  permanentRedirect(`/dealer/offers?${sp}`);
}
